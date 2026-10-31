/**
 * @description       : PAPI Resume endpoint that generates ATS-optimized plain text resumes.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 12/05/2025
 * @Test Class        : [PAPIResumeTest]
 **/
// The old /v1/ spelling is kept as an alias until the path sunset (ADR-040). PAPIRouter serves the versionless URL.
@RestResource(urlMapping='/papi/v1/resume/*')
global with sharing class PAPIResume implements QueryDefinitions.Provider {
  private static final String OWNER_QUERY = 'PAPIResume_Owner';
  private static final String EXPERIENCE_QUERY = 'PAPIResume_Experience';
  private static final String HIGHLIGHTS_QUERY = 'PAPIResume_Highlights';
  private static final String SKILLS_QUERY = 'PAPIResume_Skills';
  private static final String CERTIFICATIONS_QUERY = 'PAPIResume_Certifications';
  private static final String EDUCATION_QUERY = 'PAPIResume_Education';
  // The three personas by lower case, so persona matches in any letter case as it does
  // on /sapi/experience-highlights.
  private static final Map<String, String> PERSONAS = new Map<String, String>{
    'admin' => 'Admin',
    'developer' => 'Developer',
    'architect' => 'Architect'
  };
  private static final String HEADER_ACCEPT = 'Accept';
  private static final String MEDIA_TYPE_PLAIN_TEXT = 'text/plain';
  @TestVisible
  private static final String PLAIN_TEXT_CONTENT_TYPE = 'text/plain; charset=UTF-8';

  /**
   * @description GET method to generate resume.
   *              /resume/generate?persona={Admin|Developer|Architect}
   *              Each section is read independently: a section that fails is left out of
   *              the text, X-Data-Integrity becomes "partial" and integrityNote names it.
   *              With Accept: text/plain first in the Accept list, a 200 answer is the
   *              generated text alone as text/plain. Errors stay JSON whatever Accept says.
   */
  @HttpGet
  global static void getResume() {
    ApiRequestContext ctx = ApiRequestContext.begin();
    if (ctx.isRejected()) {
      return;
    }

    try {
      if (Test.isRunningTest() && throwException) {
        throw new CalloutException('Forced Exception');
      }

      String endpoint = ctx.endpointSegment();
      String persona = ctx.stringParam('persona');

      if (endpoint == 'generate') {
        generateResume(ctx, persona);
      } else {
        ctx.error(400, 'BAD_REQUEST', ApiMessages.RESUME_ENDPOINT_INVALID);
      }
    } catch (Exception e) {
      ctx.serverError(e);
    }
  }

  /**
   * @description Generates a plain text resume. Cache-Control is the strictest policy of
   *              the upstream resources read (Contact makes it no-store).
   */
  private static void generateResume(ApiRequestContext ctx, String rawPersona) {
    String persona = String.isBlank(rawPersona)
      ? null
      : PERSONAS.get(rawPersona.trim().toLowerCase());
    if (String.isNotBlank(rawPersona) && persona == null) {
      ctx.error(400, 'BAD_REQUEST', ApiMessages.PERSONA_INVALID);
      return;
    }

    PAPITransformer.Aggregation agg = new PAPITransformer.Aggregation();
    Contact owner = ownerContact(agg);
    Set<Id> printedRoleIds = new Set<Id>();
    String resumeText =
      contactSection(owner) +
      experienceSection(agg, persona, printedRoleIds) +
      skillsSection(agg, printedRoleIds, persona) +
      certificationsSection(agg) +
      educationSection(agg) +
      linksSection(owner);

    Map<String, Object> response = new Map<String, Object>{
      'generatedText' => resumeText.trim(),
      'persona' => persona,
      'generatedAt' => Datetime.now().formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\''),
      'integrityNote' => agg.integrityNote()
    };

    ctx.cache(agg.cachePolicy());
    ctx.header('X-Data-Integrity', agg.integrity());
    if (wantsPlainText()) {
      // Same status, headers, rate count and log line as the JSON answer. Only the
      // Content-Type and the body change: ok() writes the JSON, then the text replaces it.
      // Set after ok() so a failure before it still answers with JSON.
      ctx.ok(response);
      ctx.header('Content-Type', PLAIN_TEXT_CONTENT_TYPE);
      RestContext.response.responseBody = Blob.valueOf(resumeText.trim());
      return;
    }
    ctx.ok(response);
  }

  /**
   * @description True when the first media type in the request's Accept header is
   *              text/plain. The list is split on commas, each entry trimmed, and any
   *              parameters after a semicolon ignored. Absent, star slash star and
   *              application/json all keep the JSON body. Header names are matched
   *              without regard to case.
   */
  @TestVisible
  private static Boolean wantsPlainText() {
    String accept = acceptHeader();
    if (String.isBlank(accept)) {
      return false;
    }
    String first = accept.split(',')[0];
    String mediaType = first.substringBefore(';').trim();
    return MEDIA_TYPE_PLAIN_TEXT.equalsIgnoreCase(mediaType);
  }

  private static String acceptHeader() {
    RestRequest req = RestContext.request;
    if (req == null || req.headers == null) {
      return null;
    }
    for (String name : req.headers.keySet()) {
      if (name != null && name.equalsIgnoreCase(HEADER_ACCEPT)) {
        return req.headers.get(name);
      }
    }
    return null;
  }

  // The owner Contact without email, phone or address: the resume never prints them
  // (owner decision). Null when there is none.
  private static Contact ownerContact(PAPITransformer.Aggregation agg) {
    agg.source('contacts');
    try {
      PAPITransformer.guardSection('contacts');
      List<Contact> contacts = (List<Contact>) QueryDefinitions.run(
        OWNER_QUERY,
        new Map<String, Object>(),
        ownerDefault()
      );
      if (contacts.isEmpty()) {
        agg.fail('contacts');
        return null;
      }
      return contacts[0];
    } catch (Exception e) {
      agg.fail('contacts');
      return null;
    }
  }

  private static String contactSection(Contact c) {
    if (c == null) {
      return '';
    }
    String text = c.Name + '\n';
    text += (c.Title != null ? c.Title : 'Salesforce Professional') + '\n\n';
    return text;
  }

  // The closing lines: the LinkedIn and portfolio links, in place of the email and phone
  // the resume used to print.
  private static String linksSection(Contact c) {
    if (c == null) {
      return '';
    }
    String text = '';
    if (String.isNotBlank(c.LinkedIn_URL__c)) {
      text += 'LinkedIn: ' + c.LinkedIn_URL__c + '\n';
    }
    if (String.isNotBlank(c.Portfolio_URL__c)) {
      text += 'Portfolio: ' + c.Portfolio_URL__c + '\n';
    }
    return text;
  }

  private static String experienceSection(
    PAPITransformer.Aggregation agg,
    String persona,
    Set<Id> printedRoleIds
  ) {
    agg.source('experience');
    agg.source('experience-highlights');
    List<Experience__c> experiences;
    Map<Id, List<Experience_Highlight__c>> highlightsByExperience;
    try {
      PAPITransformer.guardSection('experience');
      experiences = (List<Experience__c>) QueryDefinitions.run(
        EXPERIENCE_QUERY,
        new Map<String, Object>(),
        experienceDefault()
      );
      // Every highlight is read. A persona filters them in memory. A failure here fails the
      // section, as it did when the highlights were part of the experience read.
      highlightsByExperience = highlightsOf(experiences);
    } catch (Exception e) {
      agg.fail('experience');
      return '';
    }

    String text = 'EXPERIENCE\n\n';
    for (Experience__c exp : experiences) {
      printedRoleIds.add(exp.Id);
      String employer = exp.Employer__r?.Name != null
        ? exp.Employer__r.Name
        : 'Unknown';
      String role = exp.Name != null ? exp.Name : 'Role';
      text += employer + ' | ' + role + '\n';
      text +=
        PAPITransformer.formatDateRange(exp.Start_Date__c, exp.End_Date__c) +
        '\n';

      Integer highlightCount = 0;
      List<Experience_Highlight__c> highlights = highlightsByExperience.containsKey(
          exp.Id
        )
        ? highlightsByExperience.get(exp.Id)
        : new List<Experience_Highlight__c>();
      for (Experience_Highlight__c h : highlights) {
        if (highlightCount >= 5) {
          break; // Limit to 5 highlights per experience
        }
        if (
          String.isBlank(persona) ||
          (h.Persona_Tag__c != null && h.Persona_Tag__c.contains(persona))
        ) {
          text += '- ' + h.Description__c + '\n';
          highlightCount++;
        }
      }
      text += '\n';
    }
    return text;
  }

  // Each experience's highlights in Sort_Order__c order, read in one query.
  private static Map<Id, List<Experience_Highlight__c>> highlightsOf(
    List<Experience__c> experiences
  ) {
    Map<Id, List<Experience_Highlight__c>> result = new Map<Id, List<Experience_Highlight__c>>();
    if (experiences.isEmpty()) {
      return result;
    }
    for (
      Experience_Highlight__c highlight : (List<Experience_Highlight__c>) QueryDefinitions.run(
        HIGHLIGHTS_QUERY,
        new Map<String, Object>{
          'experienceIds' => new Map<Id, Experience__c>(experiences).keySet()
        },
        highlightsDefault()
      )
    ) {
      if (!result.containsKey(highlight.Experience__c)) {
        result.put(
          highlight.Experience__c,
          new List<Experience_Highlight__c>()
        );
      }
      result.get(highlight.Experience__c).add(highlight);
    }
    return result;
  }

  /**
   * @description The skills linked through Experience_Skill__c to the roles the resume
   *              prints, each once, grouped by category in Category_Order__c order and by
   *              proficiency within a category. With a persona, a skill prints when its
   *              Persona_Tag__c includes the persona or it has no tag at all, the same rule
   *              the site's resume uses, so a skill nobody has tagged yet never disappears.
   */
  private static String skillsSection(
    PAPITransformer.Aggregation agg,
    Set<Id> printedRoleIds,
    String persona
  ) {
    agg.source('skills');
    agg.source('experience-skills');
    List<Experience_Skill__c> links;
    try {
      PAPITransformer.guardSection('skills');
      if (printedRoleIds.isEmpty()) {
        return '';
      }
      links = (List<Experience_Skill__c>) QueryDefinitions.run(
        SKILLS_QUERY,
        roleBinds(printedRoleIds),
        skillsDefault()
      );
    } catch (Exception e) {
      agg.fail('skills');
      return '';
    }

    Set<Id> seen = new Set<Id>();
    List<String> categories = new List<String>();
    Map<String, List<String>> skillsByCategory = new Map<String, List<String>>();
    for (Experience_Skill__c link : links) {
      if (
        link.Skill__c == null ||
        !showsSkillFor(link.Skill__r.Persona_Tag__c, persona) ||
        !seen.add(link.Skill__c)
      ) {
        continue;
      }
      String cat = link.Skill__r.Category__c != null
        ? link.Skill__r.Category__c
        : 'Other';
      if (!skillsByCategory.containsKey(cat)) {
        skillsByCategory.put(cat, new List<String>());
        categories.add(cat);
      }
      skillsByCategory.get(cat).add(link.Skill__r.Name);
    }
    if (categories.isEmpty()) {
      return '';
    }

    String text = 'SKILLS\n\n';
    for (String cat : categories) {
      text += cat + ': ' + String.join(skillsByCategory.get(cat), ', ') + '\n';
    }
    return text + '\n';
  }

  /**
   * @description True when a skill belongs on the resume for the persona: no persona
   *              chosen, no tag on the skill, or a tag that matches the persona exactly.
   */
  @TestVisible
  private static Boolean showsSkillFor(String tags, String persona) {
    if (String.isBlank(persona) || String.isBlank(tags)) {
      return true;
    }
    return new Set<String>(tags.split(';')).contains(persona);
  }

  private static String certificationsSection(PAPITransformer.Aggregation agg) {
    agg.source('certifications');
    List<Certification__c> certs;
    try {
      PAPITransformer.guardSection('certifications');
      certs = (List<Certification__c>) QueryDefinitions.run(
        CERTIFICATIONS_QUERY,
        new Map<String, Object>(),
        certificationsDefault()
      );
    } catch (Exception e) {
      agg.fail('certifications');
      return '';
    }

    String text = 'CERTIFICATIONS\n\n';
    for (Certification__c cert : certs) {
      text += cert.Name;
      if (String.isNotBlank(cert.Issuer__r?.Name)) {
        text += ' - ' + cert.Issuer__r.Name;
      }
      if (cert.Earned_Date__c != null) {
        text +=
          ' (' +
          PAPITransformer.formatMonthYear(cert.Earned_Date__c) +
          ')';
      }
      text += '\n';
    }
    return text + '\n';
  }

  private static String educationSection(PAPITransformer.Aggregation agg) {
    agg.source('education');
    List<Education__c> education;
    try {
      PAPITransformer.guardSection('education');
      education = (List<Education__c>) QueryDefinitions.run(
        EDUCATION_QUERY,
        new Map<String, Object>(),
        educationDefault()
      );
    } catch (Exception e) {
      agg.fail('education');
      return '';
    }

    String text = 'EDUCATION\n\n';
    for (Education__c edu : education) {
      String schoolName = edu.Issuer__r?.Name != null
        ? edu.Issuer__r.Name
        : 'Unknown';
      text += schoolName + '\n';
      if (edu.Name != null) {
        text += edu.Name;
        if (edu.Field_of_Study__c != null) {
          text += ' in ' + edu.Field_of_Study__c;
        }
        if (edu.Graduation_Date__c != null) {
          text += ' (' + edu.Graduation_Date__c.year() + ')';
        }
        text += '\n';
      }
      text += '\n';
    }
    return text;
  }

  // --- Reads as code. Each Query_Definition.PAPIResume_* record ships equal to its default.

  /**
   * @description The owner Contact without email, phone or address.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault ownerDefault() {
    return new QueryDefinitions.QueryDefault(
        'Contact',
        'Id, Name, Title, LinkedIn_URL__c, Portfolio_URL__c'
      )
      .filter('Is_Portfolio_Owner__c = TRUE')
      .rowLimit(1)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE);
  }

  /**
   * @description The ten roles the resume prints, current first, then the most recent.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault experienceDefault() {
    return new QueryDefinitions.QueryDefault(
        'Experience__c',
        'Id, Employer__r.Name, Name, Start_Date__c, End_Date__c, Is_Current_Role__c'
      )
      .orderBy('Is_Current_Role__c DESC, End_Date__c DESC NULLS FIRST')
      .rowLimit(10)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE);
  }

  /**
   * @description The highlights of the roles read, in Sort_Order__c order, with their tags.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault highlightsDefault() {
    return new QueryDefinitions.QueryDefault(
        'Experience_Highlight__c',
        'Experience__c, Description__c, Persona_Tag__c'
      )
      .filter('Experience__c IN :experienceIds')
      .orderBy('Sort_Order__c ASC')
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(new Map<String, Object>{ 'experienceIds' => new Set<Id>() });
  }

  /**
   * @description The skills linked to the printed roles, in the order the resume groups them.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault skillsDefault() {
    return new QueryDefinitions.QueryDefault(
        'Experience_Skill__c',
        'Skill__c, Skill__r.Name, Skill__r.Category__c, Skill__r.Persona_Tag__c'
      )
      .filter('Experience__c IN :printedRoleIds')
      .orderBy(
        'Skill__r.Category_Order__c ASC NULLS LAST, ' +
          'Skill__r.Category__c ASC NULLS LAST, ' +
          'Skill__r.Proficiency__c DESC NULLS LAST, Skill__r.Name ASC'
      )
      .rowLimit(500)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(roleBinds(new Set<Id>()));
  }

  /**
   * @description The ten newest certifications.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault certificationsDefault() {
    return new QueryDefinitions.QueryDefault(
        'Certification__c',
        'Name, Issuer__r.Name, Earned_Date__c'
      )
      .orderBy('Earned_Date__c DESC')
      .rowLimit(10)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE);
  }

  /**
   * @description The five newest education rows.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault educationDefault() {
    return new QueryDefinitions.QueryDefault(
        'Education__c',
        'Issuer__c, Issuer__r.Name, Name, Field_of_Study__c, Graduation_Date__c'
      )
      .orderBy('Graduation_Date__c DESC')
      .rowLimit(5)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE);
  }

  private static Map<String, Object> roleBinds(Set<Id> printedRoleIds) {
    return new Map<String, Object>{ 'printedRoleIds' => printedRoleIds };
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
      CERTIFICATIONS_QUERY => certificationsDefault(),
      EDUCATION_QUERY => educationDefault()
    };
  }

  @TestVisible
  private static Boolean throwException = false;
}
