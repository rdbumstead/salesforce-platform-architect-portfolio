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

  /**
   * @description GET method to generate resume.
   *              /resume/generate?persona={Admin|Developer|Architect}
   *              Each section is read independently: a section that fails is left out of
   *              the text, X-Data-Integrity becomes "partial" and integrityNote names it.
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
    String resumeText =
      contactSection(owner) +
      experienceSection(agg, persona) +
      skillsSection(agg) +
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
    ctx.ok(response);
  }

  // The owner Contact without email, phone or address: the resume never prints them
  // (owner decision, log 155). Null when there is none.
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
    String persona
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

  private static String skillsSection(PAPITransformer.Aggregation agg) {
    agg.source('skills');
    List<Skill__c> skills;
    try {
      PAPITransformer.guardSection('skills');
      skills = [
        SELECT Name, Category__c, Proficiency__c
        FROM Skill__c
        ORDER BY Proficiency__c DESC
        LIMIT 20
      ];
    } catch (Exception e) {
      agg.fail('skills');
      return '';
    }

    Map<String, List<String>> skillsByCategory = new Map<String, List<String>>();
    for (Skill__c s : skills) {
      String cat = s.Category__c != null ? s.Category__c : 'Other';
      if (!skillsByCategory.containsKey(cat)) {
        skillsByCategory.put(cat, new List<String>());
      }
      skillsByCategory.get(cat).add(s.Name);
    }

    String text = 'SKILLS\n\n';
    for (String cat : skillsByCategory.keySet()) {
      text += cat + ': ' + String.join(skillsByCategory.get(cat), ', ') + '\n';
    }
    return text + '\n';
  }

  private static String certificationsSection(PAPITransformer.Aggregation agg) {
    agg.source('certifications');
    List<Certification__c> certs;
    try {
      PAPITransformer.guardSection('certifications');
      certs = [
        SELECT Name, Issuer__c, Earned_Date__c
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
      if (cert.Issuer__c != null) {
        text += ' - ' + cert.Issuer__c;
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
