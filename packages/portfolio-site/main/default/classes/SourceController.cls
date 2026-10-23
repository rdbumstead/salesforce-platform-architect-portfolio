/**
 * @description       : Serves the View source dialog.
 *                      getSourceFiles(sourceKey) returns the files Source_File__mdt lists for a
 *                      showcase component, read from Source_Cache__c only. No
 *                      method here calls GitHub: SourceCacheRefreshJob fills the cache as the
 *                      admin. The site guest has no access to Source_Cache__c, so the read goes
 *                      through CacheSelector, which runs without sharing and in system mode and
 *                      returns a fixed set of fields for the configured paths only.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 * @Test Class        : [SourceControllerTest]
 **/
public with sharing class SourceController {
  public static final String LANGUAGE_NONE = 'none';

  /** Mirrors languageForPath in c/prismHighlighter. */
  private static final Map<String, String> LANGUAGE_BY_EXTENSION = new Map<String, String>{
    'cls' => 'apex',
    'trigger' => 'apex',
    'js' => 'javascript',
    'html' => 'markup',
    'xml' => 'markup',
    'css' => 'css',
    'yaml' => 'yaml',
    'yml' => 'yaml',
    'json' => 'json'
  };

  /**
   * @description One file of a component's source, as the dialog shows it.
   */
  public class SourceFile {
    @AuraEnabled
    public String path;
    @AuraEnabled
    public String label;
    @AuraEnabled
    public String language;
    @AuraEnabled
    public String content;
    @AuraEnabled
    public String htmlUrl;
    @AuraEnabled
    public Datetime fetchedAt;
    @AuraEnabled
    public Boolean truncated;
  }

  // Tests set this to stand in for the org's Source_File__mdt records.
  @TestVisible
  private static List<Source_File__mdt> filesOverride;

  /**
   * @description The cached files for one component, in Sort_Order__c order. A file with no
   *              good fetch yet is left out.
   * @param sourceKey One of skillNetwork, schemaVisualizer, decisionMatrix, apiTester,
   *                  resumeBuilder or roadmapViewer.
   * @return List<SourceFile> Empty for an unknown key or an empty cache, never null.
   * @example
   * List<SourceController.SourceFile> files = SourceController.getSourceFiles('apiTester');
   */
  @AuraEnabled(cacheable=true)
  public static List<SourceFile> getSourceFiles(String sourceKey) {
    List<SourceFile> result = new List<SourceFile>();
    List<Source_File__mdt> files = filesForKey(sourceKey);
    if (files.isEmpty()) {
      return result;
    }
    Set<String> paths = new Set<String>();
    for (Source_File__mdt file : files) {
      paths.add(file.Path__c);
    }
    Map<String, Source_Cache__c> cacheByPath = new Map<String, Source_Cache__c>();
    for (Source_Cache__c row : new CacheSelector().fetchedRows(paths)) {
      cacheByPath.put(row.Path__c, row);
    }
    for (Source_File__mdt file : files) {
      Source_Cache__c row = cacheByPath.get(file.Path__c);
      if (row != null) {
        result.add(toSourceFile(file, row));
      }
    }
    return result;
  }

  /**
   * @description Every configured file, for the refresh job.
   * @return List<Source_File__mdt> All records with a path, never null.
   */
  public static List<Source_File__mdt> configuredFiles() {
    List<Source_File__mdt> rows = filesOverride != null
      ? filesOverride
      : Source_File__mdt.getAll().values();
    List<Source_File__mdt> result = new List<Source_File__mdt>();
    for (Source_File__mdt row : rows) {
      if (
        String.isNotBlank(row.Path__c) && String.isNotBlank(row.Source_Key__c)
      ) {
        result.add(row);
      }
    }
    return result;
  }

  /**
   * @description The Prism language for a repository path, from its extension.
   * @param path For example packages/.../SourceController.cls.
   * @return String apex, javascript, markup, css, yaml, json or none.
   */
  public static String languageForPath(String path) {
    if (String.isBlank(path) || !path.contains('.')) {
      return LANGUAGE_NONE;
    }
    String extension = path.substringAfterLast('.').toLowerCase();
    return LANGUAGE_BY_EXTENSION.containsKey(extension)
      ? LANGUAGE_BY_EXTENSION.get(extension)
      : LANGUAGE_NONE;
  }

  private static List<Source_File__mdt> filesForKey(String sourceKey) {
    List<Source_File__mdt> matches = new List<Source_File__mdt>();
    if (String.isBlank(sourceKey)) {
      return matches;
    }
    for (Source_File__mdt row : configuredFiles()) {
      if (row.Source_Key__c == sourceKey) {
        matches.add(row);
      }
    }
    // Insertion sort on a handful of rows: Sort_Order__c, then Label__c.
    for (Integer i = 1; i < matches.size(); i++) {
      Source_File__mdt current = matches[i];
      Integer j = i - 1;
      while (j >= 0 && sortsAfter(matches[j], current)) {
        matches[j + 1] = matches[j];
        j--;
      }
      matches[j + 1] = current;
    }
    return matches;
  }

  private static Boolean sortsAfter(
    Source_File__mdt left,
    Source_File__mdt right
  ) {
    Decimal leftOrder = left.Sort_Order__c ?? 0;
    Decimal rightOrder = right.Sort_Order__c ?? 0;
    if (leftOrder != rightOrder) {
      return leftOrder > rightOrder;
    }
    return (left.Label__c ?? '') > (right.Label__c ?? '');
  }

  private static SourceFile toSourceFile(
    Source_File__mdt file,
    Source_Cache__c row
  ) {
    SourceFile result = new SourceFile();
    result.path = file.Path__c;
    result.label = String.isBlank(file.Label__c)
      ? file.Path__c.substringAfterLast('/')
      : file.Label__c;
    result.language = languageForPath(file.Path__c);
    result.content = row.Content__c ?? '';
    result.htmlUrl = row.Html_Url__c;
    result.fetchedAt = row.Fetched_At__c;
    result.truncated = row.Truncated__c == true;
    return result;
  }

  /**
   * @description Reads Source_Cache__c for the guest, without sharing and in system mode,
   *              because the guest has no access to the object. Only rows for configured
   *              paths with a good fetch, and only the fields the dialog shows.
   */
  private without sharing class CacheSelector {
    List<Source_Cache__c> fetchedRows(Set<String> paths) {
      return [
        SELECT Path__c, Content__c, Html_Url__c, Fetched_At__c, Truncated__c
        FROM Source_Cache__c
        WHERE Path__c IN :paths AND Fetched_At__c != NULL
        WITH SYSTEM_MODE
        LIMIT 200
      ];
    }
  }
}
