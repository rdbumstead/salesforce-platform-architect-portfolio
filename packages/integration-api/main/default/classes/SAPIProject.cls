/**
 * @description       : SAPI Project REST resource for portfolio data.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 12/05/2025
 * @Test Class        : [SAPIProjectTest]
 **/
@RestResource(urlMapping='/sapi/v1/projects/*')
global with sharing class SAPIProject implements QueryDefinitions.Provider {
  private static final String LIST_QUERY = 'SAPIProject_List';
  private static final String DETAIL_QUERY = 'SAPIProject_Detail';

  /**
   * @description GET method to retrieve all Project records or a single project by ID.
   *              Implements pagination, filtering, and proper error handling per spec.
   */
  @HttpGet
  global static void getProjects() {
    ApiRequestContext ctx = ApiRequestContext.begin();
    if (ctx.isRejected()) {
      return;
    }

    try {
      if (Test.isRunningTest() && throwException) {
        throw new CalloutException('Forced Exception');
      }

      // Path parameter for single record fetch (/projects/{id})
      String projectId = ctx.endpointSegment();

      Integer limitParam = ctx.limitParam();
      Integer offsetParam = ctx.offsetParam();
      if (ctx.isRejected()) {
        return;
      }
      String statusFilter = ctx.stringParam('status');
      Boolean isFeatured = ctx.boolParam('isFeatured');
      String contactName = ctx.stringParam('contactName');
      String projectName = ctx.stringParam('projectName');

      List<Project__c> projects;

      if (String.isNotBlank(projectId) && projectId != 'projects') {
        projects = (List<Project__c>) QueryDefinitions.run(
          DETAIL_QUERY,
          new Map<String, Object>{ 'projectId' => projectId },
          detailDefault()
        );

        if (projects.isEmpty()) {
          ctx.error(404, 'NOT_FOUND', 'Project not found: ' + projectId);
          return;
        }
      } else {
        projects = (List<Project__c>) QueryDefinitions.runPage(
          LIST_QUERY,
          listBinds(statusFilter, isFeatured, contactName, projectName),
          listDefault(),
          limitParam,
          offsetParam
        );
        // The total counts the rows the request's filters match, not one page of them.
        Integer totalCount = QueryDefinitions.count(
          LIST_QUERY,
          listBinds(statusFilter, isFeatured, contactName, projectName),
          listDefault()
        );

        ctx.paginate(totalCount, projects.size());
      }

      ctx.cache(ApiRequestContext.CachePolicy.PUBLIC_300);
      ctx.ok(transformProjects(projects));
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  /**
   * @description Transforms Project__c records to the Project schema in salesforce-sapi.yaml.
   *              Every schema key is present, null when the field is empty.
   */
  @TestVisible
  private static List<Map<String, Object>> transformProjects(
    List<Project__c> projects
  ) {
    List<Map<String, Object>> result = new List<Map<String, Object>>();
    for (Project__c p : projects) {
      result.add(
        new Map<String, Object>{
          'id' => p.Id,
          'name' => p.Name,
          'challenge' => p.Challenge__c,
          'solution' => p.Solution__c,
          'businessValue' => p.Business_Value__c,
          'status' => p.Status__c,
          'dateCompleted' => p.Date_Completed__c != null
            ? String.valueOf(p.Date_Completed__c)
            : null,
          'heroImageUrl' => p.Hero_Image_URL__c,
          'liveUrl' => p.Live_URL__c,
          'repositoryUrl' => p.Repository_URL__c,
          'pillar' => p.Pillar__c,
          'pillarLabel' => p.Pillar_Label__c,
          'isFeatured' => p.Is_Featured__c,
          'contactName' => p.Contact__r?.Name,
          'contactId' => p.Contact__c,
          'sortOrder' => p.Sort_Order__c
        }
      );
    }
    return result;
  }

  /**
   * @description The list read as code: every field the response returns, the optional
   *              filters and the order. Query_Definition.SAPIProject_List ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault listDefault() {
    return new QueryDefinitions.QueryDefault(
        'Project__c',
        'Id, Name, Status__c, Pillar__c, Pillar_Label__c, Hero_Image_URL__c, ' +
          'Is_Featured__c, Sort_Order__c, Contact__c, Contact__r.Name, ' +
          'Challenge__c, Solution__c, Business_Value__c, Live_URL__c, ' +
          'Repository_URL__c, Date_Completed__c'
      )
      .filter(
        'Status__c IN (\'Live – In Production\', \'Live – Demo / Reference\', ' +
          '\'Active Development\') AND ' +
          '(IsDeleted = :hasStatus OR Status__c = :status) AND ' +
          '(IsDeleted = :hasIsFeatured OR Is_Featured__c = :isFeatured) AND ' +
          '(IsDeleted = :hasContactName OR Contact__r.Name = :contactName) AND ' +
          '(IsDeleted = :hasProjectName OR Name = :projectName)'
      )
      .orderBy('Sort_Order__c ASC NULLS LAST, Name ASC')
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(listBinds(null, null, null, null));
  }

  /**
   * @description The single project read as code. Query_Definition.SAPIProject_Detail ships
   *              equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault detailDefault() {
    return new QueryDefinitions.QueryDefault(
        'Project__c',
        'Id, Name, Challenge__c, Solution__c, Business_Value__c, Status__c, ' +
          'Pillar__c, Pillar_Label__c, Hero_Image_URL__c, Is_Featured__c, ' +
          'Live_URL__c, Repository_URL__c, Date_Completed__c, Sort_Order__c, ' +
          'Contact__c, Contact__r.Name'
      )
      .filter('Id = :projectId')
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .rowLimit(1)
      .binds(new Map<String, Object>{ 'projectId' => null });
  }

  private static Map<String, Object> listBinds(
    String status,
    Boolean isFeatured,
    String contactName,
    String projectName
  ) {
    return new Map<String, Object>{
      'hasStatus' => String.isNotBlank(status),
      'status' => status,
      'hasIsFeatured' => isFeatured != null,
      'isFeatured' => isFeatured,
      'hasContactName' => String.isNotBlank(contactName),
      'contactName' => contactName,
      'hasProjectName' => String.isNotBlank(projectName),
      'projectName' => projectName
    };
  }

  /**
   * @description The code defaults this class owns, for QueryDefinitions.validateAll().
   * @return Map<String, QueryDefinitions.QueryDefault> The defaults by record name.
   */
  public Map<String, QueryDefinitions.QueryDefault> queryDefaults() {
    return new Map<String, QueryDefinitions.QueryDefault>{
      LIST_QUERY => listDefault(),
      DETAIL_QUERY => detailDefault()
    };
  }

  @TestVisible
  private static Boolean throwException = false;
}
