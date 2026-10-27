/**
 * @description       : Takes the storage snapshot the footer's storage panel shows. It reads the
 *                      org's data and file storage from OrgLimits, estimates the data by area
 *                      from a record count per object times 2 KB (Salesforce shows storage by
 *                      object only on the Setup page, so the figure is labelled an estimate),
 *                      sums file sizes by kind, and reads the last seven days of site usage
 *                      from the Site_Usage_Last_30_Days report. Then StorageSnapshot.save()
 *                      overwrites the one stored record. Only aggregates are kept, and objects
 *                      are grouped into areas so no single object, Lead included, gets a row.
 *                      IntegrationCacheRefreshScheduler enqueues it on its existing schedule
 *                      only when StorageSnapshot.isDue() is true, so no new schedule is needed.
 *                      It runs as the admin who scheduled that job, and every query runs in
 *                      system mode because the figures are org totals. A part that cannot be
 *                      read is left out and the rest is still saved.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/27/2026
 * @Test Class        : [StorageSnapshotJobTest]
 **/
public with sharing class StorageSnapshotJob implements Queueable {
  /** Kilobytes Salesforce counts for most records. */
  public static final Integer KB_PER_RECORD = 2;
  public static final String REPORT_NAME = 'Site_Usage_Last_30_Days';
  public static final Integer TRAFFIC_DAYS = 7;
  public static final String FILES_OTHER = 'Other files';
  public static final String FILES_ATTACHED = 'Documents and attachments';

  /** The areas, in the order the panel lists them: the label, then the objects counted in it. */
  @TestVisible
  private static final List<List<String>> AREA_DEFINITIONS = new List<List<String>>{
    new List<String>{
      'Site content',
      'Project__c',
      'Project_Asset__c',
      'Project_Skill__c',
      'Skill__c',
      'Experience__c',
      'Experience_Highlight__c',
      'Experience_Skill__c',
      'Education__c',
      'Certification__c',
      'Certification_Skill__c'
    },
    new List<String>{
      'API and rate limiting',
      'API_Rate_Window__c',
      'API_Access_Request__c',
      'Usage_Counter__c',
      'Circuit_Breaker_State__c'
    },
    new List<String>{
      'Contact and testimonials',
      'Lead',
      'Contact',
      'Testimonial__c',
      'Contact_Form_Failure__c',
      'Submission_Block__c'
    },
    new List<String>{
      'Delivery telemetry',
      'Github_Cache__c',
      'Jira_Cache__c',
      'Pipeline_Run__c',
      'Source_Cache__c',
      'Storage_Snapshot__c'
    }
  };

  private static final Set<String> IMAGE_TYPES = new Set<String>{
    'png',
    'jpg',
    'jpeg',
    'gif',
    'svg',
    'webp',
    'avif'
  };
  private static final Set<String> DOCUMENT_TYPES = new Set<String>{
    'pdf',
    'doc',
    'docx',
    'txt',
    'md',
    'csv',
    'xls',
    'xlsx'
  };
  private static final String IMAGES = 'Images';
  private static final String DOCUMENTS = 'PDFs and text';

  /** One usage reading from the report. */
  public class TrafficRow {
    public String limitType;
    public Date day;
    public Decimal usage;
    public TrafficRow(String limitType, Date day, Decimal usage) {
      this.limitType = limitType;
      this.day = day;
      this.usage = usage;
    }
  }

  // Tests set these to control the parts that need the whole org.
  @TestVisible
  private static Map<String, System.OrgLimit> orgLimitsOverride;
  @TestVisible
  private static List<TrafficRow> trafficRowsOverride;
  @TestVisible
  private static Boolean throwOnBuild = false;

  /**
   * @description Queueable entry point. Builds and saves one snapshot.
   * @param context Queueable context.
   */
  public void execute(QueueableContext context) {
    refresh();
  }

  /**
   * @description Builds a snapshot and overwrites the stored one. A failure is logged and
   *              leaves the last good snapshot in place.
   * @return Boolean True when a snapshot was saved.
   */
  public static Boolean refresh() {
    try {
      if (throwOnBuild) {
        throw new QueryException('Forced failure for the error path test.');
      }
      StorageSnapshot.save(build());
      return true;
    } catch (Exception e) {
      PortfolioLog.info(
        'StorageSnapshotJob: no snapshot saved, ' + e.getTypeName()
      );
      return false;
    }
  }

  /**
   * @description Reads every part of the snapshot, none of it stored.
   * @return StorageSnapshot.Snapshot The figures as of now.
   */
  public static StorageSnapshot.Snapshot build() {
    StorageSnapshot.Snapshot snapshot = new StorageSnapshot.Snapshot();
    snapshot.capturedAt = Datetime.now();
    Map<String, System.OrgLimit> limitsByName = orgLimits();
    snapshot.dataUsedMb = valueOf(limitsByName, 'DataStorageMB');
    snapshot.dataMaxMb = limitOf(limitsByName, 'DataStorageMB');
    snapshot.fileUsedMb = valueOf(limitsByName, 'FileStorageMB');
    snapshot.fileMaxMb = limitOf(limitsByName, 'FileStorageMB');
    snapshot.dataAreas = dataAreas();
    snapshot.fileGroups = fileGroups();
    snapshot.traffic = traffic(readTrafficRows(), Date.today());
    return snapshot;
  }

  /**
   * @description The data areas, each with the records its objects hold and the estimate.
   *              An object the org does not have counts as none.
   * @return List<StorageSnapshot.Area> One entry per area, in AREA_DEFINITIONS order.
   */
  public static List<StorageSnapshot.Area> dataAreas() {
    List<StorageSnapshot.Area> areas = new List<StorageSnapshot.Area>();
    for (List<String> definition : AREA_DEFINITIONS) {
      Integer records = 0;
      for (Integer i = 1; i < definition.size(); i++) {
        records += countRecords(definition[i]);
      }
      StorageSnapshot.Area area = new StorageSnapshot.Area();
      area.label = definition[0];
      area.records = records;
      area.kb = records * KB_PER_RECORD;
      areas.add(area);
    }
    return areas;
  }

  /**
   * @description File sizes in kilobytes by kind: images, PDFs and text, other files, and
   *              the older documents and attachments. Empty kinds are left out.
   * @return List<StorageSnapshot.Area> The kinds, largest first.
   */
  public static List<StorageSnapshot.Area> fileGroups() {
    Map<String, Long> bytesByGroup = new Map<String, Long>();
    for (AggregateResult row : [
      SELECT FileExtension extension, SUM(ContentSize) bytes
      FROM ContentVersion
      WHERE IsLatest = TRUE
      WITH SYSTEM_MODE
      GROUP BY FileExtension
    ]) {
      String kind = groupOf((String) row.get('extension'));
      Long bytes = Long.valueOf(String.valueOf(row.get('bytes') ?? 0));
      bytesByGroup.put(kind, bytes + (bytesByGroup.get(kind) ?? 0L));
    }
    Long attached = attachedBytes();
    if (attached > 0) {
      bytesByGroup.put(FILES_ATTACHED, attached);
    }
    List<StorageSnapshot.Area> kinds = new List<StorageSnapshot.Area>();
    for (String kind : bytesByGroup.keySet()) {
      StorageSnapshot.Area area = new StorageSnapshot.Area();
      area.label = kind;
      area.kb = Math.max(1, (Integer) (bytesByGroup.get(kind) / 1024L));
      kinds.add(area);
    }
    kinds.sort(new LargestFirst());
    return kinds;
  }

  /**
   * @description Sums the readings into one entry per day for the last TRAFFIC_DAYS days.
   * @param rows Readings from the report.
   * @param today The date counted as today.
   * @return List<StorageSnapshot.TrafficDay> Newest first, empty when there are no rows.
   */
  public static List<StorageSnapshot.TrafficDay> traffic(
    List<TrafficRow> rows,
    Date today
  ) {
    Map<Date, StorageSnapshot.TrafficDay> daysByDate = new Map<Date, StorageSnapshot.TrafficDay>();
    for (TrafficRow row : rows) {
      if (
        row.day == null ||
        row.usage == null ||
        row.day > today ||
        row.day <= today.addDays(-TRAFFIC_DAYS)
      ) {
        continue;
      }
      StorageSnapshot.TrafficDay entry = daysByDate.get(row.day);
      if (entry == null) {
        entry = new StorageSnapshot.TrafficDay();
        entry.day = row.day;
        daysByDate.put(row.day, entry);
      }
      addReading(entry, row);
    }
    List<Date> dates = new List<Date>(daysByDate.keySet());
    dates.sort();
    List<StorageSnapshot.TrafficDay> days = new List<StorageSnapshot.TrafficDay>();
    for (Integer i = dates.size() - 1; i >= 0; i--) {
      days.add(daysByDate.get(dates[i]));
    }
    return days;
  }

  // Origin and cache, bandwidth and page views. Any other limit type is ignored.
  private static void addReading(
    StorageSnapshot.TrafficDay entry,
    TrafficRow row
  ) {
    String type = (row.limitType ?? '').toLowerCase();
    Boolean origin = type.contains('origin');
    Boolean cache = type.contains('cache');
    if (type.contains('bandwidth')) {
      entry.originBandwidth += origin ? row.usage : 0;
      entry.cacheBandwidth += cache ? row.usage : 0;
    } else if (type.contains('page view')) {
      entry.originPageViews += origin ? row.usage : 0;
      entry.cachePageViews += cache ? row.usage : 0;
    }
  }

  // The report's rows, or none when it cannot be found or run. The footer then has no traffic.
  private static List<TrafficRow> readTrafficRows() {
    if (trafficRowsOverride != null) {
      return trafficRowsOverride;
    }
    List<TrafficRow> rows = new List<TrafficRow>();
    try {
      List<Report> found = [
        SELECT Id
        FROM Report
        WHERE DeveloperName = :REPORT_NAME
        LIMIT 1
      ];
      if (found.isEmpty()) {
        return rows;
      }
      Reports.ReportResults results = Reports.ReportManager.runReport(
        found[0].Id,
        true
      );
      collectRows(results, rows);
    } catch (Exception e) {
      PortfolioLog.info(
        'StorageSnapshotJob: site usage report not read, ' + e.getTypeName()
      );
    }
    return rows;
  }

  // Site, then limit type, then day: the report's three groupings down.
  private static void collectRows(
    Reports.ReportResults results,
    List<TrafficRow> rows
  ) {
    Map<String, Reports.ReportFact> facts = results.getFactMap();
    for (
      Reports.GroupingValue site : results.getGroupingsDown().getGroupings()
    ) {
      for (Reports.GroupingValue type : site.getGroupings()) {
        for (Reports.GroupingValue day : type.getGroupings()) {
          Reports.ReportFact fact = facts.get(day.getKey() + '!T');
          if (fact == null || fact.getAggregates().isEmpty()) {
            continue;
          }
          Object value = day.getValue();
          Object usage = fact.getAggregates()[0].getValue();
          rows.add(
            new TrafficRow(
              type.getLabel(),
              value instanceof Date ? (Date) value : null,
              usage == null ? null : Decimal.valueOf(String.valueOf(usage))
            )
          );
        }
      }
    }
  }

  // Dynamic on purpose: the names come from AREA_DEFINITIONS, never from a caller. A name the org does
  // not have throws QueryException and counts as none.
  private static Integer countRecords(String objectName) {
    try {
      return Database.countQuery(
        'SELECT COUNT() FROM ' + objectName + ' WITH SYSTEM_MODE'
      );
    } catch (QueryException e) {
      return 0;
    }
  }

  private static Long attachedBytes() {
    Long total = 0L;
    for (String objectName : new List<String>{ 'Document', 'Attachment' }) {
      try {
        List<AggregateResult> rows = Database.query(
          'SELECT SUM(BodyLength) bytes FROM ' +
            objectName +
            ' WITH SYSTEM_MODE'
        );
        Object bytes = rows.isEmpty() ? null : rows[0].get('bytes');
        total += bytes == null ? 0L : Long.valueOf(String.valueOf(bytes));
      } catch (QueryException e) {
        continue;
      }
    }
    return total;
  }

  private static String groupOf(String extension) {
    String type = (extension ?? '').toLowerCase();
    if (IMAGE_TYPES.contains(type)) {
      return IMAGES;
    }
    return DOCUMENT_TYPES.contains(type) ? DOCUMENTS : FILES_OTHER;
  }

  private static Map<String, System.OrgLimit> orgLimits() {
    try {
      return orgLimitsOverride != null ? orgLimitsOverride : OrgLimits.getMap();
    } catch (Exception e) {
      return new Map<String, System.OrgLimit>();
    }
  }

  private static Decimal valueOf(
    Map<String, System.OrgLimit> byName,
    String key
  ) {
    return byName.containsKey(key) ? byName.get(key).getValue() : null;
  }

  private static Decimal limitOf(
    Map<String, System.OrgLimit> byName,
    String key
  ) {
    return byName.containsKey(key) ? byName.get(key).getLimit() : null;
  }

  private class LargestFirst implements System.Comparator<StorageSnapshot.Area> {
    public Integer compare(StorageSnapshot.Area a, StorageSnapshot.Area b) {
      return b.kb - a.kb;
    }
  }
}
