/**
 * @description       : Serves the numbers panel on the Delivery page. getStats() returns
 *                      counts only: testimonials approved, split by vibe, the deploy runs
 *                      recorded with the newest deploy's Apex and Jest tests run, tests passed
 *                      and coverage, the evaluator tokens issued, and the totals of cover
 *                      letters written and API Lab requests sent with the first month they
 *                      were counted. Every count comes from a read of an Id and a few plain
 *                      fields through QueryDefinitions, and is counted here. No row, name,
 *                      email or free text leaves this class.
 *
 *                      The number of testimonials waiting for approval is not part of the
 *                      answer. A visitor has no use for it, and the owner reads it in the
 *                      Testimonials Waiting Approval report.
 *
 *                      Approved testimonials are read in user mode with sharing, the same rows
 *                      the testimonial wall shows. Pipeline_Run__c, API_Access_Request__c and
 *                      Usage_Counter__c have no guest grant on purpose, so their reads run in
 *                      system mode inside a without sharing selector and only counts come
 *                      back.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/24/2026
 * @Test Class        : [PortfolioStatsControllerTest, PortfolioStatsControllerGuestTest]
 **/
public with sharing class PortfolioStatsController implements QueryDefinitions.Provider {
  @TestVisible
  private static final String APPROVED_QUERY = 'PortfolioStatsController_Approved';
  // Kept, with its default and its shipped record, for the private report's history. Nothing reads it and it is never sent to the page.
  @TestVisible
  private static final String WAITING_QUERY = 'PortfolioStatsController_Waiting';
  @TestVisible
  private static final String USAGE_QUERY = 'PortfolioStatsController_UsageCounters';
  @TestVisible
  private static final String DEPLOY_RUNS_QUERY = 'PortfolioStatsController_DeployRuns';
  @TestVisible
  private static final String LATEST_DEPLOY_QUERY = 'PortfolioStatsController_LatestDeploy';
  @TestVisible
  private static final String TOKENS_QUERY = 'PortfolioStatsController_IssuedTokens';

  @TestVisible
  private static final String OUTCOME_ISSUED = 'Issued';
  private static final String ERROR_MESSAGE = 'The numbers could not be loaded.';

  // Tests set it to reach the error path.
  @TestVisible
  private static Boolean throwForTest = false;

  /**
   * @description The panel's counts. Cacheable, because they change only when a record does.
   * @return Stats Counts only. A number with nothing recorded behind it is null.
   * @throws AuraHandledException When a read fails, with a message that holds no detail.
   */
  @AuraEnabled(cacheable=true)
  public static Stats getStats() {
    try {
      if (throwForTest) {
        throw new QueryException('Forced by a test');
      }
      return buildStats();
    } catch (Exception e) {
      AuraHandledException safe = new AuraHandledException(ERROR_MESSAGE);
      safe.setMessage(ERROR_MESSAGE);
      throw safe;
    }
  }

  private static Stats buildStats() {
    StatsSelector selector = new StatsSelector();
    List<Testimonial__c> approved = (List<Testimonial__c>) QueryDefinitions.run(
      APPROVED_QUERY,
      new Map<String, Object>(),
      approvedDefault()
    );

    Stats stats = new Stats();
    stats.testimonialsApproved = approved.size();
    stats.testimonialsByVibe = byVibe(approved);
    stats.deployRuns = selector.deployRuns().size();
    stats.tokensIssued = selector.issuedTokens().size();

    List<Pipeline_Run__c> latest = selector.latestDeployTests();
    if (!latest.isEmpty()) {
      stats.latestTestsRun = latest[0].Tests_Run__c?.intValue();
      stats.latestTestsPassed = latest[0].Tests_Passed__c?.intValue();
      stats.latestCoverage = latest[0].Org_Coverage__c;
      stats.latestJestRun = latest[0].Jest_Tests_Run__c?.intValue();
      stats.latestJestPassed = latest[0].Jest_Tests_Passed__c?.intValue();
    }
    addUsage(stats, selector.usageCounters());
    return stats;
  }

  // Totals by kind and the earliest day on any row. With no rows the totals are 0 and the
  // day stays null, so the panel shows no month.
  private static void addUsage(Stats stats, List<Usage_Counter__c> rows) {
    Decimal letters = 0;
    Decimal requests = 0;
    for (Usage_Counter__c row : rows) {
      Decimal count = row.Count__c ?? 0;
      if (row.Kind__c == UsageCounterWriter.KIND_COVER_LETTER) {
        letters += count;
      } else if (row.Kind__c == UsageCounterWriter.KIND_API_LAB_REQUEST) {
        requests += count;
      }
      if (
        row.Day__c != null &&
        (stats.countingSince == null ||
        row.Day__c < stats.countingSince)
      ) {
        stats.countingSince = row.Day__c;
      }
    }
    stats.coverLettersWritten = letters.intValue();
    stats.apiLabRequests = requests.intValue();
  }

  // One entry per active vibe value, in picklist order, zero counts included. A row with no
  // vibe counts in the totals only.
  private static List<VibeCount> byVibe(List<Testimonial__c> approved) {
    Map<String, VibeCount> countsByValue = new Map<String, VibeCount>();
    List<VibeCount> result = new List<VibeCount>();
    for (
      Schema.PicklistEntry entry : Testimonial__c.Vibe_Mode__c.getDescribe()
        .getPicklistValues()
    ) {
      if (entry.isActive()) {
        VibeCount vibeCount = new VibeCount(entry.getLabel());
        countsByValue.put(entry.getValue(), vibeCount);
        result.add(vibeCount);
      }
    }
    for (Testimonial__c row : approved) {
      VibeCount vibeCount = countsByValue.get(row.Vibe_Mode__c);
      if (vibeCount != null) {
        vibeCount.approved++;
      }
    }
    return result;
  }

  /**
   * @description Approved testimonials as code: the Id and the vibe, user mode.
   *              Query_Definition.PortfolioStatsController_Approved ships equal
   *              to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault approvedDefault() {
    return new QueryDefinitions.QueryDefault(
        'Testimonial__c',
        'Id, Vibe_Mode__c'
      )
      .filter('Approved__c = TRUE')
      .mode(QueryDefinitions.Mode.USER_MODE);
  }

  /**
   * @description Waiting testimonials as code: the Id and the vibe, system mode. Nothing
   *              reads it for the panel any more. It stays so the shipped record has a
   *              default to match.
   *              Query_Definition.PortfolioStatsController_Waiting ships equal
   *              to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault waitingDefault() {
    return new QueryDefinitions.QueryDefault(
        'Testimonial__c',
        'Id, Vibe_Mode__c'
      )
      .filter('Approved__c = FALSE')
      .mode(QueryDefinitions.Mode.SYSTEM_MODE);
  }

  /**
   * @description Recorded deploy runs as code: the Id only, system mode.
   *              Query_Definition.PortfolioStatsController_DeployRuns ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault deployRunsDefault() {
    return new QueryDefinitions.QueryDefault('Pipeline_Run__c', 'Id')
      .filter('Workflow__c = :workflow')
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(deployBinds());
  }

  /**
   * @description The newest deploy run with a test result as code, system mode.
   *              Query_Definition.PortfolioStatsController_LatestDeploy ships equal to
   *              it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault latestDeployDefault() {
    return new QueryDefinitions.QueryDefault(
        'Pipeline_Run__c',
        'Tests_Run__c, Tests_Passed__c, Org_Coverage__c, Jest_Tests_Run__c, Jest_Tests_Passed__c'
      )
      .filter('Workflow__c = :workflow AND Tests_Run__c != NULL')
      .orderBy('Completed_At__c DESC NULLS LAST, CreatedDate DESC, Id DESC')
      .rowLimit(1)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(deployBinds());
  }

  /**
   * @description Issued evaluator tokens as code: the Id only, system mode.
   *              Query_Definition.PortfolioStatsController_IssuedTokens ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault tokensDefault() {
    return new QueryDefinitions.QueryDefault('API_Access_Request__c', 'Id')
      .filter('Outcome__c = :outcome')
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(tokenBinds());
  }

  /**
   * @description The usage counter rows as code: kind, day and count, system mode. One row
   *              per kind per UTC day, so a year is about 730 rows.
   *              Query_Definition.PortfolioStatsController_UsageCounters ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault usageDefault() {
    return new QueryDefinitions.QueryDefault(
        'Usage_Counter__c',
        'Kind__c, Day__c, Count__c'
      )
      .orderBy('Day__c ASC')
      .mode(QueryDefinitions.Mode.SYSTEM_MODE);
  }

  private static Map<String, Object> deployBinds() {
    return new Map<String, Object>{
      'workflow' => GovernanceEventHandler.WORKFLOW_DEPLOY
    };
  }

  private static Map<String, Object> tokenBinds() {
    return new Map<String, Object>{ 'outcome' => OUTCOME_ISSUED };
  }

  /**
   * @description The code defaults this class owns, for QueryDefinitions.validateAll().
   * @return Map<String, QueryDefinitions.QueryDefault> The defaults by record name.
   */
  public Map<String, QueryDefinitions.QueryDefault> queryDefaults() {
    return new Map<String, QueryDefinitions.QueryDefault>{
      APPROVED_QUERY => approvedDefault(),
      WAITING_QUERY => waitingDefault(),
      DEPLOY_RUNS_QUERY => deployRunsDefault(),
      LATEST_DEPLOY_QUERY => latestDeployDefault(),
      TOKENS_QUERY => tokensDefault(),
      USAGE_QUERY => usageDefault()
    };
  }

  /**
   * @description Reads that see past the guest's sharing, in system mode and without sharing.
   *              The guest has no grant on Pipeline_Run__c, API_Access_Request__c or
   *              Usage_Counter__c. Each read asks for an Id and at most a kind, a day, a
   *              count or the test numbers, and the outer class returns only counts made
   *              from them.
   */
  private without sharing class StatsSelector {
    private List<Usage_Counter__c> usageCounters() {
      return (List<Usage_Counter__c>) QueryDefinitions.run(
        USAGE_QUERY,
        new Map<String, Object>(),
        usageDefault()
      );
    }

    private List<Pipeline_Run__c> deployRuns() {
      return (List<Pipeline_Run__c>) QueryDefinitions.run(
        DEPLOY_RUNS_QUERY,
        deployBinds(),
        deployRunsDefault()
      );
    }

    private List<Pipeline_Run__c> latestDeployTests() {
      return (List<Pipeline_Run__c>) QueryDefinitions.run(
        LATEST_DEPLOY_QUERY,
        deployBinds(),
        latestDeployDefault()
      );
    }

    private List<API_Access_Request__c> issuedTokens() {
      return (List<API_Access_Request__c>) QueryDefinitions.run(
        TOKENS_QUERY,
        tokenBinds(),
        tokensDefault()
      );
    }
  }

  /**
   * @description What getStats returns. Counts only.
   */
  public class Stats {
    @AuraEnabled
    public Integer testimonialsApproved;
    @AuraEnabled
    public List<VibeCount> testimonialsByVibe;
    @AuraEnabled
    public Integer deployRuns;
    @AuraEnabled
    public Integer latestTestsRun;
    @AuraEnabled
    public Integer latestTestsPassed;
    @AuraEnabled
    public Decimal latestCoverage;
    @AuraEnabled
    public Integer latestJestRun;
    @AuraEnabled
    public Integer latestJestPassed;
    @AuraEnabled
    public Integer tokensIssued;
    @AuraEnabled
    public Integer coverLettersWritten;
    @AuraEnabled
    public Integer apiLabRequests;
    // The first day any usage was counted. Null when nothing has been counted.
    @AuraEnabled
    public Date countingSince;
  }

  /**
   * @description Approved testimonials for one vibe. vibe is the picklist label.
   */
  public class VibeCount {
    @AuraEnabled
    public String vibe;
    @AuraEnabled
    public Integer approved = 0;

    private VibeCount(String vibe) {
      this.vibe = vibe;
    }
  }
}
