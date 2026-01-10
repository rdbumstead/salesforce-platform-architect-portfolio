/**
 * @description       : PAPI Resume endpoint that generates ATS-optimized plain text resumes.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/05/2025
 * @Test Class        : [PAPIResumeTest]
 **/
@RestResource(urlMapping='/papi/v1/resume/*')
global with sharing class PAPIResume {
  /**
   * @description GET method to generate resume.
   *              /resume/generate?persona={Admin|Developer|Architect}
   */
  @HttpGet
  global static void getResume() {
    RestRequest req = RestContext.request;
    RestResponse res = RestContext.response;

    try {
      addCommonHeaders(res);

      String endpoint = extractEndpoint(req.requestURI);
      String persona = req.params.get('persona');

      if (endpoint == 'generate') {
        generateResume(res, persona);
      } else {
        sendError(
          res,
          400,
          'BAD_REQUEST',
          'Invalid endpoint. Use /resume/generate'
        );
      }
    } catch (Exception e) {
      sendError(res, 500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  /**
   * @description Generates a plain text resume.
   */
  private static void generateResume(RestResponse res, String persona) {
    if (String.isNotBlank(persona)) {
      Set<String> validPersonas = new Set<String>{
        'Admin',
        'Developer',
        'Architect'
      };
      if (!validPersonas.contains(persona)) {
        sendError(
          res,
          400,
          'BAD_REQUEST',
          'Invalid persona. Valid values: Admin, Developer, Architect'
        );
        return;
      }
    }

    // Fetch Contact
    List<Contact> contacts = [
      SELECT Id, Name, Email, Phone, Title, Career_Objective__c
      FROM Contact
      WHERE Is_Portfolio_Owner__c = TRUE
      LIMIT 1
    ];

    String resumeText = '';

    if (!contacts.isEmpty()) {
      Contact c = contacts[0];
      resumeText += c.Name + '\n';
      resumeText +=
        (c.Title != null ? c.Title : 'Salesforce Professional') + '\n';
      resumeText += c.Email + (c.Phone != null ? ' | ' + c.Phone : '') + '\n\n';
    }

    // Experience Section
    resumeText += 'EXPERIENCE\n\n';

    // Build experience query - fetch all highlights, filter in memory if persona provided
    List<Experience__c> experiences = [
      SELECT
        Id,
        Employer__r.Name,
        Position_Title__c,
        Start_Date__c,
        End_Date__c,
        Is_Current_Role__c,
        (
          SELECT Description__c, Persona_Tag__c
          FROM Experience_Highlights__r
          ORDER BY Sort_Order__c ASC
        )
      FROM Experience__c
      ORDER BY Is_Current_Role__c DESC, End_Date__c DESC NULLS FIRST
      LIMIT 10
    ];

    for (Experience__c exp : experiences) {
      String employer = exp.Employer__r?.Name != null
        ? exp.Employer__r.Name
        : 'Unknown';
      String role = exp.Position_Title__c != null
        ? exp.Position_Title__c
        : 'Role';
      resumeText += employer + ' | ' + role + '\n';
      resumeText +=
        PAPITransformer.formatDateRange(exp.Start_Date__c, exp.End_Date__c) +
        '\n';

      Integer highlightCount = 0;
      for (Experience_Highlight__c h : exp.Experience_Highlights__r) {
        // Filter by persona if provided, otherwise include all
        if (
          String.isBlank(persona) ||
          (h.Persona_Tag__c != null && h.Persona_Tag__c.contains(persona))
        ) {
          resumeText += '- ' + h.Description__c + '\n';
          highlightCount++;
          if (highlightCount >= 5)
            break; // Limit to 5 highlights per experience
        }
      }
      resumeText += '\n';
    }

    // Skills Section
    resumeText += 'SKILLS\n\n';

    List<Skill__c> skills = [
      SELECT Name, Category__c, Proficiency__c
      FROM Skill__c
      ORDER BY Proficiency__c DESC
      LIMIT 20
    ];

    Map<String, List<String>> skillsByCategory = new Map<String, List<String>>();
    for (Skill__c s : skills) {
      String cat = s.Category__c != null ? s.Category__c : 'Other';
      if (!skillsByCategory.containsKey(cat)) {
        skillsByCategory.put(cat, new List<String>());
      }
      skillsByCategory.get(cat).add(s.Name);
    }

    for (String cat : skillsByCategory.keySet()) {
      resumeText +=
        cat +
        ': ' +
        String.join(skillsByCategory.get(cat), ', ') +
        '\n';
    }
    resumeText += '\n';

    // Certifications Section
    resumeText += 'CERTIFICATIONS\n\n';

    List<Certification__c> certs = [
      SELECT Name, Issuer__c, Earned_Date__c
      FROM Certification__c
      ORDER BY Earned_Date__c DESC
      LIMIT 10
    ];

    for (Certification__c cert : certs) {
      resumeText += cert.Name;
      if (cert.Issuer__c != null)
        resumeText += ' - ' + cert.Issuer__c;
      if (cert.Earned_Date__c != null)
        resumeText +=
          ' (' +
          PAPITransformer.formatMonthYear(cert.Earned_Date__c) +
          ')';
      resumeText += '\n';
    }
    resumeText += '\n';

    // Education Section
    resumeText += 'EDUCATION\n\n';

    List<Education__c> education = [
      SELECT
        Issuer__c,
        Issuer__r.Name,
        Degree__c,
        Field_of_Study__c,
        Graduation_Date__c
      FROM Education__c
      ORDER BY Graduation_Date__c DESC
      LIMIT 5
    ];

    for (Education__c edu : education) {
      String schoolName = edu.Issuer__r?.Name != null
        ? edu.Issuer__r.Name
        : 'Unknown';
      resumeText += schoolName + '\n';
      if (edu.Degree__c != null) {
        resumeText += edu.Degree__c;
        if (edu.Field_of_Study__c != null)
          resumeText += ' in ' + edu.Field_of_Study__c;
        if (edu.Graduation_Date__c != null)
          resumeText += ' (' + edu.Graduation_Date__c.year() + ')';
        resumeText += '\n';
      }
      resumeText += '\n';
    }

    Map<String, Object> response = new Map<String, Object>{
      'generatedText' => resumeText.trim(),
      'persona' => persona,
      'generatedAt' => Datetime.now().formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\'')
    };

    res.addHeader('Cache-Control', 'no-cache');
    res.statusCode = 200;
    res.responseBody = Blob.valueOf(JSON.serialize(response));
  }

  private static String extractEndpoint(String uri) {
    Integer idx = uri.lastIndexOf('/');
    if (idx == -1)
      return '';
    return uri.substring(idx + 1);
  }

  private static void addCommonHeaders(RestResponse res) {
    res.addHeader('Content-Type', 'application/json');
    String requestId = getRequestId();
    res.addHeader('X-Request-Id', requestId);
    res.addHeader('X-API-Version', 'v1');
  }

  private static String getRequestId() {
    try {
      return Request.getCurrent()?.getRequestId();
    } catch (Exception e) {
      return 'N/A';
    }
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
      'correlationId' => getRequestId(),
      'retryable' => (statusCode >= 500)
    };
    res.responseBody = Blob.valueOf(JSON.serialize(error));
  }
}
