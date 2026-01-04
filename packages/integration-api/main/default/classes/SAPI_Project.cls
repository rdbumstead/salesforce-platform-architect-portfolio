/**
 * @description       : SAPI Project REST resource for portfolio data.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/05/2025
 * @Test Class        : [SAPI_ProjectTest]
 **/
@RestResource(urlMapping='/sapi/v1/projects/*')
global with sharing class SAPI_Project {
  /**
   * @description GET method to retrieve all Project records or a single project by ID.
   *              Implements pagination, filtering, and proper error handling per spec.
   */
  @HttpGet
  global static void getProjects() {
    RestRequest req = RestContext.request;
    RestResponse res = RestContext.response;

    try {
      addCommonHeaders(res);

      // Extract path parameter for single record fetch
      String projectId = extractIdFromPath(req.requestURI, 'projects');

      // Query parameters
      Integer limitParam = getIntegerParam(req, 'limit', 50);
      Integer offsetParam = getIntegerParam(req, 'offset', 0);
      String statusFilter = req.params.get('status');
      Boolean isFeatured = getBooleanParam(req, 'isFeatured');

      // Validate parameters
      if (limitParam < 1 || limitParam > 200) {
        sendError(res, 400, 'BAD_REQUEST', 'Limit must be between 1 and 200.');
        return;
      }
      if (offsetParam < 0) {
        sendError(res, 400, 'BAD_REQUEST', 'Offset cannot be negative.');
        return;
      }

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
          WITH USER_MODE
          LIMIT 1
        ];

        if (projects.isEmpty()) {
          sendError(res, 404, 'NOT_FOUND', 'Project not found: ' + projectId);
          return;
        }

        res.addHeader('Cache-Control', 'max-age=300, public');
      } else {
        // Build dynamic query with filters
        String baseQuery =
          'SELECT Id, Name, Status__c, Pillar__c, Hero_Image_URL__c, ' +
          'Is_Featured__c, Sort_Order__c, Contact__r.Name ' +
          'FROM Project__c WHERE Status__c IN (\'Live – In Production\', \'Live – Demo / Reference\', \'Active Development\')';

        if (String.isNotBlank(statusFilter)) {
          baseQuery += ' AND Status__c = :statusFilter';
        }
        if (isFeatured != null) {
          baseQuery += ' AND Is_Featured__c = :isFeatured';
        }

        baseQuery += ' WITH USER_MODE ORDER BY Sort_Order__c ASC NULLS LAST, Name ASC';
        baseQuery += ' LIMIT :limitParam OFFSET :offsetParam';

        projects = Database.query(baseQuery);

        // Pagination headers
        res.addHeader('X-Total-Count', String.valueOf(countProjects()));
        res.addHeader(
          'X-Has-More',
          String.valueOf(projects.size() == limitParam)
        );
        res.addHeader('Cache-Control', 'max-age=300, public');
      }

      res.statusCode = 200;
      res.responseBody = Blob.valueOf(
        JSON.serialize(transformProjects(projects))
      );
    } catch (Exception e) {
      sendError(res, 500, 'INTERNAL_SERVER_ERROR', e.getMessage());
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
      WITH USER_MODE
    ];
  }

  private static void addCommonHeaders(RestResponse res) {
    res.addHeader('Content-Type', 'application/json');
    res.addHeader('X-Request-Id', Request.getCurrent().getRequestId());
    res.addHeader('X-API-Version', 'v1');
  }

  private static String extractIdFromPath(String uri, String resourceName) {
    Integer idx = uri.lastIndexOf('/');
    if (idx == -1)
      return null;
    String lastSegment = uri.substring(idx + 1);
    return (lastSegment == resourceName) ? null : lastSegment;
  }

  private static Integer getIntegerParam(
    RestRequest req,
    String param,
    Integer defaultVal
  ) {
    String val = req.params.get(param);
    if (String.isBlank(val))
      return defaultVal;
    try {
      return Integer.valueOf(val);
    } catch (Exception e) {
      return defaultVal;
    }
  }

  private static Boolean getBooleanParam(RestRequest req, String param) {
    String val = req.params.get(param);
    if (String.isBlank(val))
      return null;
    return Boolean.valueOf(val);
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
      'correlationId' => Request.getCurrent().getRequestId(),
      'retryable' => (statusCode >= 500)
    };
    res.responseBody = Blob.valueOf(JSON.serialize(error));
  }
}
