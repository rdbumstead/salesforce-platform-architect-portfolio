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
    RestRequest req = RestContext.request;
    RestResponse res = RestContext.response;

    try {
      addCommonHeaders(res);

      String endpoint = extractEndpoint(req.requestURI);

      if (endpoint == 'featured') {
        getFeaturedProjects(res);
      } else {
        getAllProjects(res);
      }
    } catch (Exception e) {
      sendError(res, 500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  /**
   * @description Gets featured projects with enrichment.
   */
  private static void getFeaturedProjects(RestResponse res) {
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

    List<Map<String, Object>> enrichedProjects = enrichProjects(projects);

    res.addHeader('X-Total-Count', String.valueOf(enrichedProjects.size()));
    res.addHeader('Cache-Control', 'max-age=300, public');
    res.statusCode = 200;
    res.responseBody = Blob.valueOf(JSON.serialize(enrichedProjects));
  }

  /**
   * @description Gets all visible projects with enrichment.
   */
  private static void getAllProjects(RestResponse res) {
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

    List<Map<String, Object>> enrichedProjects = enrichProjects(projects);

    res.addHeader('X-Total-Count', String.valueOf(enrichedProjects.size()));
    res.addHeader('Cache-Control', 'max-age=300, public');
    res.statusCode = 200;
    res.responseBody = Blob.valueOf(JSON.serialize(enrichedProjects));
  }

  /**
   * @description Enriches projects with skills and assets.
   */
  private static List<Map<String, Object>> enrichProjects(
    List<Project__c> projects
  ) {
    Set<Id> projIds = new Set<Id>();
    for (Project__c p : projects) {
      projIds.add(p.Id);
    }

    // Fetch Project Skills
    Map<Id, List<String>> skillsMap = new Map<Id, List<String>>();
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

    // Fetch Project Assets
    Map<Id, List<Map<String, Object>>> assetsMap = new Map<Id, List<Map<String, Object>>>();
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

    // Transform projects
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

  private static String extractEndpoint(String uri) {
    Integer idx = uri.lastIndexOf('/');
    if (idx == -1)
      return '';
    return uri.substring(idx + 1);
  }

  private static void addCommonHeaders(RestResponse res) {
    res.addHeader('Content-Type', 'application/json');
    res.addHeader('X-Request-Id', RequestUtil.getRequestId());
    res.addHeader('X-API-Version', 'v1');
  }

  private static void sendError(
    RestResponse res,
    Integer statusCode,
    String errorCode,
    String message
  ) {
    res.statusCode = statusCode;
    Map<String, Object> error = new Map<String, Object>{
      'httpStatus' => statusCode,
      'errorCode' => errorCode,
      'message' => message,
      'correlationId' => RequestUtil.getRequestId(),
      'retryable' => (statusCode >= 500)
    };
    res.responseBody = Blob.valueOf(JSON.serialize(error));
  }
}
