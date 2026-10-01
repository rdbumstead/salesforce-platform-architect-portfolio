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
          'SELECT Id, Name, Status__c, Pillar__c, Hero_Image_URL__c, ' +
          'Is_Featured__c, Sort_Order__c, Contact__r.Name, ' +
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
   * @description Transforms Project__c records to API response format.
   */
  private static List<Map<String, Object>> transformProjects(
    List<Project__c> projects
  ) {
    List<Map<String, Object>> result = new List<Map<String, Object>>();
    for (Project__c p : projects) {
      Map<String, Object> proj = new Map<String, Object>();
      proj.put('id', p.Id);
      proj.put('name', p.Name);
      proj.put('status', p.Status__c);
      proj.put('pillar', p.Pillar__c);
      proj.put('heroImageUrl', p.Hero_Image_URL__c);
      proj.put('isFeatured', p.Is_Featured__c);
      proj.put('sortOrder', p.Sort_Order__c);
      proj.put('contactName', p.Contact__r?.Name);

      // Include detail fields if present
      if (p.Challenge__c != null)
        proj.put('challenge', p.Challenge__c);
      if (p.Solution__c != null)
        proj.put('solution', p.Solution__c);
      if (p.Business_Value__c != null)
        proj.put('businessValue', p.Business_Value__c);
      if (p.Live_URL__c != null)
        proj.put('liveUrl', p.Live_URL__c);
      if (p.Repository_URL__c != null)
        proj.put('repositoryUrl', p.Repository_URL__c);
      if (p.Date_Completed__c != null)
        proj.put('dateCompleted', String.valueOf(p.Date_Completed__c));

      result.add(proj);
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
