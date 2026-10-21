/**
 * @description       : SAPI Project Asset REST resource (/project-assets).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/20/2026
 * @Test Class        : [SAPIProjectAssetTest]
 **/
@RestResource(urlMapping='/sapi/v1/project-assets/*')
global with sharing class SAPIProjectAsset {
  private static final String SELECT_FIELDS = 'SELECT Id, Name, Project__c, Project__r.Name, Type__c, External_URL__c, Alt_Text__c, Sort_Order__c FROM Project_Asset__c';
  private static final String ORDER_BY = ' ORDER BY Sort_Order__c ASC NULLS LAST, Name ASC';

  /**
   * @description GET method. Retrieves Project_Asset__c records with pagination and a projectId filter.
   */
  @HttpGet
  global static void getProjectAssets() {
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
      String projectId = ctx.stringParam('projectId');
      if (
        String.isNotBlank(projectId) &&
        !SAPITransformer.isSalesforceId(projectId)
      ) {
        ctx.error(400, 'BAD_REQUEST', 'projectId must be a Salesforce Id.');
        return;
      }

      String whereClause = ' WHERE Id != null';
      if (String.isNotBlank(projectId)) {
        projectId = projectId.trim();
        whereClause += ' AND Project__c = :projectId';
      }

      List<Project_Asset__c> records = Database.query(
        SELECT_FIELDS +
          whereClause +
          ORDER_BY +
          ' LIMIT :limitParam OFFSET :offsetParam'
      );
      Integer totalCount = Database.countQuery(
        'SELECT COUNT() FROM Project_Asset__c' + whereClause
      );

      ctx.paginate(totalCount, records.size());
      ctx.cache(ApiRequestContext.CachePolicy.PUBLIC_300);
      ctx.ok(SAPITransformer.toProjectAssets(records));
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  @TestVisible
  private static Boolean throwException = false;
}
