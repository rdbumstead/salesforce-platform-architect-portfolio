/**
 * @description       : PAPI Profile orchestration endpoint. It combines the owner, roles,
 *                      highlights, skills, projects, certifications, education and testimonials
 *                      into one response by reading them in process through QueryDefinitions,
 *                      never by calling SAPI over HTTP.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 12/05/2025
 * @Test Class        : [PAPIProfileTest]
 **/
// The old /v1/ spelling is kept as an alias until the path sunset (ADR-040). PAPIRouter serves the versionless URL.
@RestResource(urlMapping='/papi/v1/profile/*')
global with sharing class PAPIProfile implements QueryDefinitions.Provider {
  private static final String OWNER_QUERY = 'PAPIProfile_Owner';
  private static final String EXPERIENCE_QUERY = 'PAPIProfile_Experience';
  private static final String HIGHLIGHTS_QUERY = 'PAPIProfile_Highlights';
  private static final String SKILLS_QUERY = 'PAPIProfile_Skills';
  private static final String PROJECTS_QUERY = 'PAPIProfile_Projects';
  private static final String CERTIFICATIONS_QUERY = 'PAPIProfile_Certifications';
  private static final String EDUCATION_QUERY = 'PAPIProfile_Education';
  private static final String TESTIMONIALS_QUERY = 'PAPIProfile_Testimonials';
  private static final String EXPERIENCE_SKILLS_QUERY = 'PAPIProfile_ExperienceSkills';

  /** The most skills /profile/full returns. /profile/summary asks for fewer. */
  private static final Integer MAX_SKILLS = 100;

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
        ctx.error(400, 'BAD_REQUEST', ApiMessages.PROFILE_ENDPOINT_INVALID);
      }
    } catch (Exception e) {
      ctx.serverError(e);
    }
  }

  /**
   * @description Gets the complete portfolio payload (hydration endpoint). Cache-Control is
   *              the strictest policy of every section read, each section taking the policy
   *              its SAPI endpoint sends for the same data.
   */
  private static void getFullPortfolio(ApiRequestContext ctx) {
    PAPITransformer.Aggregation agg = new PAPITransformer.Aggregation();
    Map<String, Object> payload = new Map<String, Object>();

    putOwner(payload, agg, true);
    putExperience(payload, agg);
    putSkills(payload, agg, MAX_SKILLS);
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
      List<Contact> contacts = (List<Contact>) QueryDefinitions.run(
        OWNER_QUERY,
        new Map<String, Object>(),
        ownerDefault()
      );
      if (contacts.isEmpty()) {
        agg.fail('contacts');
        return;
      }
      Map<String, Object> contactInfo = PAPITransformer.transformContact(
        contacts[0]
      );
      // The owner's email and phone are never returned (owner decision).
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
    Map<Id, List<String>> highlightsByExperience = new Map<Id, List<String>>();
    try {
      PAPITransformer.guardSection('experience');
      experiences = (List<Experience__c>) QueryDefinitions.run(
        EXPERIENCE_QUERY,
        new Map<String, Object>(),
        experienceDefault()
      );
      // The highlights are a second read, so a failure there fails the section as one read did.
      highlightsByExperience = highlightsOf(experiences);
    } catch (Exception e) {
      agg.fail('experience');
      experiences = new List<Experience__c>();
      highlightsByExperience = new Map<Id, List<String>>();
    }

    Map<Id, List<String>> expSkillsMap = getExperienceSkills(experiences, agg);

    List<Map<String, Object>> enrichedExperiences = new List<Map<String, Object>>();
    for (Experience__c exp : experiences) {
      List<String> skills = expSkillsMap.containsKey(exp.Id)
        ? expSkillsMap.get(exp.Id)
        : new List<String>();
      List<String> highlights = highlightsByExperience.containsKey(exp.Id)
        ? highlightsByExperience.get(exp.Id)
        : new List<String>();
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
      for (
        Skill__c s : (List<Skill__c>) QueryDefinitions.runPage(
          SKILLS_QUERY,
          new Map<String, Object>(),
          skillsDefault(),
          maxRows,
          null
        )
      ) {
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
      projects = (List<Project__c>) QueryDefinitions.run(
        PROJECTS_QUERY,
        new Map<String, Object>(),
        projectsDefault()
      );
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
      for (
        Certification__c c : (List<Certification__c>) QueryDefinitions.run(
          CERTIFICATIONS_QUERY,
          new Map<String, Object>(),
          certificationsDefault()
        )
      ) {
        transformedCerts.add(
          new Map<String, Object>{
            'id' => c.Id,
            'key' => c.Public_Key__c,
            'name' => c.Name,
            'issuer' => c.Issuer__r?.Name,
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
      for (
        Education__c e : (List<Education__c>) QueryDefinitions.run(
          EDUCATION_QUERY,
          new Map<String, Object>(),
          educationDefault()
        )
      ) {
        transformedEdu.add(
          new Map<String, Object>{
            'id' => e.Id,
            'key' => e.Public_Key__c,
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
      for (
        Testimonial__c t : (List<Testimonial__c>) QueryDefinitions.run(
          TESTIMONIALS_QUERY,
          new Map<String, Object>(),
          testimonialsDefault()
        )
      ) {
        transformedTestimonials.add(PAPITransformer.transformTestimonial(t));
      }
    } catch (Exception e) {
      agg.fail('testimonials');
      transformedTestimonials.clear();
    }
    payload.put('testimonials', transformedTestimonials);
  }

  // --- Helper Methods ---

  // Each experience's highlight texts in Sort_Order__c order, read in one query.
  private static Map<Id, List<String>> highlightsOf(
    List<Experience__c> experiences
  ) {
    Map<Id, List<String>> result = new Map<Id, List<String>>();
    if (experiences.isEmpty()) {
      return result;
    }
    for (
      Experience_Highlight__c highlight : (List<Experience_Highlight__c>) QueryDefinitions.run(
        HIGHLIGHTS_QUERY,
        experienceBinds(new Map<Id, Experience__c>(experiences).keySet()),
        highlightsDefault()
      )
    ) {
      if (!result.containsKey(highlight.Experience__c)) {
        result.put(highlight.Experience__c, new List<String>());
      }
      result.get(highlight.Experience__c).add(highlight.Description__c);
    }
    return result;
  }

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
      for (
        Experience_Skill__c es : (List<Experience_Skill__c>) QueryDefinitions.run(
          EXPERIENCE_SKILLS_QUERY,
          experienceBinds(expIds),
          experienceSkillsDefault()
        )
      ) {
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

  // --- Reads as code. Each Query_Definition.PAPIProfile_* record ships equal to its default.

  /**
   * @description The owner Contact. Email and Phone stay in the read because
   *              PAPITransformer.transformContact reads them, and putOwner removes both.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault ownerDefault() {
    return new QueryDefinitions.QueryDefault(
        'Contact',
        'Id, Public_Key__c, Name, Email, Phone, Title, LinkedIn_URL__c, ' +
        'GitHub_URL__c, Trailhead_URL__c, Portfolio_URL__c, Career_Objective__c'
      )
      .filter('Is_Portfolio_Owner__c = TRUE')
      .rowLimit(1)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE);
  }

  /**
   * @description The experiences, current role first, then the most recent.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault experienceDefault() {
    return new QueryDefinitions.QueryDefault(
        'Experience__c',
        'Id, Public_Key__c, Name, Employer__c, Employer__r.Name, ' +
          'Employer__r.Public_Key__c, Start_Date__c, End_Date__c, ' +
          'Is_Current_Role__c, Is_Remote__c'
      )
      .orderBy('Is_Current_Role__c DESC, End_Date__c DESC NULLS FIRST')
      .rowLimit(50)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE);
  }

  /**
   * @description The highlights of the experiences read, in Sort_Order__c order.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault highlightsDefault() {
    return new QueryDefinitions.QueryDefault(
        'Experience_Highlight__c',
        'Id, Experience__c, Description__c'
      )
      .filter('Experience__c IN :experienceIds')
      .orderBy('Sort_Order__c ASC')
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(experienceBinds(new Set<Id>()));
  }

  /**
   * @description The skills, strongest first. The caller's page size caps the row limit.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault skillsDefault() {
    return new QueryDefinitions.QueryDefault(
        'Skill__c',
        'Id, Public_Key__c, Name, Category__c, Proficiency__c, Icon_Name__c'
      )
      .orderBy('Proficiency__c DESC, Name ASC')
      .rowLimit(MAX_SKILLS)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE);
  }

  /**
   * @description The listed projects, the same rows as the PAPIProjects list.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault projectsDefault() {
    return new QueryDefinitions.QueryDefault(
        'Project__c',
        PAPIProjects.PROJECT_FIELDS
      )
      .filter(PAPIProjects.LISTED_STATUS_FILTER)
      .orderBy(PAPIProjects.PROJECT_ORDER)
      .rowLimit(50)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE);
  }

  /**
   * @description The certifications, newest first.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault certificationsDefault() {
    return new QueryDefinitions.QueryDefault(
        'Certification__c',
        'Id, Public_Key__c, Name, Issuer__r.Name, Issuer__r.Public_Key__c, ' +
        'Earned_Date__c'
      )
      .orderBy('Earned_Date__c DESC')
      .rowLimit(50)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE);
  }

  /**
   * @description The education rows, newest first.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault educationDefault() {
    return new QueryDefinitions.QueryDefault(
        'Education__c',
        'Id, Public_Key__c, Issuer__c, Issuer__r.Name, Issuer__r.Public_Key__c, ' +
        'Name, Field_of_Study__c, Graduation_Date__c, GPA__c'
      )
      .orderBy('Graduation_Date__c DESC')
      .rowLimit(10)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE);
  }

  /**
   * @description The approved testimonials, newest first.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault testimonialsDefault() {
    return new QueryDefinitions.QueryDefault(
        'Testimonial__c',
        'Id, Public_Key__c, Author_Name__c, Author_Title__c, ' +
        'Relationship_Type__c, Context__c, Vibe_Mode__c, Avatar_URL__c'
      )
      .filter('Approved__c = TRUE')
      .orderBy('CreatedDate DESC')
      .rowLimit(20)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE);
  }

  /**
   * @description The skill names linked to the experiences read.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault experienceSkillsDefault() {
    return new QueryDefinitions.QueryDefault(
        'Experience_Skill__c',
        'Experience__c, Skill__r.Name'
      )
      .filter('Experience__c IN :experienceIds')
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(experienceBinds(new Set<Id>()));
  }

  private static Map<String, Object> experienceBinds(Set<Id> experienceIds) {
    return new Map<String, Object>{ 'experienceIds' => experienceIds };
  }

  /**
   * @description The code defaults this class owns, for QueryDefinitions.validateAll().
   * @return Map<String, QueryDefinitions.QueryDefault> The defaults by record name.
   */
  public Map<String, QueryDefinitions.QueryDefault> queryDefaults() {
    return new Map<String, QueryDefinitions.QueryDefault>{
      OWNER_QUERY => ownerDefault(),
      EXPERIENCE_QUERY => experienceDefault(),
      HIGHLIGHTS_QUERY => highlightsDefault(),
      SKILLS_QUERY => skillsDefault(),
      PROJECTS_QUERY => projectsDefault(),
      CERTIFICATIONS_QUERY => certificationsDefault(),
      EDUCATION_QUERY => educationDefault(),
      TESTIMONIALS_QUERY => testimonialsDefault(),
      EXPERIENCE_SKILLS_QUERY => experienceSkillsDefault()
    };
  }

  @TestVisible
  private static Boolean throwException = false;
}
