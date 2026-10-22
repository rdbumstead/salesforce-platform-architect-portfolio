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
   *              Each section is read independently: a section that fails is returned
   *              empty, X-Data-Integrity becomes "partial" and integrityNote names it.
   */
  @HttpGet
  global static void getProfile() {
    ApiRequestContext ctx = ApiRequestContext.begin();
    if (ctx.isRejected()) {
      return;
    }

    try {
      if (Test.isRunningTest() && throwException) {
        throw new CalloutException('Forced Exception');
      }

      String endpoint = ctx.endpointSegment();

      if (endpoint == 'full') {
        getFullPortfolio(ctx);
      } else if (endpoint == 'summary') {
        getProfileSummary(ctx);
      } else {
        ctx.error(
          400,
          'BAD_REQUEST',
          'Invalid endpoint. Use /profile/full or /profile/summary'
        );
      }
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  /**
   * @description Gets the complete portfolio payload (hydration endpoint). Cache-Control is
   *              the strictest policy of every upstream resource read.
   */
  private static void getFullPortfolio(ApiRequestContext ctx) {
    PAPITransformer.Aggregation agg = new PAPITransformer.Aggregation();
    Map<String, Object> payload = new Map<String, Object>();

    putOwner(payload, agg, true);
    putExperience(payload, agg);
    putSkills(payload, agg, 100);
    putProjects(payload, agg);
    putCertifications(payload, agg);
    putEducation(payload, agg);
    putTestimonials(payload, agg);

    respond(ctx, payload, agg, agg.cachePolicy());
  }

  /**
   * @description Gets the profile summary (resume page). Cache-Control is fixed at
   *              max-age=300, private by the decisions block (build plan Part 2), although
   *              "strictest policy wins" over Contact and Experience would give no-store.
   *              The conflict is recorded in the shared log, entry 018.
   */
  private static void getProfileSummary(ApiRequestContext ctx) {
    PAPITransformer.Aggregation agg = new PAPITransformer.Aggregation();
    Map<String, Object> payload = new Map<String, Object>();

    putOwner(payload, agg, false);
    putExperience(payload, agg);
    putSkills(payload, agg, 50);
    putCertifications(payload, agg);
    putEducation(payload, agg);

    respond(ctx, payload, agg, ApiRequestContext.CachePolicy.PRIVATE_300);
  }

  private static void respond(
    ApiRequestContext ctx,
    Map<String, Object> payload,
    PAPITransformer.Aggregation agg,
    ApiRequestContext.CachePolicy policy
  ) {
    payload.put('integrityNote', agg.integrityNote());
    ctx.cache(policy);
    ctx.header('X-Data-Integrity', agg.integrity());
    ctx.ok(payload);
  }

  // --- Sections ---

  private static void putOwner(
    Map<String, Object> payload,
    PAPITransformer.Aggregation agg,
    Boolean includeConfig
  ) {
    agg.source('contacts');
    payload.put('contactInfo', new Map<String, Object>());
    if (includeConfig) {
      agg.source('portfolio-config');
      payload.put('config', new Map<String, Object>());
    }
    try {
      PAPITransformer.guardSection('contacts');
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
      if (contacts.isEmpty()) {
        agg.fail('contacts');
        return;
      }
      Map<String, Object> contactInfo = PAPITransformer.transformContact(
        contacts[0]
      );
      // The owner's email and phone are never returned (owner decision, log 155).
      // PAPITransformer.transformContact reads them, so they stay in the query.
      contactInfo.remove('email');
      contactInfo.remove('phone');
      payload.put('contactInfo', contactInfo);
      if (includeConfig) {
        payload.put('config', buildConfig(contacts[0]));
      }
    } catch (Exception e) {
      agg.fail('contacts');
    }
  }

  private static void putExperience(
    Map<String, Object> payload,
    PAPITransformer.Aggregation agg
  ) {
    agg.source('experience');
    agg.source('experience-highlights');
    List<Experience__c> experiences = new List<Experience__c>();
    try {
      PAPITransformer.guardSection('experience');
      experiences = [
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
    } catch (Exception e) {
      agg.fail('experience');
      experiences = new List<Experience__c>();
    }

    Map<Id, List<String>> expSkillsMap = getExperienceSkills(experiences, agg);

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
  }

  private static void putSkills(
    Map<String, Object> payload,
    PAPITransformer.Aggregation agg,
    Integer maxRows
  ) {
    agg.source('skills');
    List<Map<String, Object>> transformedSkills = new List<Map<String, Object>>();
    try {
      PAPITransformer.guardSection('skills');
      for (Skill__c s : [
        SELECT Id, Name, Category__c, Proficiency__c, Icon_Name__c
        FROM Skill__c
        ORDER BY Proficiency__c DESC, Name ASC
        LIMIT :maxRows
      ]) {
        transformedSkills.add(PAPITransformer.transformSkill(s));
      }
    } catch (Exception e) {
      agg.fail('skills');
      transformedSkills.clear();
    }
    payload.put('skills', transformedSkills);
  }

  private static void putProjects(
    Map<String, Object> payload,
    PAPITransformer.Aggregation agg
  ) {
    agg.source('projects');
    List<Project__c> projects = new List<Project__c>();
    try {
      PAPITransformer.guardSection('projects');
      projects = [
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
    } catch (Exception e) {
      agg.fail('projects');
      projects = new List<Project__c>();
    }
    payload.put('projects', PAPIProjects.enrichProjects(projects, agg));
  }

  private static void putCertifications(
    Map<String, Object> payload,
    PAPITransformer.Aggregation agg
  ) {
    agg.source('certifications');
    List<Map<String, Object>> transformedCerts = new List<Map<String, Object>>();
    try {
      PAPITransformer.guardSection('certifications');
      for (Certification__c c : [
        SELECT Id, Name, Issuer__c, Earned_Date__c
        FROM Certification__c
        ORDER BY Earned_Date__c DESC
        LIMIT 50
      ]) {
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
    } catch (Exception e) {
      agg.fail('certifications');
      transformedCerts.clear();
    }
    payload.put('certifications', transformedCerts);
  }

  private static void putEducation(
    Map<String, Object> payload,
    PAPITransformer.Aggregation agg
  ) {
    agg.source('education');
    List<Map<String, Object>> transformedEdu = new List<Map<String, Object>>();
    try {
      PAPITransformer.guardSection('education');
      for (Education__c e : [
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
      ]) {
        transformedEdu.add(
          new Map<String, Object>{
            'id' => e.Id,
            'school' => e.Issuer__r?.Name,
            'degree' => e.Name,
            'fieldOfStudy' => e.Field_of_Study__c,
            'year' => e.Graduation_Date__c != null
              ? String.valueOf(e.Graduation_Date__c.year())
              : null,
            'gpa' => e.GPA__c
          }
        );
      }
    } catch (Exception e) {
      agg.fail('education');
      transformedEdu.clear();
    }
    payload.put('education', transformedEdu);
  }

  private static void putTestimonials(
    Map<String, Object> payload,
    PAPITransformer.Aggregation agg
  ) {
    agg.source('testimonials');
    List<Map<String, Object>> transformedTestimonials = new List<Map<String, Object>>();
    try {
      PAPITransformer.guardSection('testimonials');
      for (Testimonial__c t : [
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
      ]) {
        transformedTestimonials.add(PAPITransformer.transformTestimonial(t));
      }
    } catch (Exception e) {
      agg.fail('testimonials');
      transformedTestimonials.clear();
    }
    payload.put('testimonials', transformedTestimonials);
  }

  // --- Helper Methods ---

  private static Map<String, Object> buildConfig(Contact c) {
    return new Map<String, Object>{
      'linkedInUrl' => c.LinkedIn_URL__c,
      'githubUrl' => c.GitHub_URL__c,
      'trailheadUrl' => c.Trailhead_URL__c,
      'personalWebsiteUrl' => c.Portfolio_URL__c,
      'careerObjective' => c.Career_Objective__c
    };
  }

  private static Map<Id, List<String>> getExperienceSkills(
    List<Experience__c> experiences,
    PAPITransformer.Aggregation agg
  ) {
    agg.source('experience-skills');
    Set<Id> expIds = new Set<Id>();
    for (Experience__c e : experiences) {
      expIds.add(e.Id);
    }

    Map<Id, List<String>> result = new Map<Id, List<String>>();
    try {
      PAPITransformer.guardSection('experience-skills');
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
    } catch (Exception e) {
      agg.fail('experience-skills');
      result.clear();
    }
    return result;
  }

  @TestVisible
  private static Boolean throwException = false;
}
