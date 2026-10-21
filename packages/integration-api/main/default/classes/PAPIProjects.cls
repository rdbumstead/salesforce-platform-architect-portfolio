/**
 * @description       : PAPI Projects endpoint with featured projects enrichment.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/05/2025
 * @Test Class        : [PAPIProjectsTest]
 **/
@RestResource(urlMapping='/papi/v1/projects/*')
global with sharing class PAPIProjects {
  /**
   * @description GET method to retrieve projects.
   *              /projects/featured - Featured projects only
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

      String endpoint = ctx.endpointSegment();

      if (endpoint == 'featured') {
        getFeaturedProjects(ctx);
      } else {
        getAllProjects(ctx);
      }
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  /**
   * @description Gets featured projects with enrichment.
   */
  private static void getFeaturedProjects(ApiRequestContext ctx) {
    PAPITransformer.Aggregation agg = new PAPITransformer.Aggregation();
    agg.source('projects');
    List<Project__c> projects = [
      SELECT
        Id,
        Name,
        Challenge__c,
        Solution__c,
        Business_Value__c,
        Status__c,
        Hero_Image_URL__c,
        Live_URL__c,
        Repository_URL__c,
        Date_Completed__c,
        Is_Featured__c
      FROM Project__c
      WHERE
        Is_Featured__c = TRUE
        AND Status__c IN (
          'Live – In Production',
          'Live – Demo / Reference',
          'Active Development'
        )
      ORDER BY Sort_Order__c ASC NULLS LAST, Name ASC
      LIMIT 10
    ];

    respond(ctx, enrichProjects(projects, agg), agg);
  }

  /**
   * @description Gets all visible projects with enrichment.
   */
  private static void getAllProjects(ApiRequestContext ctx) {
    PAPITransformer.Aggregation agg = new PAPITransformer.Aggregation();
    agg.source('projects');
    List<Project__c> projects = [
      SELECT
        Id,
        Name,
        Challenge__c,
        Solution__c,
        Business_Value__c,
        Status__c,
        Hero_Image_URL__c,
        Live_URL__c,
        Repository_URL__c,
        Date_Completed__c,
        Is_Featured__c
      FROM Project__c
      WHERE
        Status__c IN (
          'Live – In Production',
          'Live – Demo / Reference',
          'Active Development'
        )
      ORDER BY Sort_Order__c ASC NULLS LAST, Name ASC
      LIMIT 50
    ];

    respond(ctx, enrichProjects(projects, agg), agg);
  }

  /**
   * @description Writes the project list. The body is an array, so the integrity state
   *              travels in headers: X-Data-Integrity always, X-Integrity-Note when partial.
   */
  private static void respond(
    ApiRequestContext ctx,
    List<Map<String, Object>> enrichedProjects,
    PAPITransformer.Aggregation agg
  ) {
    ctx.header('X-Total-Count', String.valueOf(enrichedProjects.size()));
    ctx.header('X-Data-Integrity', agg.integrity());
    if (!agg.isComplete()) {
      ctx.header('X-Integrity-Note', agg.integrityNote());
    }
    ctx.cache(agg.cachePolicy());
    ctx.ok(enrichedProjects);
  }

  /**
   * @description Enriches projects with skills and assets. A failed skills or assets read
   *              leaves those lists empty and is recorded on the aggregation; it never fails
   *              the whole response. Shared with PAPIProfile.
   * @param projects Projects to enrich.
   * @param agg Aggregation that records sources and failures.
   * @return List<Map<String, Object>> EnrichedProject maps in the order given.
   */
  public static List<Map<String, Object>> enrichProjects(
    List<Project__c> projects,
    PAPITransformer.Aggregation agg
  ) {
    Set<Id> projIds = new Set<Id>();
    for (Project__c p : projects) {
      projIds.add(p.Id);
    }

    Map<Id, List<String>> skillsMap = getProjectSkills(projIds, agg);
    Map<Id, List<Map<String, Object>>> assetsMap = getProjectAssets(
      projIds,
      agg
    );

    List<Map<String, Object>> result = new List<Map<String, Object>>();
    for (Project__c p : projects) {
      List<String> techs = skillsMap.containsKey(p.Id)
        ? skillsMap.get(p.Id)
        : new List<String>();
      List<Map<String, Object>> assets = assetsMap.containsKey(p.Id)
        ? assetsMap.get(p.Id)
        : new List<Map<String, Object>>();
      result.add(PAPITransformer.transformProject(p, techs, assets));
    }

    return result;
  }

  private static Map<Id, List<String>> getProjectSkills(
    Set<Id> projIds,
    PAPITransformer.Aggregation agg
  ) {
    agg.source('project-skills');
    Map<Id, List<String>> skillsMap = new Map<Id, List<String>>();
    try {
      PAPITransformer.guardSection('project-skills');
      for (Project_Skill__c ps : [
        SELECT Project__c, Skill__r.Name
        FROM Project_Skill__c
        WHERE Project__c IN :projIds
      ]) {
        if (!skillsMap.containsKey(ps.Project__c)) {
          skillsMap.put(ps.Project__c, new List<String>());
        }
        skillsMap.get(ps.Project__c).add(ps.Skill__r.Name);
      }
    } catch (Exception e) {
      agg.fail('project-skills');
      skillsMap.clear();
    }
    return skillsMap;
  }

  private static Map<Id, List<Map<String, Object>>> getProjectAssets(
    Set<Id> projIds,
    PAPITransformer.Aggregation agg
  ) {
    agg.source('project-assets');
    Map<Id, List<Map<String, Object>>> assetsMap = new Map<Id, List<Map<String, Object>>>();
    try {
      PAPITransformer.guardSection('project-assets');
      for (Project_Asset__c pa : [
        SELECT Project__c, Name, Type__c, External_URL__c, Alt_Text__c
        FROM Project_Asset__c
        WHERE Project__c IN :projIds
        ORDER BY Sort_Order__c ASC
      ]) {
        if (!assetsMap.containsKey(pa.Project__c)) {
          assetsMap.put(pa.Project__c, new List<Map<String, Object>>());
        }
        assetsMap.get(pa.Project__c)
          .add(
            new Map<String, Object>{
              'type' => pa.Type__c,
              'url' => pa.External_URL__c,
              'caption' => pa.Alt_Text__c
            }
          );
      }
    } catch (Exception e) {
      agg.fail('project-assets');
      assetsMap.clear();
    }
    return assetsMap;
  }

  @TestVisible
  private static Boolean throwException = false;
}
