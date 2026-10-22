/**
 * @description       : SAPI Project REST resource for portfolio data.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/05/2025
 * @Test Class        : [SAPIProjectTest]
 **/
@RestResource(urlMapping='/sapi/v1/projects/*')
global with sharing class SAPIProject {
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

      List<Project__c> projects;

      if (String.isNotBlank(projectId) && projectId != 'projects') {
        // Single record fetch
        projects = [
          SELECT
            Id,
            Name,
            Challenge__c,
            Solution__c,
            Business_Value__c,
            Status__c,
            Pillar__c,
            Pillar_Label__c,
            Hero_Image_URL__c,
            Is_Featured__c,
            Live_URL__c,
            Repository_URL__c,
            Date_Completed__c,
            Sort_Order__c,
            Contact__c,
            Contact__r.Name
          FROM Project__c
          WHERE Id = :projectId
          LIMIT 1
        ];

        if (projects.isEmpty()) {
          ctx.error(404, 'NOT_FOUND', 'Project not found: ' + projectId);
          return;
        }
      } else {
        // Build dynamic query with filters
        String baseQuery =
          'SELECT Id, Name, Status__c, Pillar__c, Pillar_Label__c, Hero_Image_URL__c, ' +
          'Is_Featured__c, Sort_Order__c, Contact__c, Contact__r.Name, ' +
          'Challenge__c, Solution__c, Business_Value__c, Live_URL__c, Repository_URL__c, Date_Completed__c ' +
          'FROM Project__c WHERE Status__c IN (\'Live – In Production\', \'Live – Demo / Reference\', \'Active Development\')';

        if (String.isNotBlank(statusFilter)) {
          baseQuery += ' AND Status__c = :statusFilter';
        }
        if (isFeatured != null) {
          baseQuery += ' AND Is_Featured__c = :isFeatured';
        }

        baseQuery += ' ORDER BY Sort_Order__c ASC NULLS LAST, Name ASC';
        baseQuery += ' LIMIT :limitParam OFFSET :offsetParam';

        projects = Database.query(baseQuery);

        ctx.paginate(countProjects(), projects.size());
      }

      ctx.cache(ApiRequestContext.CachePolicy.PUBLIC_300);
      ctx.ok(transformProjects(projects));
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  /**
   * @description Transforms Project__c records to the Project schema in salesforce-sapi.yaml.
   *              Every schema key is present, null when the field is empty (decision D4).
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

  private static Integer countProjects() {
    return [
      SELECT COUNT()
      FROM Project__c
      WHERE
        Status__c IN (
          'Live – In Production',
          'Live – Demo / Reference',
          'Active Development'
        )
    ];
  }

  @TestVisible
  private static Boolean throwException = false;
}
