/**
 * @description       : SAPI Portfolio Config REST resource (/portfolio-config). Returns the
 *                      singleton Portfolio_Config__mdt record as the PortfolioConfig schema,
 *                      or an empty object when no record exists. Not pageable.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 * @Test Class        : [SAPIPortfolioConfigTest]
 **/
@RestResource(urlMapping='/sapi/v1/portfolio-config/*')
global with sharing class SAPIPortfolioConfig {
  /**
   * @description GET method. Retrieves the portfolio configuration.
   */
  @HttpGet
  global static void getPortfolioConfig() {
    ApiRequestContext ctx = ApiRequestContext.begin();
    if (ctx.isRejected()) {
      return;
    }

    try {
      if (Test.isRunningTest() && throwException) {
        throw new CalloutException('Forced Exception');
      }

      List<Portfolio_Config__mdt> configs = loadConfigs();

      ctx.cache(ApiRequestContext.CachePolicy.PRIVATE_300);
      ctx.ok(
        SAPITransformer.toPortfolioConfig(configs.isEmpty() ? null : configs[0])
      );
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  /**
   * @description Reads the configuration record. SOQL rather than getAll(), because
   *              getAll() truncates long text area fields such as Career_Objective__c.
   * @return List<Portfolio_Config__mdt> Zero or one record.
   */
  private static List<Portfolio_Config__mdt> loadConfigs() {
    if (configOverride != null) {
      return configOverride;
    }
    return [
      SELECT
        LinkedIn_URL__c,
        GitHub_Profile_URL__c,
        Calendly_URL__c,
        Trailblazer_Profile_URL__c,
        Personal_Website_URL__c,
        Career_Objective__c,
        Jira_Project_Key__c,
        GitHub_Repo_Path__c
      FROM Portfolio_Config__mdt
      ORDER BY DeveloperName ASC
      LIMIT 1
    ];
  }

  @TestVisible
  private static List<Portfolio_Config__mdt> configOverride;

  @TestVisible
  private static Boolean throwException = false;
}
