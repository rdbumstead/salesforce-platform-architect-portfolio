/**
 * @description       : Serves the Glass Box footer.
 *                      getLinks() returns only the GitHub and LinkedIn profile URLs from the
 *                      Portfolio_Config__mdt record. The owner email and phone on that record
 *                      never leave this class. getSystemSnapshot() is called by the
 *                      footer after first paint (ADR-014) and returns this transaction's CPU,
 *                      heap and SOQL use against their limits (SAS 9, Guardrails guide), the
 *                      provider rows from ContentGenerationController.providerStatus() as they
 *                      are, and today's AI tier request count, in which a cover letter that went
 *                      through the API counts once. It also returns the
 *                      org's own quotas from OrgLimits (daily API requests and daily async
 *                      Apex runs) and the GitHub and Jira circuit breaker state. It also
 *                      returns the stored storage snapshot from StorageSnapshot.read(), the
 *                      aggregates StorageSnapshotJob wrote on its schedule. The guest cannot
 *                      read storage from OrgLimits itself, so it reads those figures here.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 * @Test Class        : [FooterControllerTest]
 **/
public with sharing class FooterController {
  /** Key__c prefix RateWindowLimiter writes for /papi/v1/ai/ and the site AI path. */
  @TestVisible
  private static final String AI_TIER_KEY_PREFIX = 'papi-ai:';

  /**
   * Key__c of the marker ApiLabController adds for each site letter the API also counted on
   * its own papi-ai key. Taken off the total, so that letter counts once.
   */
  @TestVisible
  private static final String PROXIED_KEY = ApiLabController.PROXIED_RATE_KEY;

  /**
   * The OrgLimits names the footer shows, in this order, with their footer labels. Each one is
   * readable by the site guest. DataStorageMB is not, as FooterControllerTest shows.
   */
  @TestVisible
  private static final List<String> QUOTA_NAMES = new List<String>{
    'DailyApiRequests',
    'DailyAsyncApexExecutions'
  };
  private static final Map<String, String> QUOTA_LABELS = new Map<String, String>{
    'DailyApiRequests' => 'API requests today',
    'DailyAsyncApexExecutions' => 'async Apex today'
  };

  /** The integrations whose breakers the footer shows, in this order. */
  @TestVisible
  private static final List<String> INTEGRATION_KEYS = new List<String>{
    CircuitBreaker.KEY_GITHUB,
    CircuitBreaker.KEY_JIRA
  };
  private static final Map<String, String> INTEGRATION_LABELS = new Map<String, String>{
    CircuitBreaker.KEY_GITHUB => 'GitHub',
    CircuitBreaker.KEY_JIRA => 'Jira'
  };

  @TestVisible
  private static Map<String, System.OrgLimit> orgLimitsOverride;
  @TestVisible
  private static Boolean throwOnOrgLimits = false;
  @TestVisible
  private static Boolean throwOnStorage = false;

  @TestVisible
  private static Portfolio_Config__mdt configOverride;
  @TestVisible
  private static Boolean throwException = false;

  /**
   * @description The public profile links. Nothing else from the config record.
   */
  public class FooterLinks {
    @AuraEnabled
    public String gitHubUrl;
    @AuraEnabled
    public String linkedInUrl;
  }

  /**
   * @description What the footer shows after first paint.
   */
  public class SystemSnapshot {
    @AuraEnabled
    public Integer cpuTimeMs;
    @AuraEnabled
    public Integer cpuTimeLimitMs;
    @AuraEnabled
    public Integer heapBytes;
    @AuraEnabled
    public Integer heapLimitBytes;
    @AuraEnabled
    public Integer soqlQueries;
    @AuraEnabled
    public Integer soqlQueryLimit;
    @AuraEnabled
    public List<ContentGenerationController.ProviderStatus> providers;
    @AuraEnabled
    public Integer aiRequestsToday;
    /** The org's own quotas. Empty when OrgLimits cannot be read, never a made up number. */
    @AuraEnabled
    public List<OrgQuota> orgQuotas;
    /** The GitHub and Jira circuit breakers. */
    @AuraEnabled
    public List<IntegrationState> integrations;
    /** The stored storage figures. Null until the first snapshot is taken or when unreadable. */
    @AuraEnabled
    public StorageSnapshot.Snapshot storage;
  }

  /**
   * @description One org quota as the footer shows it, for example "API requests today 120 of 15000".
   */
  public class OrgQuota {
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String label;
    @AuraEnabled
    public Integer used;
    @AuraEnabled
    public Integer max;
  }

  /**
   * @description One integration's circuit breaker: closed, or open until a time.
   */
  public class IntegrationState {
    @AuraEnabled
    public String key;
    @AuraEnabled
    public String label;
    @AuraEnabled
    public Boolean open;
    @AuraEnabled
    public Datetime openUntil;
  }

  /**
   * @description The GitHub and LinkedIn profile URLs, each null when the org has no config
   *              record or the field is blank.
   * @return FooterLinks The two URLs.
   */
  @AuraEnabled(cacheable=true)
  public static FooterLinks getLinks() {
    FooterLinks links = new FooterLinks();
    Portfolio_Config__mdt config = config();
    if (config != null) {
      links.gitHubUrl = config.GitHub_Profile_URL__c;
      links.linkedInUrl = config.LinkedIn_URL__c;
    }
    return links;
  }

  /**
   * @description The footer's telemetry. Not cacheable, so every page view reads it fresh.
   * @return SystemSnapshot Limits used by this request, the provider rows and today's count.
   */
  @AuraEnabled
  public static SystemSnapshot getSystemSnapshot() {
    SystemSnapshot snapshot = new SystemSnapshot();
    try {
      if (throwException) {
        throw new QueryException('Forced failure for the error path test.');
      }
      snapshot.providers = ContentGenerationController.providerStatus();
      snapshot.aiRequestsToday = new AiRequestCounter().countToday();
      snapshot.integrations = integrationStates();
    } catch (Exception e) {
      throw new AuraHandledException('System status is unavailable.');
    }
    snapshot.orgQuotas = orgQuotas();
    snapshot.storage = storedStorage();
    // Read last, so the numbers include the work above.
    snapshot.cpuTimeMs = Limits.getCpuTime();
    snapshot.cpuTimeLimitMs = Limits.getLimitCpuTime();
    snapshot.heapBytes = Limits.getHeapSize();
    snapshot.heapLimitBytes = Limits.getLimitHeapSize();
    snapshot.soqlQueries = Limits.getQueries();
    snapshot.soqlQueryLimit = Limits.getLimitQueries();
    return snapshot;
  }

  /**
   * The quotas in QUOTA_NAMES that OrgLimits reports. A quota missing from the map is left
   * out, and a failure to read OrgLimits leaves the list empty, so the footer never shows a
   * number it did not read.
   */
  @TestVisible
  private static List<OrgQuota> orgQuotas() {
    List<OrgQuota> quotas = new List<OrgQuota>();
    Map<String, System.OrgLimit> limitsByName;
    try {
      if (throwOnOrgLimits) {
        throw new NoAccessException();
      }
      limitsByName = orgLimitsOverride != null
        ? orgLimitsOverride
        : OrgLimits.getMap();
    } catch (Exception e) {
      return quotas;
    }
    for (String name : QUOTA_NAMES) {
      System.OrgLimit orgLimit = limitsByName.get(name);
      if (orgLimit == null) {
        continue;
      }
      OrgQuota quota = new OrgQuota();
      quota.name = name;
      quota.label = QUOTA_LABELS.get(name);
      quota.used = orgLimit.getValue();
      quota.max = orgLimit.getLimit();
      quotas.add(quota);
    }
    return quotas;
  }

  /**
   * The stored storage snapshot, or null when there is none or it cannot be read, so the
   * rest of the footer never waits on it.
   */
  @TestVisible
  private static StorageSnapshot.Snapshot storedStorage() {
    try {
      if (throwOnStorage) {
        throw new QueryException('Forced failure for the storage path test.');
      }
      return StorageSnapshot.read();
    } catch (Exception e) {
      return null;
    }
  }

  /**
   * The GitHub and Jira breakers from CircuitBreaker.snapshot(), which never writes.
   */
  private static List<IntegrationState> integrationStates() {
    Map<String, CircuitBreaker.BreakerState> statesByKey = new Map<String, CircuitBreaker.BreakerState>();
    for (CircuitBreaker.BreakerState state : CircuitBreaker.snapshot()) {
      statesByKey.put(state.key, state);
    }
    List<IntegrationState> integrations = new List<IntegrationState>();
    for (String key : INTEGRATION_KEYS) {
      CircuitBreaker.BreakerState state = statesByKey.get(key);
      IntegrationState view = new IntegrationState();
      view.key = key;
      view.label = INTEGRATION_LABELS.get(key);
      view.open = state?.open == true;
      view.openUntil = state?.openUntil;
      integrations.add(view);
    }
    return integrations;
  }

  /**
   * PortfolioService.getConfig() does not select the profile URL fields, so
   * the record is read here with the same rule: the first record by DeveloperName.
   * getAll() reads custom metadata without SOQL.
   */
  private static Portfolio_Config__mdt config() {
    if (configOverride != null) {
      return configOverride;
    }
    return firstByName(Portfolio_Config__mdt.getAll().values());
  }

  /**
   * The record whose DeveloperName sorts first, or null for an empty or null list.
   */
  @TestVisible
  private static Portfolio_Config__mdt firstByName(
    List<Portfolio_Config__mdt> records
  ) {
    Portfolio_Config__mdt first;
    if (records == null) {
      return first;
    }
    for (Portfolio_Config__mdt record : records) {
      if (
        first == null ||
        record.DeveloperName.compareTo(first.DeveloperName) < 0
      ) {
        first = record;
      }
    }
    return first;
  }

  /**
   * Without sharing on purpose: API_Rate_Window__c is private counter state owned by whoever
   * made each request, and the site guest has no access to it at all. The footer needs the
   * total for every caller, so this reads in system mode and returns only one number, never
   * a row, a key or a caller identity.
   */
  private without sharing class AiRequestCounter {
    public Integer countToday() {
      Integer requests = sumToday(AI_TIER_KEY_PREFIX + '%');
      Integer counted = sumToday(PROXIED_KEY + '|%');
      return Math.max(0, requests - counted);
    }

    private Integer sumToday(String keyPattern) {
      AggregateResult total = [
        SELECT SUM(Count__c) requests
        FROM API_Rate_Window__c
        WHERE Key__c LIKE :keyPattern AND Window_Start__c = TODAY
        WITH SYSTEM_MODE
      ];
      Decimal requests = (Decimal) total.get('requests');
      return requests == null ? 0 : requests.intValue();
    }
  }
}
