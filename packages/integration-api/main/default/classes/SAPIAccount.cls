/**
 * @description       : SAPI Account REST resource (/accounts) for employer and issuer records.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/20/2026
 * @Test Class        : [SAPIAccountTest]
 **/
@RestResource(urlMapping='/sapi/v1/accounts/*')
global with sharing class SAPIAccount {
  private static final String SELECT_FIELDS = 'SELECT Id, Name, Industry, Abbreviation__c FROM Account';
  private static final String ORDER_BY = ' ORDER BY Name ASC';

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

      String whereClause = ' WHERE Id != null';
      if (String.isNotBlank(accountName)) {
        whereClause += ' AND Name = :accountName';
      }

      List<Account> records = Database.query(
        SELECT_FIELDS +
          whereClause +
          ORDER_BY +
          ' LIMIT :limitParam OFFSET :offsetParam'
      );
      Integer totalCount = Database.countQuery(
        'SELECT COUNT() FROM Account' + whereClause
      );

      ctx.paginate(totalCount, records.size());
      ctx.cache(ApiRequestContext.CachePolicy.PUBLIC_300);
      ctx.ok(SAPITransformer.toAccounts(records));
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  @TestVisible
  private static Boolean throwException = false;
}
