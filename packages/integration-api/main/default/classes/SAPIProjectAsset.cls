/**
 * @description       : SAPI Project Asset REST resource (/project-assets).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 * @Test Class        : [SAPIProjectAssetTest]
 **/
// The old /v1/ spelling is kept as an alias until the path sunset (ADR-040). SAPIRouter serves the versionless URL.
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
      // v2 names the filter projectKey and takes a key only. v1 keeps projectId.
      if (ctx.isV2() && String.isNotBlank(ctx.stringParam('projectId'))) {
        ctx.error(400, 'BAD_REQUEST', 'Use projectKey in v2.');
        return;
      }
      String projectId = ctx.stringParam(
        ctx.isV2() ? 'projectKey' : 'projectId'
      );
      String projectIdRef = null;
      if (String.isNotBlank(projectId)) {
        projectIdRef = SAPITransformer.resolveReference(
          Project__c.SObjectType,
          projectId,
          ctx.isV2()
        );
        if (projectIdRef == null) {
          ctx.error(
            400,
            'BAD_REQUEST',
            ctx.isV2()
              ? 'projectKey must be a public key.'
              : 'projectId must be a Salesforce Id or a public key.'
          );
          return;
        }
      }

      Map<String, Object> binds = listBinds(projectIdRef);
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
        'Id, Public_Key__c, Name, Project__c, Project__r.Name, ' +
          'Project__r.Public_Key__c, Type__c, External_URL__c, Alt_Text__c, ' +
          'Sort_Order__c'
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
