/**
 * @description       : Fills Source_Cache__c, the View source and docs cache.
 *                      It reads every Source_File__mdt path from GitHub on main
 *                      through GitHubService and upserts one row per path. A path is due when it
 *                      has no row or its last check is REFRESH_HOURS old, so each file is read
 *                      at most once a day, a failing one included. A failed read keeps the
 *                      newest good content and only records the check and the status. All
 *                      callouts happen before any write. A file longer than one row holds is
 *                      stored across up to MAX_PARTS rows, cut inside a top level heading's ##
 *                      where one fits, else between two visible characters, never next to
 *                      whitespace because the field drops it there, and SourceController joins the parts
 *                      on read. The first part keeps the file's own path and each later part
 *                      takes the path plus PART_MARKER and its number. A file longer than every
 *                      part together is cut and marked truncated. Rows for paths no longer
 *                      configured, and parts a shorter file no longer needs, are deleted.
 *                      IntegrationCacheRefreshScheduler enqueues it on
 *                      its existing schedule only when isDue() is true, so no new schedule and
 *                      no new Setup step is needed. It runs as the admin who scheduled that job.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 * @Test Class        : [SourceCacheRefreshJobTest]
 **/
public with sharing class SourceCacheRefreshJob implements Queueable, Database.AllowsCallouts {
  public static final String OUTCOME_REFRESHED = 'refreshed';
  public static final String OUTCOME_NOT_DUE = 'skipped_not_due';
  public static final String OUTCOME_NO_CONFIG = 'skipped_no_config';
  public static final String OUTCOME_OPEN_CIRCUIT = 'skipped_open_circuit';
  public static final String OUTCOME_FAILED = 'failed';

  // The next three are code defaults. The Source_Refresh_Hours, Source_Content_Max_Length
  // and Source_Max_Files_Per_Run settings give the values in force.
  public static final Integer REFRESH_HOURS = 24;
  /** Source_Cache__c.Content__c length, so the setting's range stops there too. */
  public static final Integer CONTENT_MAX_LENGTH = 131072;
  /** Callouts per run, under the limit of 100 with room for the other work. */
  public static final Integer MAX_FILES_PER_RUN = 90;
  public static final String STATUS_OK = '200';
  /** Rows one file may fill. At the field length that is a megabyte, the contents API's own limit. */
  public static final Integer MAX_PARTS = 8;
  /** Joins a file's path and a part number, for example docs/guides/03-SAS.md#part-2. */
  public static final String PART_MARKER = '#part-';
  private static final Integer STATUS_MAX_LENGTH = 80;
  private static final String TOP_HEADING = '\n## ';
  private static final Integer HIGH_SURROGATE_FIRST = 55296;
  private static final Integer HIGH_SURROGATE_LAST = 56319;

  /**
   * @description Queueable entry point. Runs refresh().
   * @param context Queueable context.
   */
  public void execute(QueueableContext context) {
    refresh();
  }

  /**
   * @description Whether any configured path is due. One query, no callout, so the
   *              scheduler can ask four times an hour for nothing.
   * @return Boolean True when a path has no row or a check older than REFRESH_HOURS.
   */
  public static Boolean isDue() {
    return !duePaths(configuredPaths()).isEmpty();
  }

  /**
   * @description One refresh: due paths, config, breaker, the callouts, then the writes.
   * @return String One of the OUTCOME_ constants.
   */
  public static String refresh() {
    Set<String> configured = configuredPaths();
    List<String> due = duePaths(configured);
    if (due.isEmpty()) {
      deleteStale(configured, new Map<String, Integer>());
      return OUTCOME_NOT_DUE;
    }
    Portfolio_Config__mdt config = config();
    if (config == null || String.isBlank(config.GitHub_Repo_Path__c)) {
      PortfolioLog.info(
        'SourceCacheRefreshJob: no Portfolio_Config__mdt record with a GitHub_Repo_Path__c, nothing refreshed.'
      );
      return OUTCOME_NO_CONFIG;
    }
    if (CircuitBreaker.isOpen(CircuitBreaker.KEY_GITHUB)) {
      return OUTCOME_OPEN_CIRCUIT;
    }

    Datetime checkedAt = System.now();
    List<Source_Cache__c> rows = new List<Source_Cache__c>();
    Map<String, Integer> partsByPath = new Map<String, Integer>();
    Integer failures = 0;
    for (String path : due) {
      List<Source_Cache__c> fileRows = read(
        config.GitHub_Repo_Path__c,
        path,
        checkedAt
      );
      if (fileRows[0].Last_Status__c == STATUS_OK) {
        partsByPath.put(path, fileRows.size());
      } else {
        failures++;
      }
      rows.addAll(fileRows);
    }

    // Every write follows every callout, because Apex refuses a callout after DML.
    upsert as system rows Path__c;
    deleteStale(configured, partsByPath);
    if (failures == due.size()) {
      CircuitBreaker.recordFailure(CircuitBreaker.KEY_GITHUB);
      return OUTCOME_FAILED;
    }
    CircuitBreaker.recordSuccess(CircuitBreaker.KEY_GITHUB);
    return OUTCOME_REFRESHED;
  }

  /**
   * @description The cache path of one part of a file. Part 1 is the file's own path.
   * @param path The file's repository path.
   * @param part 1 to MAX_PARTS.
   * @return String For example docs/guides/03-SAS.md#part-2.
   */
  public static String partPath(String path, Integer part) {
    return part <= 1 ? path : path + PART_MARKER + part;
  }

  /**
   * @description Cuts text into pieces no longer than maxLength, at the place cutPoint
   *              picks, never inside a surrogate pair. Joined in order the pieces give the
   *              text back. Stops one piece past MAX_PARTS, so a caller can tell the text did
   *              not fit.
   * @param content The file's text. Null is treated as empty.
   * @param maxLength The longest piece, at least 2.
   * @return List<String> At least one piece.
   */
  @TestVisible
  private static List<String> splitContent(String content, Integer maxLength) {
    List<String> parts = new List<String>();
    String rest = content ?? '';
    while (rest.length() > maxLength && parts.size() <= MAX_PARTS) {
      Integer cut = cutPoint(rest.left(maxLength));
      parts.add(rest.left(cut));
      rest = rest.substring(cut);
    }
    parts.add(rest);
    return parts;
  }

  /**
   * @description Where to cut. A long text field drops whitespace at the end of a value, so
   *              a cut never leaves whitespace on either side of it, or the parts would not
   *              join back to the file. Before a top level heading that means between the
   *              two # signs, else between the last two visible characters that are not a
   *              surrogate pair.
   */
  private static Integer cutPoint(String window) {
    Integer heading = window.lastIndexOf(TOP_HEADING);
    if (heading > 0) {
      return heading + 2;
    }
    for (Integer i = window.length() - 1; i > 0; i--) {
      Integer before = window.charAt(i - 1);
      if (
        !isSpace(before) &&
        !isSpace(window.charAt(i)) &&
        !isHighSurrogate(before)
      ) {
        return i;
      }
    }
    Integer cut = window.length();
    return isHighSurrogate(window.charAt(cut - 1)) ? cut - 1 : cut;
  }

  private static Boolean isSpace(Integer character) {
    return character == 32 ||
      character == 9 ||
      character == 10 ||
      character == 13;
  }

  private static Boolean isHighSurrogate(Integer character) {
    return character >= HIGH_SURROGATE_FIRST &&
      character <= HIGH_SURROGATE_LAST;
  }

  /**
   * @description Reads one file into its rows, the first part first. The callout happens
   *              inside a loop on purpose: one file per request is how the contents API
   *              works, and the loop is capped at MAX_FILES_PER_RUN. A failed read returns
   *              only the first row with the check and the status, so every part keeps its
   *              newest good content.
   */
  private static List<Source_Cache__c> read(
    String repoPath,
    String path,
    Datetime checkedAt
  ) {
    Source_Cache__c row = new Source_Cache__c(
      Path__c = path,
      Checked_At__c = checkedAt
    );
    List<Source_Cache__c> rows = new List<Source_Cache__c>{ row };
    try {
      GitHubService.FileContent file = GitHubService.fetchFile(repoPath, path);
      Integer maxLength = PortfolioSettings.getInteger(
        'Source_Content_Max_Length',
        CONTENT_MAX_LENGTH
      );
      List<String> parts = splitContent(file.content ?? '', maxLength);
      row.Truncated__c = parts.size() > MAX_PARTS;
      for (Integer i = 0; i < parts.size() && i < MAX_PARTS; i++) {
        Source_Cache__c part = i == 0
          ? row
          : new Source_Cache__c(
              Path__c = partPath(path, i + 1),
              Checked_At__c = checkedAt,
              Truncated__c = false
            );
        part.Content__c = parts[i];
        part.Html_Url__c = file.htmlUrl;
        part.Fetched_At__c = checkedAt;
        part.Last_Status__c = STATUS_OK;
        if (i > 0) {
          rows.add(part);
        }
      }
    } catch (GitHubService.GitHubServiceException e) {
      // Recovered on purpose: the newest good content keeps serving.
      row.Last_Status__c = e.getMessage().left(STATUS_MAX_LENGTH);
    } catch (CalloutException e) {
      row.Last_Status__c = ('Callout failed: ' + e.getTypeName())
        .left(STATUS_MAX_LENGTH);
    }
    return rows;
  }

  private static Set<String> configuredPaths() {
    Set<String> paths = new Set<String>();
    for (Source_File__mdt file : SourceController.configuredFiles()) {
      paths.add(file.Path__c.trim());
    }
    return paths;
  }

  private static List<String> duePaths(Set<String> configured) {
    List<String> due = new List<String>();
    if (configured.isEmpty()) {
      return due;
    }
    Datetime staleBefore = System.now()
      .addHours(
        -PortfolioSettings.getInteger('Source_Refresh_Hours', REFRESH_HOURS)
      );
    Integer maxFiles = PortfolioSettings.getInteger(
      'Source_Max_Files_Per_Run',
      MAX_FILES_PER_RUN
    );
    Map<String, Datetime> checkedByPath = new Map<String, Datetime>();
    for (Source_Cache__c row : [
      SELECT Path__c, Checked_At__c
      FROM Source_Cache__c
      WHERE Path__c IN :configured
      WITH SYSTEM_MODE
    ]) {
      checkedByPath.put(row.Path__c, row.Checked_At__c);
    }
    List<String> sorted = new List<String>(configured);
    sorted.sort();
    for (String path : sorted) {
      Datetime checked = checkedByPath.get(path);
      if (checked == null || checked < staleBefore) {
        due.add(path);
      }
      if (due.size() == maxFiles) {
        break;
      }
    }
    return due;
  }

  /**
   * @description Deletes every row that is neither a configured path nor a part it still
   *              uses. A file read in this run keeps the parts it just wrote. A file not read,
   *              or read and failed, keeps every part it may have.
   */
  private static void deleteStale(
    Set<String> configured,
    Map<String, Integer> partsByPath
  ) {
    Set<String> keep = new Set<String>();
    for (String path : configured) {
      Integer parts = partsByPath.containsKey(path)
        ? partsByPath.get(path)
        : MAX_PARTS;
      for (Integer part = 1; part <= parts; part++) {
        keep.add(partPath(path, part));
      }
    }
    List<Source_Cache__c> stale = [
      SELECT Id
      FROM Source_Cache__c
      WHERE Path__c NOT IN :keep
      WITH SYSTEM_MODE
      LIMIT 200
    ];
    if (!stale.isEmpty()) {
      delete as system stale;
    }
  }

  // Tests set these to stand in for the org's record, or for its absence.
  @TestVisible
  private static Boolean configOverridden = false;
  @TestVisible
  private static Portfolio_Config__mdt configOverride;

  private static Portfolio_Config__mdt config() {
    return configOverridden ? configOverride : PortfolioService.getConfig();
  }
}
