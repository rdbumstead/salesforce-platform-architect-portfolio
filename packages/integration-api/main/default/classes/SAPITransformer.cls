/**
 * @description       : Field mapping from Salesforce records to the SAPI response schemas
 *                      (salesforce-sapi.yaml). Every SAPI resource other than experience, projects, skills and
 *                      testimonials maps its records here so the schema keys live in one place.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 * @Test Class        : [SAPITransformerTest]
 **/
public with sharing class SAPITransformer {
  /**
   * @description True when the value is a 15 or 18 character Salesforce Id.
   * @param value Raw query parameter value.
   * @return Boolean True when the value parses as an Id.
   */
  public static Boolean isSalesforceId(String value) {
    if (String.isBlank(value)) {
      return false;
    }
    try {
      Id parsed = Id.valueOf(value.trim());
      return parsed != null;
    } catch (StringException e) {
      return false;
    }
  }

  /**
   * @description An Id no record holds. A reference that is a well formed key with no
   *              record behind it resolves to this, so the filter returns no rows, the way a
   *              valid Id with no record does.
   */
  public static final String NO_MATCH_ID = '000000000000000AAA';

  /**
   * @description Turns an id parameter into a Salesforce Id for the query binds. The value may
   *              be a Salesforce Id, which passes through, or the public key of a record of
   *              the given object (ADR-038).
   * @param objectType The object the parameter refers to.
   * @param value Raw parameter value.
   * @return String An Id, NO_MATCH_ID for a key with no record, or null when the value is
   *         neither an Id nor a key (the caller answers 400).
   */
  public static String resolveReference(
    Schema.SObjectType objectType,
    String value
  ) {
    if (isSalesforceId(value)) {
      return value.trim();
    }
    if (!PublicKeyService.isKey(value)) {
      return null;
    }
    Id found = PublicKeyService.findId(objectType, value);
    return found == null ? NO_MATCH_ID : String.valueOf(found);
  }

  /**
   * @description Maps owner Contacts to the Contact schema. Only fields granted by
   *              Integration_Access are read. The owner's email and phone are never
   *              returned (owner decision, 2026-10-21).
   * @param contacts Contact records.
   * @return List<Map<String, Object>> Contact schema rows.
   */
  public static List<Map<String, Object>> toContacts(List<Contact> contacts) {
    List<Map<String, Object>> result = new List<Map<String, Object>>();
    for (Contact c : contacts) {
      result.add(
        new Map<String, Object>{
          'id' => c.Id,
          'key' => c.Public_Key__c,
          'name' => c.Name,
          'title' => c.Title,
          'trailhead' => c.Trailhead_URL__c,
          'careerObjective' => c.Career_Objective__c,
          'linkedIn' => c.LinkedIn_URL__c,
          'portfolio' => c.Portfolio_URL__c
        }
      );
    }
    return result;
  }

  /**
   * @description Maps Accounts to the Account schema.
   * @param accounts Account records.
   * @return List<Map<String, Object>> Account schema rows.
   */
  public static List<Map<String, Object>> toAccounts(List<Account> accounts) {
    List<Map<String, Object>> result = new List<Map<String, Object>>();
    for (Account a : accounts) {
      result.add(
        new Map<String, Object>{
          'id' => a.Id,
          'key' => a.Public_Key__c,
          'name' => a.Name,
          'industry' => a.Industry,
          'abbreviation' => a.Abbreviation__c
        }
      );
    }
    return result;
  }

  /**
   * @description Maps Experience_Highlight__c records to the ExperienceHighlight schema.
   *              personaTag carries the raw multi-select value (for example "Admin;Developer").
   * @param highlights Experience_Highlight__c records.
   * @return List<Map<String, Object>> ExperienceHighlight schema rows.
   */
  public static List<Map<String, Object>> toExperienceHighlights(
    List<Experience_Highlight__c> highlights
  ) {
    List<Map<String, Object>> result = new List<Map<String, Object>>();
    for (Experience_Highlight__c h : highlights) {
      result.add(
        new Map<String, Object>{
          'id' => h.Id,
          'key' => h.Public_Key__c,
          'experienceId' => h.Experience__c,
          'experienceName' => h.Experience__r?.Name,
          'experienceKey' => h.Experience__r?.Public_Key__c,
          'name' => h.Name,
          'description' => h.Description__c,
          'sortOrder' => h.Sort_Order__c,
          'personaTag' => h.Persona_Tag__c
        }
      );
    }
    return result;
  }

  /**
   * @description Maps Project_Asset__c records to the ProjectAsset schema.
   * @param assets Project_Asset__c records.
   * @return List<Map<String, Object>> ProjectAsset schema rows.
   */
  public static List<Map<String, Object>> toProjectAssets(
    List<Project_Asset__c> assets
  ) {
    List<Map<String, Object>> result = new List<Map<String, Object>>();
    for (Project_Asset__c pa : assets) {
      result.add(
        new Map<String, Object>{
          'id' => pa.Id,
          'key' => pa.Public_Key__c,
          'name' => pa.Name,
          'projectId' => pa.Project__c,
          'projectName' => pa.Project__r?.Name,
          'projectKey' => pa.Project__r?.Public_Key__c,
          'type' => pa.Type__c,
          'externalUrl' => pa.External_URL__c,
          'altText' => pa.Alt_Text__c,
          'sortOrder' => pa.Sort_Order__c
        }
      );
    }
    return result;
  }

  /**
   * @description Maps Certification__c records to the Certification schema.
   * @param certifications Certification__c records.
   * @return List<Map<String, Object>> Certification schema rows.
   */
  public static List<Map<String, Object>> toCertifications(
    List<Certification__c> certifications
  ) {
    List<Map<String, Object>> result = new List<Map<String, Object>>();
    for (Certification__c cert : certifications) {
      result.add(
        new Map<String, Object>{
          'id' => cert.Id,
          'key' => cert.Public_Key__c,
          'name' => cert.Name,
          'contactId' => cert.Contact__c,
          'contactName' => cert.Contact__r?.Name,
          'contactKey' => cert.Contact__r?.Public_Key__c,
          'issuerId' => cert.Issuer__c,
          'issuerName' => cert.Issuer__r?.Name,
          'issuerKey' => cert.Issuer__r?.Public_Key__c,
          'earnedDate' => formatDate(cert.Earned_Date__c)
        }
      );
    }
    return result;
  }

  /**
   * @description Maps Education__c records to the Education schema.
   * @param educationRecords Education__c records.
   * @return List<Map<String, Object>> Education schema rows.
   */
  public static List<Map<String, Object>> toEducation(
    List<Education__c> educationRecords
  ) {
    List<Map<String, Object>> result = new List<Map<String, Object>>();
    for (Education__c edu : educationRecords) {
      result.add(
        new Map<String, Object>{
          'id' => edu.Id,
          'key' => edu.Public_Key__c,
          'name' => edu.Name,
          'contactId' => edu.Contact__c,
          'contactName' => edu.Contact__r?.Name,
          'contactKey' => edu.Contact__r?.Public_Key__c,
          'issuerId' => edu.Issuer__c,
          'issuerName' => edu.Issuer__r?.Name,
          'issuerKey' => edu.Issuer__r?.Public_Key__c,
          'fieldOfStudy' => edu.Field_of_Study__c,
          'graduationDate' => formatDate(edu.Graduation_Date__c),
          'gpa' => edu.GPA__c
        }
      );
    }
    return result;
  }

  /**
   * @description Maps Project_Skill__c junctions to the ProjectSkill schema.
   * @param links Project_Skill__c records.
   * @return List<Map<String, Object>> ProjectSkill schema rows.
   */
  public static List<Map<String, Object>> toProjectSkills(
    List<Project_Skill__c> links
  ) {
    List<Map<String, Object>> result = new List<Map<String, Object>>();
    for (Project_Skill__c link : links) {
      Map<String, Object> row = skillColumns(
        link.Id,
        link.Public_Key__c,
        link.Skill__c,
        link.Skill__r
      );
      row.put('projectId', link.Project__c);
      row.put('projectName', link.Project__r?.Name);
      row.put('projectKey', link.Project__r?.Public_Key__c);
      result.add(row);
    }
    return result;
  }

  /**
   * @description Maps Experience_Skill__c junctions to the ExperienceSkill schema.
   * @param links Experience_Skill__c records.
   * @return List<Map<String, Object>> ExperienceSkill schema rows.
   */
  public static List<Map<String, Object>> toExperienceSkills(
    List<Experience_Skill__c> links
  ) {
    List<Map<String, Object>> result = new List<Map<String, Object>>();
    for (Experience_Skill__c link : links) {
      Map<String, Object> row = skillColumns(
        link.Id,
        link.Public_Key__c,
        link.Skill__c,
        link.Skill__r
      );
      row.put('experienceId', link.Experience__c);
      row.put('experienceName', link.Experience__r?.Name);
      row.put('experienceKey', link.Experience__r?.Public_Key__c);
      result.add(row);
    }
    return result;
  }

  /**
   * @description Maps Certification_Skill__c junctions to the CertificationSkill schema.
   * @param links Certification_Skill__c records.
   * @return List<Map<String, Object>> CertificationSkill schema rows.
   */
  public static List<Map<String, Object>> toCertificationSkills(
    List<Certification_Skill__c> links
  ) {
    List<Map<String, Object>> result = new List<Map<String, Object>>();
    for (Certification_Skill__c link : links) {
      Map<String, Object> row = skillColumns(
        link.Id,
        link.Public_Key__c,
        link.Skill__c,
        link.Skill__r
      );
      row.put('certificationId', link.Certification__c);
      row.put('certificationName', link.Certification__r?.Name);
      row.put('certificationKey', link.Certification__r?.Public_Key__c);
      result.add(row);
    }
    return result;
  }

  /**
   * @description Maps the Portfolio_Config__mdt record to the PortfolioConfig schema.
   *              Owner_Email__c and Owner_Phone__c are never returned (owner decision).
   * @param config The configuration record; null yields an empty object.
   * @return Map<String, Object> PortfolioConfig schema object.
   */
  public static Map<String, Object> toPortfolioConfig(
    Portfolio_Config__mdt config
  ) {
    if (config == null) {
      return new Map<String, Object>();
    }
    return new Map<String, Object>{
      'linkedInUrl' => config.LinkedIn_URL__c,
      'gitHubProfileUrl' => config.GitHub_Profile_URL__c,
      'calendlyUrl' => config.Calendly_URL__c,
      'trailblazerProfileUrl' => config.Trailblazer_Profile_URL__c,
      'personalWebsiteUrl' => config.Personal_Website_URL__c,
      'careerObjective' => config.Career_Objective__c,
      'jiraProjectKey' => config.Jira_Project_Key__c,
      'gitHubRepoPath' => config.GitHub_Repo_Path__c
    };
  }

  private static Map<String, Object> skillColumns(
    Id junctionId,
    String junctionKey,
    Id skillId,
    Skill__c skill
  ) {
    return new Map<String, Object>{
      'id' => junctionId,
      'key' => junctionKey,
      'skillId' => skillId,
      'skillName' => skill?.Name,
      'skillKey' => skill?.Public_Key__c,
      'skillCategory' => skill?.Category__c,
      'skillProficiencyScore' => skill?.Proficiency__c
    };
  }

  private static String formatDate(Date value) {
    return value == null ? null : String.valueOf(value);
  }
}
