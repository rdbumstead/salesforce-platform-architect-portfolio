/**
 * @description       : SAPI Account REST resource (/accounts) for employer and issuer records.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 * @Test Class        : [SAPIAccountTest]
 **/
// The old /v1/ spelling is kept as an alias until the path sunset (ADR-040). SAPIRouter serves the versionless URL.
@RestResource(urlMapping='/sapi/v1/accounts/*')
global with sharing class SAPIAccount implements QueryDefinitions.Provider {
  private static final String LIST_QUERY = 'SAPIAccount_List';

  /**
   * @description GET method. Retrieves Account records with pagination and an accountName filter.
   */
  @HttpGet
  global static void getAccounts() {
    ApiRequestContext ctx = ApiRequestContext.begin();
    if (ctx.isRejected()) {
      return;
    }

    try {
      if (Test.isRunningTest() && throwException) {
        throw new CalloutException('Forced Exception');
      }

      Integer limitParam = ctx.limitParam();
      Integer offsetParam = ctx.offsetParam();
      if (ctx.isRejected()) {
        return;
      }
      String accountName = ctx.stringParam('accountName');

      Map<String, Object> binds = listBinds(accountName);
      List<Account> records = (List<Account>) QueryDefinitions.runPage(
        LIST_QUERY,
        binds,
        listDefault(),
        limitParam,
        offsetParam
      );
      Integer totalCount = QueryDefinitions.count(
        LIST_QUERY,
        binds,
        listDefault()
      );

      ctx.paginate(totalCount, records.size());
      ctx.cache(ApiRequestContext.CachePolicy.PUBLIC_300);
      ctx.ok(SAPITransformer.toAccounts(records));
    } catch (Exception e) {
      ctx.serverError(e);
    }
  }

  /**
   * @description The list read as code: every field the response returns, the optional
   *              filters and the order. Query_Definition.SAPIAccount_List ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault listDefault() {
    return new QueryDefinitions.QueryDefault(
        'Account',
        'Id, Public_Key__c, Name, Industry, Abbreviation__c'
      )
      .filter('(IsDeleted = :hasAccountName OR Name = :accountName)')
      .orderBy('Name ASC')
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(listBinds(null));
  }

  private static Map<String, Object> listBinds(String accountName) {
    return new Map<String, Object>{
      'hasAccountName' => String.isNotBlank(accountName),
      'accountName' => accountName
    };
  }

  /**
   * @description The code defaults this class owns, for QueryDefinitions.validateAll().
   * @return Map<String, QueryDefinitions.QueryDefault> The defaults by record name.
   */
  public Map<String, QueryDefinitions.QueryDefault> queryDefaults() {
    return new Map<String, QueryDefinitions.QueryDefault>{
      LIST_QUERY => listDefault()
    };
  }

  @TestVisible
  private static Boolean throwException = false;
}
