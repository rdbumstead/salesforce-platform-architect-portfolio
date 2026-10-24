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
  private static final Set<String> VALID_PERSONAS = new Set<String>{
    'Admin',
    'Developer',
    'Architect'
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
        ctx.error(400, 'BAD_REQUEST', 'Invalid endpoint. Use /resume/generate');
      }
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  /**
   * @description Generates a plain text resume. Cache-Control is the strictest policy of
   *              the upstream resources read (Contact makes it no-store).
   */
  private static void generateResume(ApiRequestContext ctx, String persona) {
    if (String.isNotBlank(persona) && !VALID_PERSONAS.contains(persona)) {
      ctx.error(
        400,
        'BAD_REQUEST',
        'Invalid persona. Valid values: Admin, Developer, Architect'
      );
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
      List<Contact> contacts = [
        SELECT Id, Name, Title, LinkedIn_URL__c, Portfolio_URL__c
        FROM Contact
        WHERE Is_Portfolio_Owner__c = TRUE
        LIMIT 1
      ];
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
    try {
      PAPITransformer.guardSection('experience');
      // Fetch all highlights; filter in memory when a persona is given.
      experiences = [
        SELECT
          Id,
          Employer__r.Name,
          Name,
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
      for (Experience_Highlight__c h : exp.Experience_Highlights__r) {
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
      links = [
        SELECT
          Skill__c,
          Skill__r.Name,
          Skill__r.Category__c,
          Skill__r.Persona_Tag__c
        FROM Experience_Skill__c
        WHERE Experience__c IN :printedRoleIds
        ORDER BY
          Skill__r.Category_Order__c ASC NULLS LAST,
          Skill__r.Category__c ASC NULLS LAST,
          Skill__r.Proficiency__c DESC NULLS LAST,
          Skill__r.Name ASC
        LIMIT 500
      ];
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
      certs = [
        SELECT Name, Issuer__r.Name, Earned_Date__c
        FROM Certification__c
        ORDER BY Earned_Date__c DESC
        LIMIT 10
      ];
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
      education = [
        SELECT
          Issuer__c,
          Issuer__r.Name,
          Name,
          Field_of_Study__c,
          Graduation_Date__c
        FROM Education__c
        ORDER BY Graduation_Date__c DESC
        LIMIT 5
      ];
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

  @TestVisible
  private static Boolean throwException = false;
}
