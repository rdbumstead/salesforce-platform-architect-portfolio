/**
 * @description       : SAPI Contact REST resource (/contacts). Returns the portfolio owner only, reading only the Contact fields granted by Integration_Access.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/20/2026
 * @Test Class        : [SAPIContactTest]
 **/
@RestResource(urlMapping='/sapi/v1/contacts/*')
global with sharing class SAPIContact {
  private static final String SELECT_FIELDS = 'SELECT Id, Name, Title, Trailhead_URL__c, Career_Objective__c, LinkedIn_URL__c, Portfolio_URL__c FROM Contact';
  private static final String ORDER_BY = ' ORDER BY Name ASC';

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

      String whereClause = ' WHERE Is_Portfolio_Owner__c = true';
      if (String.isNotBlank(contactName)) {
        whereClause += ' AND Name = :contactName';
      }

      List<Contact> records = Database.query(
        SELECT_FIELDS +
          whereClause +
          ORDER_BY +
          ' LIMIT :limitParam OFFSET :offsetParam'
      );
      Integer totalCount = Database.countQuery(
        'SELECT COUNT() FROM Contact' + whereClause
      );

      ctx.paginate(totalCount, records.size());
      ctx.cache(ApiRequestContext.CachePolicy.NO_STORE);
      ctx.ok(SAPITransformer.toContacts(records));
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  @TestVisible
  private static Boolean throwException = false;
}
