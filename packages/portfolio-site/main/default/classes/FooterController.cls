/**
 * @description       : Serves the Glass Box footer (Round 4 plan L8, pillar-d-design 3.8 and 5.4).
 *                      getLinks() returns only the GitHub and LinkedIn profile URLs from the
 *                      Portfolio_Config__mdt record. The owner email and phone on that record
 *                      never leave this class (trap 34). getSystemSnapshot() is called by the
 *                      footer after first paint (ADR-014) and returns this transaction's CPU,
 *                      heap and SOQL use against their limits (SAS 9, Guardrails guide), the
 *                      provider rows from ContentGenerationController.providerStatus() as they
 *                      are, and today's AI tier request count (PD-D9 b).
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
    } catch (Exception e) {
      throw new AuraHandledException('System status is unavailable.');
    }
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
   * PortfolioService.getConfig() does not select the profile URL fields (Round 4 log 140), so
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
      String keyPattern = AI_TIER_KEY_PREFIX + '%';
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
