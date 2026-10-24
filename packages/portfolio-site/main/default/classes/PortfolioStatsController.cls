/**
 * @description       : Serves the numbers panel on the Delivery page. getStats() returns
 *                      counts only: testimonials approved and waiting, each split by vibe,
 *                      the deploy runs recorded with the newest deploy's tests run, tests
 *                      passed and coverage, and the evaluator tokens issued. Every count comes
 *                      from a read of an Id and at most one grouping field through
 *                      QueryDefinitions, and is counted here. No row, name, email or free text
 *                      leaves this class.
 *
 *                      Approved testimonials are read in user mode with sharing, the same rows
 *                      the testimonial wall shows. The Block_Unapproved_Testimonials
 *                      restriction rule hides waiting rows from the site guest in user mode and
 *                      in every read that enforces sharing, so the waiting read runs in system
 *                      mode inside a without sharing selector and only its count comes back.
 *                      Pipeline_Run__c and API_Access_Request__c have no guest grant on
 *                      purpose, so their reads run the same way.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/24/2026
 * @Test Class        : [PortfolioStatsControllerTest, PortfolioStatsControllerGuestTest]
 **/
public with sharing class PortfolioStatsController implements QueryDefinitions.Provider {
  @TestVisible
  private static final String APPROVED_QUERY = 'PortfolioStatsController_Approved';
  @TestVisible
  private static final String WAITING_QUERY = 'PortfolioStatsController_Waiting';
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
    List<Testimonial__c> waiting = selector.waitingTestimonials();

    Stats stats = new Stats();
    stats.testimonialsApproved = approved.size();
    stats.testimonialsWaiting = waiting.size();
    stats.testimonialsByVibe = byVibe(approved, waiting);
    stats.deployRuns = selector.deployRuns().size();
    stats.tokensIssued = selector.issuedTokens().size();

    List<Pipeline_Run__c> latest = selector.latestDeployTests();
    if (!latest.isEmpty()) {
      stats.latestTestsRun = latest[0].Tests_Run__c?.intValue();
      stats.latestTestsPassed = latest[0].Tests_Passed__c?.intValue();
      stats.latestCoverage = latest[0].Org_Coverage__c;
    }
    return stats;
  }

  // One entry per active vibe value, in picklist order, zero counts included. A row with no
  // vibe counts in the totals only.
  private static List<VibeCount> byVibe(
    List<Testimonial__c> approved,
    List<Testimonial__c> waiting
  ) {
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
    for (Testimonial__c row : waiting) {
      VibeCount vibeCount = countsByValue.get(row.Vibe_Mode__c);
      if (vibeCount != null) {
        vibeCount.waiting++;
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
   * @description Waiting testimonials as code: the Id and the vibe, system mode.
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
        'Tests_Run__c, Tests_Passed__c, Org_Coverage__c'
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
      TOKENS_QUERY => tokensDefault()
    };
  }

  /**
   * @description Reads that see past the guest's sharing, in system mode and without sharing.
   *              The waiting testimonials are hidden from the guest by the restriction rule,
   *              and the guest has no grant on Pipeline_Run__c or API_Access_Request__c. Each
   *              read asks for an Id and at most the vibe or the test numbers, and the outer
   *              class returns only counts made from them.
   */
  private without sharing class StatsSelector {
    private List<Testimonial__c> waitingTestimonials() {
      return (List<Testimonial__c>) QueryDefinitions.run(
        WAITING_QUERY,
        new Map<String, Object>(),
        waitingDefault()
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
    public Integer testimonialsWaiting;
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
    public Integer tokensIssued;
  }

  /**
   * @description Approved and waiting testimonials for one vibe. vibe is the picklist label.
   */
  public class VibeCount {
    @AuraEnabled
    public String vibe;
    @AuraEnabled
    public Integer approved = 0;
    @AuraEnabled
    public Integer waiting = 0;

    private VibeCount(String vibe) {
      this.vibe = vibe;
    }
  }
}
