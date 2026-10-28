/**
 * @description       : SAPI Contact REST resource (/contacts). Returns the portfolio owner only, reading only the Contact fields granted by Integration_Access.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 * @Test Class        : [SAPIContactTest]
 **/
@RestResource(urlMapping='/sapi/v1/contacts/*')
global with sharing class SAPIContact implements QueryDefinitions.Provider {
  private static final String LIST_QUERY = 'SAPIContact_List';

  /**
   * @description GET method. Retrieves the portfolio owner's Contact details with pagination and a contactName filter.
   */
  @HttpGet
  global static void getContacts() {
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
      String contactName = ctx.stringParam('contactName');

      Map<String, Object> binds = listBinds(contactName);
      List<Contact> records = (List<Contact>) QueryDefinitions.runPage(
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
      ctx.cache(ApiRequestContext.CachePolicy.NO_STORE);
      ctx.ok(SAPITransformer.toContacts(records));
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  /**
   * @description The list read as code: every field the response returns, the optional
   *              filters and the order. Query_Definition.SAPIContact_List ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault listDefault() {
    return new QueryDefinitions.QueryDefault(
        'Contact',
        'Id, Public_Key__c, Name, Title, Trailhead_URL__c, Career_Objective__c, ' +
        'LinkedIn_URL__c, Portfolio_URL__c'
      )
      .filter(
        'Is_Portfolio_Owner__c = true AND ' +
        '(IsDeleted = :hasContactName OR Name = :contactName)'
      )
      .orderBy('Name ASC')
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(listBinds(null));
  }

  private static Map<String, Object> listBinds(String contactName) {
    return new Map<String, Object>{
      'hasContactName' => String.isNotBlank(contactName),
      'contactName' => contactName
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
