/**
 * @description       : Serves the View source dialog and the docs page.
 *                      getSourceFiles(sourceKey) returns the files Source_File__mdt lists for a
 *                      showcase component, getDocs() lists the documents under the docs key
 *                      and getDoc(docKey) returns one of them. All three read
 *                      Source_Cache__c only, joining a file's parts in order. No
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
public with sharing class SourceController implements QueryDefinitions.Provider {
  private static final String ROWS_QUERY = 'SourceController_FetchedRows';
  private static final String PATHS_QUERY = 'SourceController_FetchedPaths';
  public static final String LANGUAGE_NONE = 'none';
  /** The Source_Key__c of every document the docs page shows. */
  public static final String DOCS_KEY = 'docs';
  /** A docs record's DeveloperName starts with this, for example docs_adr_027. */
  private static final String DOCS_NAME_PREFIX = 'docs_';

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

  /**
   * @description One document in the docs list. The key is what the page's doc query
   *              string names, for example sas or adr-027.
   */
  public class DocSummary {
    @AuraEnabled
    public String key;
    @AuraEnabled
    public String title;
    @AuraEnabled
    public String path;
  }

  /**
   * @description One document with its whole cached text.
   */
  public class DocContent {
    @AuraEnabled
    public String key;
    @AuraEnabled
    public String title;
    @AuraEnabled
    public String path;
    @AuraEnabled
    public String content;
    @AuraEnabled
    public String htmlUrl;
    @AuraEnabled
    public Datetime fetchedAt;
    @AuraEnabled
    public Boolean truncated;
  }

  /** A file's cached text with its parts joined. */
  private class CachedFile {
    String content;
    String htmlUrl;
    Datetime fetchedAt;
    Boolean truncated;
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
    Map<String, CachedFile> cacheByPath = cachedFiles(pathsOf(files));
    for (Source_File__mdt file : files) {
      CachedFile cached = cacheByPath.get(file.Path__c);
      if (cached != null) {
        result.add(toSourceFile(file, cached));
      }
    }
    return result;
  }

  /**
   * @description The documents the docs page lists, in Sort_Order__c order, without their
   *              text. A document with no good fetch yet is left out.
   * @return List<DocSummary> Empty when nothing is cached, never null.
   * @example
   * List<SourceController.DocSummary> docs = SourceController.getDocs();
   */
  @AuraEnabled(cacheable=true)
  public static List<DocSummary> getDocs() {
    List<DocSummary> result = new List<DocSummary>();
    List<Source_File__mdt> files = filesForKey(DOCS_KEY);
    if (files.isEmpty()) {
      return result;
    }
    Set<String> fetched = new Set<String>();
    for (
      Source_Cache__c row : new CacheSelector().fetchedPaths(pathsOf(files))
    ) {
      fetched.add(row.Path__c);
    }
    for (Source_File__mdt file : files) {
      if (fetched.contains(file.Path__c)) {
        DocSummary summary = new DocSummary();
        summary.key = docKeyFor(file);
        summary.title = titleOf(file);
        summary.path = file.Path__c;
        result.add(summary);
      }
    }
    return result;
  }

  /**
   * @description One document with its parts joined.
   * @param docKey For example sas or adr-027, any case.
   * @return DocContent Null for an unknown key or a document not yet fetched.
   * @example
   * SourceController.DocContent sas = SourceController.getDoc('sas');
   */
  @AuraEnabled(cacheable=true)
  public static DocContent getDoc(String docKey) {
    if (String.isBlank(docKey)) {
      return null;
    }
    String wanted = docKey.trim().toLowerCase();
    for (Source_File__mdt file : filesForKey(DOCS_KEY)) {
      if (docKeyFor(file) != wanted) {
        continue;
      }
      CachedFile cached = cachedFiles(new Set<String>{ file.Path__c })
        .get(file.Path__c);
      return cached == null ? null : toDocContent(file, cached);
    }
    return null;
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
   * @description The doc key of a docs record: its DeveloperName without the docs_
   *              prefix, lower case, underscores as hyphens.
   * @param file A Source_File__mdt record.
   * @return String For example adr-027 for docs_adr_027.
   */
  public static String docKeyFor(Source_File__mdt file) {
    String name = file?.DeveloperName ?? '';
    return name.removeStartIgnoreCase(DOCS_NAME_PREFIX)
      .replace('_', '-')
      .toLowerCase();
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

  private static Set<String> pathsOf(List<Source_File__mdt> files) {
    Set<String> paths = new Set<String>();
    for (Source_File__mdt file : files) {
      paths.add(file.Path__c);
    }
    return paths;
  }

  /**
   * @description Reads each path's rows and joins its parts in order, stopping at the
   *              first missing part. A path with no fetched first part is left out.
   */
  private static Map<String, CachedFile> cachedFiles(Set<String> paths) {
    Set<String> candidates = new Set<String>();
    for (String path : paths) {
      for (Integer part = 1; part <= SourceCacheRefreshJob.MAX_PARTS; part++) {
        candidates.add(SourceCacheRefreshJob.partPath(path, part));
      }
    }
    Map<String, Source_Cache__c> rowByPath = new Map<String, Source_Cache__c>();
    for (Source_Cache__c row : new CacheSelector().fetchedRows(candidates)) {
      rowByPath.put(row.Path__c, row);
    }
    Map<String, CachedFile> result = new Map<String, CachedFile>();
    for (String path : paths) {
      Source_Cache__c first = rowByPath.get(path);
      if (first == null) {
        continue;
      }
      List<String> pieces = new List<String>{ first.Content__c ?? '' };
      for (Integer part = 2; part <= SourceCacheRefreshJob.MAX_PARTS; part++) {
        Source_Cache__c row = rowByPath.get(
          SourceCacheRefreshJob.partPath(path, part)
        );
        if (row == null) {
          break;
        }
        pieces.add(row.Content__c ?? '');
      }
      CachedFile cached = new CachedFile();
      cached.content = String.join(pieces, '');
      cached.htmlUrl = first.Html_Url__c;
      cached.fetchedAt = first.Fetched_At__c;
      cached.truncated = first.Truncated__c == true;
      result.put(path, cached);
    }
    return result;
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
    // Insertion sort on a few dozen rows at most: Sort_Order__c, then Label__c.
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

  private static String titleOf(Source_File__mdt file) {
    return String.isBlank(file.Label__c)
      ? file.Path__c.substringAfterLast('/')
      : file.Label__c;
  }

  private static SourceFile toSourceFile(
    Source_File__mdt file,
    CachedFile cached
  ) {
    SourceFile result = new SourceFile();
    result.path = file.Path__c;
    result.label = titleOf(file);
    result.language = languageForPath(file.Path__c);
    result.content = cached.content;
    result.htmlUrl = cached.htmlUrl;
    result.fetchedAt = cached.fetchedAt;
    result.truncated = cached.truncated;
    return result;
  }

  private static DocContent toDocContent(
    Source_File__mdt file,
    CachedFile cached
  ) {
    DocContent result = new DocContent();
    result.key = docKeyFor(file);
    result.title = titleOf(file);
    result.path = file.Path__c;
    result.content = cached.content;
    result.htmlUrl = cached.htmlUrl;
    result.fetchedAt = cached.fetchedAt;
    result.truncated = cached.truncated;
    return result;
  }

  /**
   * @description Reads Source_Cache__c for the guest, without sharing and in system mode,
   *              because the guest has no access to the object. Only rows for configured
   *              paths and their parts with a good fetch, and only the fields the dialog and
   *              the docs page show.
   */
  private without sharing class CacheSelector {
    List<Source_Cache__c> fetchedRows(Set<String> paths) {
      return (List<Source_Cache__c>) QueryDefinitions.run(
        ROWS_QUERY,
        pathBinds(paths),
        rowsDefault()
      );
    }

    List<Source_Cache__c> fetchedPaths(Set<String> paths) {
      return (List<Source_Cache__c>) QueryDefinitions.run(
        PATHS_QUERY,
        pathBinds(paths),
        pathsDefault()
      );
    }
  }

  /**
   * @description The cached rows read as code: the fetched rows of the given paths with
   *              the fields the dialog and the docs page show, in system mode.
   *              Query_Definition.SourceController_FetchedRows ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault rowsDefault() {
    return fetchedDefault(
      'Path__c, Content__c, Html_Url__c, Fetched_At__c, Truncated__c'
    );
  }

  /**
   * @description The fetched paths read as code, in system mode.
   *              Query_Definition.SourceController_FetchedPaths ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault pathsDefault() {
    return fetchedDefault('Path__c');
  }

  private static QueryDefinitions.QueryDefault fetchedDefault(
    String fieldList
  ) {
    return new QueryDefinitions.QueryDefault('Source_Cache__c', fieldList)
      .filter('Path__c IN :paths AND Fetched_At__c != NULL')
      .rowLimit(200)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(pathBinds(new Set<String>()));
  }

  private static Map<String, Object> pathBinds(Set<String> paths) {
    return new Map<String, Object>{ 'paths' => paths };
  }

  /**
   * @description The code defaults this class owns, for QueryDefinitions.validateAll().
   * @return Map<String, QueryDefinitions.QueryDefault> The defaults by record name.
   */
  public Map<String, QueryDefinitions.QueryDefault> queryDefaults() {
    return new Map<String, QueryDefinitions.QueryDefault>{
      ROWS_QUERY => rowsDefault(),
      PATHS_QUERY => pathsDefault()
    };
  }
}
