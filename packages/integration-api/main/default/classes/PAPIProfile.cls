/**
 * @description       : PAPI Profile orchestration endpoint that aggregates multiple SAPI calls.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/05/2025
 * @Test Class        : [PAPIProfileTest]
 **/
@RestResource(urlMapping='/papi/v1/profile/*')
global with sharing class PAPIProfile {
  /**
   * @description GET method to retrieve full portfolio or summary based on path.
   *              /profile/full - Complete portfolio payload
   *              /profile/summary - Employment profile only
   */
  @HttpGet
  global static void getProfile() {
    RestRequest req = RestContext.request;
    RestResponse res = RestContext.response;

    try {
      addCommonHeaders(res);

      String endpoint = extractEndpoint(req.requestURI);

      if (endpoint == 'full') {
        getFullPortfolio(res);
      } else if (endpoint == 'summary') {
        getProfileSummary(res);
      } else {
        sendError(
          res,
          400,
          'BAD_REQUEST',
          'Invalid endpoint. Use /profile/full or /profile/summary'
        );
      }
    } catch (Exception e) {
      sendError(res, 500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  /**
   * @description Gets the complete portfolio payload (hydration endpoint).
   */
  private static void getFullPortfolio(RestResponse res) {
    Map<String, Object> payload = new Map<String, Object>();
    String integrityNote = 'complete';

    // 1. Fetch Contact
    List<Contact> contacts = [
      SELECT
        Id,
        Name,
        Email,
        Phone,
        Title,
        LinkedIn_URL__c,
        GitHub_URL__c,
        Trailhead_URL__c,
        Portfolio_URL__c,
        Career_Objective__c
      FROM Contact
      WHERE Is_Portfolio_Owner__c = TRUE
      LIMIT 1
    ];

    if (!contacts.isEmpty()) {
      payload.put('contactInfo', PAPITransformer.transformContact(contacts[0]));
      payload.put('config', buildConfig(contacts[0]));
    } else {
      payload.put('contactInfo', new Map<String, Object>());
      payload.put('config', new Map<String, Object>());
      integrityNote = 'partial';
    }

    // 2. Fetch Experience with Highlights
    List<Experience__c> experiences = [
      SELECT
        Id,
        Name,
        Employer__c,
        Employer__r.Name,
        Start_Date__c,
        End_Date__c,
        Is_Current_Role__c,
        Is_Remote__c,
        (
          SELECT Id, Description__c
          FROM Experience_Highlights__r
          ORDER BY Sort_Order__c ASC
        )
      FROM Experience__c
      ORDER BY Is_Current_Role__c DESC, End_Date__c DESC NULLS FIRST
      LIMIT 50
    ];

    // Fetch Experience-Skill junctions
    Map<Id, List<String>> expSkillsMap = getExperienceSkills(experiences);

    List<Map<String, Object>> enrichedExperiences = new List<Map<String, Object>>();
    for (Experience__c exp : experiences) {
      List<String> skills = expSkillsMap.containsKey(exp.Id)
        ? expSkillsMap.get(exp.Id)
        : new List<String>();
      List<String> highlights = new List<String>();
      for (Experience_Highlight__c h : exp.Experience_Highlights__r) {
        highlights.add(h.Description__c);
      }
      enrichedExperiences.add(
        PAPITransformer.transformExperience(exp, skills, highlights)
      );
    }
    payload.put('experience', enrichedExperiences);
    payload.put('summary', PAPITransformer.calculateSummary(experiences));

    // 3. Fetch Skills
    List<Skill__c> skills = [
      SELECT Id, Name, Category__c, Proficiency__c, Icon_Name__c
      FROM Skill__c
      ORDER BY Proficiency__c DESC, Name ASC
      LIMIT 100
    ];

    List<Map<String, Object>> transformedSkills = new List<Map<String, Object>>();
    for (Skill__c s : skills) {
      transformedSkills.add(PAPITransformer.transformSkill(s));
    }
    payload.put('skills', transformedSkills);

    // 4. Fetch Projects with Assets
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

    Map<Id, List<String>> projSkillsMap = getProjectSkills(projects);
    Map<Id, List<Map<String, Object>>> projAssetsMap = getProjectAssets(
      projects
    );

    List<Map<String, Object>> enrichedProjects = new List<Map<String, Object>>();
    for (Project__c p : projects) {
      List<String> techs = projSkillsMap.containsKey(p.Id)
        ? projSkillsMap.get(p.Id)
        : new List<String>();
      List<Map<String, Object>> assets = projAssetsMap.containsKey(p.Id)
        ? projAssetsMap.get(p.Id)
        : new List<Map<String, Object>>();
      enrichedProjects.add(PAPITransformer.transformProject(p, techs, assets));
    }
    payload.put('projects', enrichedProjects);

    // 5. Fetch Certifications
    List<Certification__c> certs = [
      SELECT Id, Name, Issuer__c, Earned_Date__c
      FROM Certification__c
      ORDER BY Earned_Date__c DESC
      LIMIT 50
    ];

    List<Map<String, Object>> transformedCerts = new List<Map<String, Object>>();
    for (Certification__c c : certs) {
      transformedCerts.add(
        new Map<String, Object>{
          'id' => c.Id,
          'name' => c.Name,
          'issuer' => c.Issuer__c,
          'dateEarned' => c.Earned_Date__c != null
            ? String.valueOf(c.Earned_Date__c)
            : null,
          'skillsUsed' => new List<String>()
        }
      );
    }
    payload.put('certifications', transformedCerts);

    // 6. Fetch Education
    List<Education__c> education = [
      SELECT
        Id,
        Issuer__c,
        Issuer__r.Name,
        Name,
        Field_of_Study__c,
        Graduation_Date__c,
        GPA__c
      FROM Education__c
      ORDER BY Graduation_Date__c DESC
      LIMIT 10
    ];

    List<Map<String, Object>> transformedEdu = new List<Map<String, Object>>();
    for (Education__c e : education) {
      transformedEdu.add(
        new Map<String, Object>{
          'id' => e.Id,
          'school' => e.Issuer__r.Name,
          'degree' => e.Name,
          'fieldOfStudy' => e.Field_of_Study__c,
          'year' => e.Graduation_Date__c != null
            ? String.valueOf(e.Graduation_Date__c.year())
            : null,
          'gpa' => e.GPA__c
        }
      );
    }
    payload.put('education', transformedEdu);

    // 7. Fetch Testimonials
    List<Testimonial__c> testimonials = [
      SELECT
        Id,
        Author_Name__c,
        Author_Title__c,
        Relationship_Type__c,
        Context__c,
        Vibe_Mode__c,
        Avatar_URL__c
      FROM Testimonial__c
      WHERE Approved__c = TRUE
      ORDER BY CreatedDate DESC
      LIMIT 20
    ];

    List<Map<String, Object>> transformedTestimonials = new List<Map<String, Object>>();
    for (Testimonial__c t : testimonials) {
      transformedTestimonials.add(PAPITransformer.transformTestimonial(t));
    }
    payload.put('testimonials', transformedTestimonials);

    payload.put('integrityNote', integrityNote);

    // Apply cache control based on strictest policy (Contact = no-store)
    res.addHeader('Cache-Control', 'no-store, no-cache');
    res.addHeader('X-Data-Integrity', integrityNote);
    res.statusCode = 200;
    res.responseBody = Blob.valueOf(JSON.serialize(payload));
  }

  /**
   * @description Gets the profile summary (resume page).
   */
  private static void getProfileSummary(RestResponse res) {
    Map<String, Object> payload = new Map<String, Object>();

    // Simplified version - contact + experience + skills + certs + education
    List<Contact> contacts = [
      SELECT
        Id,
        Name,
        Email,
        Phone,
        Title,
        Career_Objective__c,
        LinkedIn_URL__c,
        GitHub_URL__c,
        Trailhead_URL__c,
        Portfolio_URL__c
      FROM Contact
      WHERE Is_Portfolio_Owner__c = TRUE
      LIMIT 1
    ];

    if (!contacts.isEmpty()) {
      payload.put('contactInfo', PAPITransformer.transformContact(contacts[0]));
    }

    List<Experience__c> experiences = [
      SELECT
        Id,
        Name,
        Employer__r.Name,
        Start_Date__c,
        End_Date__c,
        Is_Current_Role__c,
        Is_Remote__c
      FROM Experience__c
      ORDER BY Is_Current_Role__c DESC, End_Date__c DESC NULLS FIRST
      LIMIT 20
    ];

    List<Map<String, Object>> enrichedExperiences = new List<Map<String, Object>>();
    for (Experience__c exp : experiences) {
      enrichedExperiences.add(
        PAPITransformer.transformExperience(
          exp,
          new List<String>(),
          new List<String>()
        )
      );
    }
    payload.put('experience', enrichedExperiences);
    payload.put('summary', PAPITransformer.calculateSummary(experiences));

    List<Skill__c> skills = [
      SELECT Id, Name, Category__c, Proficiency__c, Icon_Name__c
      FROM Skill__c
      ORDER BY Proficiency__c DESC
      LIMIT 50
    ];

    List<Map<String, Object>> transformedSkills = new List<Map<String, Object>>();
    for (Skill__c s : skills) {
      transformedSkills.add(PAPITransformer.transformSkill(s));
    }
    payload.put('skills', transformedSkills);

    // Certifications and Education omitted for brevity
    payload.put('certifications', new List<Map<String, Object>>());
    payload.put('education', new List<Map<String, Object>>());

    res.addHeader('Cache-Control', 'max-age=300, private');
    res.statusCode = 200;
    res.responseBody = Blob.valueOf(JSON.serialize(payload));
  }

  // --- Helper Methods ---

  private static Map<String, Object> buildConfig(Contact c) {
    return new Map<String, Object>{
      'ownerEmail' => c.Email,
      'ownerPhone' => c.Phone,
      'linkedInUrl' => c.LinkedIn_URL__c,
      'githubUrl' => c.GitHub_URL__c,
      'trailheadUrl' => c.Trailhead_URL__c,
      'personalWebsiteUrl' => c.Portfolio_URL__c,
      'careerObjective' => c.Career_Objective__c
    };
  }

  private static Map<Id, List<String>> getExperienceSkills(
    List<Experience__c> experiences
  ) {
    Set<Id> expIds = new Set<Id>();
    for (Experience__c e : experiences) {
      expIds.add(e.Id);
    }

    Map<Id, List<String>> result = new Map<Id, List<String>>();
    for (Experience_Skill__c es : [
      SELECT Experience__c, Skill__r.Name
      FROM Experience_Skill__c
      WHERE Experience__c IN :expIds
    ]) {
      if (!result.containsKey(es.Experience__c)) {
        result.put(es.Experience__c, new List<String>());
      }
      result.get(es.Experience__c).add(es.Skill__r.Name);
    }
    return result;
  }

  private static Map<Id, List<String>> getProjectSkills(
    List<Project__c> projects
  ) {
    Set<Id> projIds = new Set<Id>();
    for (Project__c p : projects) {
      projIds.add(p.Id);
    }

    Map<Id, List<String>> result = new Map<Id, List<String>>();
    for (Project_Skill__c ps : [
      SELECT Project__c, Skill__r.Name
      FROM Project_Skill__c
      WHERE Project__c IN :projIds
    ]) {
      if (!result.containsKey(ps.Project__c)) {
        result.put(ps.Project__c, new List<String>());
      }
      result.get(ps.Project__c).add(ps.Skill__r.Name);
    }
    return result;
  }

  private static Map<Id, List<Map<String, Object>>> getProjectAssets(
    List<Project__c> projects
  ) {
    Set<Id> projIds = new Set<Id>();
    for (Project__c p : projects) {
      projIds.add(p.Id);
    }

    Map<Id, List<Map<String, Object>>> result = new Map<Id, List<Map<String, Object>>>();
    for (Project_Asset__c pa : [
      SELECT Project__c, Name, Type__c, External_URL__c, Alt_Text__c
      FROM Project_Asset__c
      WHERE Project__c IN :projIds
      ORDER BY Sort_Order__c ASC
    ]) {
      if (!result.containsKey(pa.Project__c)) {
        result.put(pa.Project__c, new List<Map<String, Object>>());
      }
      result.get(pa.Project__c)
        .add(
          new Map<String, Object>{
            'type' => pa.Type__c,
            'url' => pa.External_URL__c,
            'caption' => pa.Alt_Text__c
          }
        );
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
