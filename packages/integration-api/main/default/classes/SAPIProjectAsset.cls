/**
 * @description       : SAPI Project Asset REST resource (/project-assets).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/20/2026
 * @Test Class        : [SAPIProjectAssetTest]
 **/
@RestResource(urlMapping='/sapi/v1/project-assets/*')
global with sharing class SAPIProjectAsset implements QueryDefinitions.Provider {
  private static final String LIST_QUERY = 'SAPIProjectAsset_List';

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

      Map<String, Object> binds = listBinds(projectId?.trim());
      List<Project_Asset__c> records = (List<Project_Asset__c>) QueryDefinitions.runPage(
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
      ctx.ok(SAPITransformer.toProjectAssets(records));
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  /**
   * @description The list read as code: every field the response returns, the optional
   *              filters and the order. Query_Definition.SAPIProjectAsset_List ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault listDefault() {
    return new QueryDefinitions.QueryDefault(
        'Project_Asset__c',
        'Id, Name, Project__c, Project__r.Name, Type__c, External_URL__c, ' +
        'Alt_Text__c, Sort_Order__c'
      )
      .filter('(IsDeleted = :hasProjectId OR Project__c = :projectId)')
      .orderBy('Sort_Order__c ASC NULLS LAST, Name ASC')
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(listBinds(null));
  }

  private static Map<String, Object> listBinds(String projectId) {
    return new Map<String, Object>{
      'hasProjectId' => String.isNotBlank(projectId),
      'projectId' => projectId
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
