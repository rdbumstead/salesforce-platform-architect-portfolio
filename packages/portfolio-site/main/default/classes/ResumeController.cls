/**
 * @description       : Serves the resume page. Returns the owner header,
 *                      roles with persona highlights, skill groups, certifications and education
 *                      in one fixed shape, plus the certification verification link.
 *                      getTimeline serves the home page timeline: work, education and the
 *                      current certifications, with how many entries each tab shows at first.
 *                      Skills follow the persona: a chosen persona gets the skills tagged for
 *                      it plus every untagged skill, and no persona gets them all.
 *                      Never returns an email, a phone number, an address or
 *                      any Owner_* value.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 * @Test Class        : [ResumeControllerTest]
 **/
public with sharing class ResumeController {
  @TestVisible
  private static final String INVALID_PERSONA_MESSAGE = 'Invalid persona. Valid values: Admin, Developer, Architect';
  private static final List<String> PERSONAS = new List<String>{
    'Admin',
    'Developer',
    'Architect'
  };

  @TestVisible
  private static Portfolio_Config__mdt configOverride;

  // How many entries each timeline tab shows before "View all", when the Timeline_Tab_Limit
  // setting is missing or out of its range.
  @TestVisible
  private static final Integer DEFAULT_TIMELINE_TAB_LIMIT = 5;

  /**
   * @description Builds the resume for a persona. Highlights and skills both follow it: a
   *              chosen persona keeps the highlights tagged for it, and the skills tagged for it
   *              plus every untagged skill, so a new skill nobody has tagged yet never disappears.
   * @param persona Blank for every highlight and skill, or one of Admin, Developer, Architect.
   * @return ResumeData The resume in its fixed shape.
   * @throws AuraHandledException When the persona is not blank and not a valid value.
   * @example
   * ResumeController.ResumeData resume = ResumeController.getResume('Architect');
   */
  @AuraEnabled(cacheable=true)
  public static ResumeData getResume(String persona) {
    String normalizedPersona = String.isBlank(persona) ? null : persona.trim();
    if (normalizedPersona != null && !PERSONAS.contains(normalizedPersona)) {
      throw auraError(INVALID_PERSONA_MESSAGE);
    }

    ResumeSelector selector = new ResumeSelector();
    ResumeData resume = new ResumeData();
    resume.persona = normalizedPersona;
    resume.header = toHeader(selector.selectOwner());
    resume.roles = toRoles(selector.selectRoles(), normalizedPersona);
    resume.skillGroups = toSkillGroups(
      selector.selectSkills(),
      normalizedPersona
    );
    resume.certifications = toCertifications(selector.selectCertifications());
    resume.education = toEducation(selector.selectEducation());
    resume.credentialVerificationUrl = credentialVerificationUrl();
    return resume;
  }

  /**
   * @description Builds the home page timeline. Roles come current first, then newest start
   *              date, the same order as the resume. Schools come newest completion first.
   *              Certifications are the current ones only (retired ones stay on the resume),
   *              newest first. Every list is empty, never null, when there are no rows.
   *              tabLimit is how many entries each tab shows before "View all", and
   *              verificationUrl is the one certification verification link or null.
   * @return Timeline The three lists, the verification link and the tab limit.
   * @example
   * ResumeController.Timeline timeline = ResumeController.getTimeline();
   */
  @AuraEnabled(cacheable=true)
  public static Timeline getTimeline() {
    ResumeSelector selector = new ResumeSelector();
    Timeline timeline = new Timeline();
    timeline.work = toTimelineRoles(selector.selectTimelineRoles());
    timeline.education = toTimelineSchools(selector.selectEducation());
    timeline.certifications = toTimelineCertifications(
      selector.selectCertifications()
    );
    timeline.verificationUrl = credentialVerificationUrl();
    timeline.tabLimit = timelineTabLimit();
    return timeline;
  }

  private static Integer timelineTabLimit() {
    return PortfolioSettings.getInteger(
      'Timeline_Tab_Limit',
      DEFAULT_TIMELINE_TAB_LIMIT
    );
  }

  private static List<TimelineCertification> toTimelineCertifications(
    List<Certification__c> certifications
  ) {
    List<TimelineCertification> entries = new List<TimelineCertification>();
    for (Certification__c certification : certifications) {
      if (certification.Is_Retired__c == true) {
        continue;
      }
      TimelineCertification entry = new TimelineCertification();
      entry.id = certification.Id;
      entry.name = certification.Name;
      entry.issuer = certification.Issuer__r?.Name;
      entry.earnedDate = certification.Earned_Date__c;
      entries.add(entry);
    }
    return entries;
  }

  private static List<TimelineRole> toTimelineRoles(
    List<Experience__c> experiences
  ) {
    List<TimelineRole> roles = new List<TimelineRole>();
    for (Experience__c experience : experiences) {
      TimelineRole role = new TimelineRole();
      role.key = experience.Id;
      role.title = experience.Name;
      role.employer = experience.Employer__r?.Name;
      role.startDate = experience.Start_Date__c;
      role.endDate = experience.End_Date__c;
      role.isCurrent = experience.Is_Current_Role__c == true;
      roles.add(role);
    }
    return roles;
  }

  private static List<TimelineSchool> toTimelineSchools(
    List<Education__c> schools
  ) {
    List<TimelineSchool> entries = new List<TimelineSchool>();
    for (Education__c school : schools) {
      TimelineSchool entry = new TimelineSchool();
      entry.key = school.Id;
      entry.school = school.Issuer__r?.Name;
      entry.credential = school.Name;
      entry.fieldOfStudy = school.Field_of_Study__c;
      entry.completedDate = school.Graduation_Date__c;
      entries.add(entry);
    }
    return entries;
  }

  /**
   * The one certification verification link, or null when the org has no config
   * record or the value is blank. Returned exactly as stored, so a plus sign stays a plus sign.
   * The record is chosen by the rule FooterController uses: first by DeveloperName.
   * getAll() reads custom metadata without SOQL.
   */
  private static String credentialVerificationUrl() {
    Portfolio_Config__mdt config = configOverride;
    if (config == null) {
      for (
        Portfolio_Config__mdt record : Portfolio_Config__mdt.getAll().values()
      ) {
        if (
          config == null ||
          record.DeveloperName.compareTo(config.DeveloperName) < 0
        ) {
          config = record;
        }
      }
    }
    String url = config?.Credential_Verification_URL__c;
    return String.isBlank(url) ? null : url;
  }

  /**
   * @description Returns only the owner header, for the home page hero. One query on the owner
   *              Contact, so the hero bio never waits on the roles, skills and credentials that
   *              getResume reads. Same fields and same selector as getResume's header.
   * @return Header The owner header, or null when no Contact is the portfolio owner.
   * @example
   * ResumeController.Header header = ResumeController.getHeader();
   */
  @AuraEnabled(cacheable=true)
  public static Header getHeader() {
    return toHeader(new ResumeSelector().selectOwner());
  }

  private static Header toHeader(Contact owner) {
    if (owner == null) {
      return null;
    }
    Header header = new Header();
    header.name = owner.Name;
    header.title = owner.Title;
    header.careerObjective = owner.Career_Objective__c;
    header.linkedInUrl = owner.LinkedIn_URL__c;
    header.gitHubUrl = owner.GitHub_URL__c;
    header.trailheadUrl = owner.Trailhead_URL__c;
    header.portfolioUrl = owner.Portfolio_URL__c;
    return header;
  }

  private static List<Role> toRoles(
    List<Experience__c> experiences,
    String persona
  ) {
    List<Role> roles = new List<Role>();
    for (Experience__c experience : experiences) {
      Role role = new Role();
      role.id = experience.Id;
      role.title = experience.Name;
      role.employer = experience.Employer__r?.Name;
      role.startDate = experience.Start_Date__c;
      role.endDate = experience.End_Date__c;
      role.isCurrent = experience.Is_Current_Role__c;
      role.isRemote = experience.Is_Remote__c;
      role.highlights = toHighlights(
        experience.Experience_Highlights__r,
        persona
      );
      roles.add(role);
    }
    return roles;
  }

  private static List<String> toHighlights(
    List<Experience_Highlight__c> rows,
    String persona
  ) {
    List<HighlightEntry> entries = new List<HighlightEntry>();
    for (Experience_Highlight__c row : rows) {
      if (persona == null || hasTag(row.Persona_Tag__c, persona)) {
        entries.add(new HighlightEntry(row, persona));
      }
    }
    entries.sort();
    List<String> highlights = new List<String>();
    for (HighlightEntry entry : entries) {
      highlights.add(entry.description);
    }
    return highlights;
  }

  private static Boolean hasTag(String tags, String persona) {
    if (String.isBlank(tags)) {
      return false;
    }
    return new Set<String>(tags.split(';')).contains(persona);
  }

  private static List<SkillGroup> toSkillGroups(
    List<Skill__c> skills,
    String persona
  ) {
    List<SkillGroup> groups = new List<SkillGroup>();
    Map<String, SkillGroup> groupsByCategory = new Map<String, SkillGroup>();
    for (Skill__c skill : skills) {
      if (!showsSkillFor(skill.Persona_Tag__c, persona)) {
        continue;
      }
      SkillGroup skillGroup = groupsByCategory.get(skill.Category__c);
      if (skillGroup == null) {
        skillGroup = new SkillGroup();
        skillGroup.category = skill.Category__c;
        skillGroup.skills = new List<String>();
        groupsByCategory.put(skill.Category__c, skillGroup);
        groups.add(skillGroup);
      }
      skillGroup.skills.add(
        String.isBlank(skill.Display_Name__c)
          ? skill.Name
          : skill.Display_Name__c
      );
    }
    return groups;
  }

  /**
   * True when a skill belongs on the resume for the persona: no persona chosen, or the skill
   * carries no tag, or its tags include the persona.
   */
  private static Boolean showsSkillFor(String tags, String persona) {
    return persona == null || String.isBlank(tags) || hasTag(tags, persona);
  }

  private static List<Credential> toCertifications(
    List<Certification__c> certifications
  ) {
    List<Credential> credentials = new List<Credential>();
    for (Certification__c certification : certifications) {
      Credential credential = new Credential();
      credential.name = certification.Name;
      credential.issuer = certification.Issuer__r?.Name;
      credential.dateValue = certification.Earned_Date__c;
      credential.isRetired = certification.Is_Retired__c == true;
      credentials.add(credential);
    }
    return credentials;
  }

  private static List<Credential> toEducation(List<Education__c> schools) {
    List<Credential> credentials = new List<Credential>();
    for (Education__c school : schools) {
      Credential credential = new Credential();
      credential.name = school.Name;
      credential.issuer = school.Issuer__r?.Name;
      credential.dateValue = school.Graduation_Date__c;
      credential.detail = school.Field_of_Study__c;
      credential.isRetired = false;
      credentials.add(credential);
    }
    return credentials;
  }

  private static AuraHandledException auraError(String message) {
    AuraHandledException error = new AuraHandledException(message);
    error.setMessage(message);
    return error;
  }

  /**
   * @description Reads every resume record in system mode and without sharing, because
   *              certifications and education are master-detail to Contact and
   *              roles look up to Account, and the site guest has no Contact or Account access.
   *              The guest reaches this data only through the fixed, contact-detail-free shape
   *              the outer class builds. Selects no Email, Phone, address or Owner_* field.
   */
  private without sharing class ResumeSelector {
    private Contact selectOwner() {
      List<Contact> owners = [
        SELECT
          Name,
          Title,
          Career_Objective__c,
          LinkedIn_URL__c,
          GitHub_URL__c,
          Trailhead_URL__c,
          Portfolio_URL__c
        FROM Contact
        WHERE Is_Portfolio_Owner__c = TRUE
        WITH SYSTEM_MODE
        ORDER BY CreatedDate ASC
        LIMIT 1
      ];
      return owners.isEmpty() ? null : owners[0];
    }

    private List<Experience__c> selectRoles() {
      return [
        SELECT
          Id,
          Name,
          Employer__r.Name,
          Start_Date__c,
          End_Date__c,
          Is_Current_Role__c,
          Is_Remote__c,
          (
            SELECT
              Description__c,
              Persona_Tag__c,
              Sort_Order__c,
              Admin_Sort_Order__c,
              Developer_Sort_Order__c,
              Architect_Sort_Order__c,
              Lock_Sort_Across_Personas__c
            FROM Experience_Highlights__r
          )
        FROM Experience__c
        WITH SYSTEM_MODE
        ORDER BY
          Is_Current_Role__c DESC,
          Start_Date__c DESC NULLS LAST,
          Sort_Order__c ASC
      ];
    }

    private List<Skill__c> selectSkills() {
      return [
        SELECT Name, Display_Name__c, Category__c, Persona_Tag__c
        FROM Skill__c
        WITH SYSTEM_MODE
        ORDER BY Category_Order__c ASC, Proficiency__c DESC NULLS LAST, Name ASC
      ];
    }

    private List<Certification__c> selectCertifications() {
      return [
        SELECT Id, Name, Issuer__r.Name, Earned_Date__c, Is_Retired__c
        FROM Certification__c
        WITH SYSTEM_MODE
        ORDER BY Earned_Date__c DESC NULLS LAST, Name ASC
      ];
    }

    private List<Experience__c> selectTimelineRoles() {
      return [
        SELECT
          Id,
          Name,
          Employer__r.Name,
          Start_Date__c,
          End_Date__c,
          Is_Current_Role__c
        FROM Experience__c
        WITH SYSTEM_MODE
        ORDER BY
          Is_Current_Role__c DESC,
          Start_Date__c DESC NULLS LAST,
          Sort_Order__c ASC,
          Name ASC
      ];
    }

    private List<Education__c> selectEducation() {
      return [
        SELECT Id, Name, Issuer__r.Name, Graduation_Date__c, Field_of_Study__c
        FROM Education__c
        WITH SYSTEM_MODE
        ORDER BY Graduation_Date__c DESC NULLS LAST, Name ASC
      ];
    }
  }

  /**
   * @description Orders highlights for one persona. A row sorts by its persona sort order with
   *              blanks last, then by Sort_Order__c. A row locked across personas, and every
   *              row when no persona is given, sorts by Sort_Order__c alone.
   */
  private class HighlightEntry implements Comparable {
    private String description;
    private Decimal primaryKey;
    private Decimal secondaryKey;

    private HighlightEntry(Experience_Highlight__c row, String persona) {
      this.description = row.Description__c;
      this.secondaryKey = row.Sort_Order__c;
      Boolean usesBaseOrder =
        persona == null ||
        row.Lock_Sort_Across_Personas__c == true;
      this.primaryKey = usesBaseOrder
        ? row.Sort_Order__c
        : (Decimal) row.get(persona + '_Sort_Order__c');
    }

    public Integer compareTo(Object other) {
      HighlightEntry that = (HighlightEntry) other;
      Integer byPrimary = compareNullsLast(this.primaryKey, that.primaryKey);
      return byPrimary != 0
        ? byPrimary
        : compareNullsLast(this.secondaryKey, that.secondaryKey);
    }

    private Integer compareNullsLast(Decimal left, Decimal right) {
      if (left == right) {
        return 0;
      }
      if (left == null) {
        return 1;
      }
      if (right == null) {
        return -1;
      }
      return left < right ? -1 : 1;
    }
  }

  /**
   * @description The whole resume.
   */
  public class ResumeData {
    @AuraEnabled
    public String persona;
    @AuraEnabled
    public Header header;
    @AuraEnabled
    public List<Role> roles;
    @AuraEnabled
    public List<SkillGroup> skillGroups;
    @AuraEnabled
    public List<Credential> certifications;
    @AuraEnabled
    public List<Credential> education;
    @AuraEnabled
    public String credentialVerificationUrl;
  }

  /**
   * @description The owner header. Holds public profile links only.
   */
  public class Header {
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String title;
    @AuraEnabled
    public String careerObjective;
    @AuraEnabled
    public String linkedInUrl;
    @AuraEnabled
    public String gitHubUrl;
    @AuraEnabled
    public String trailheadUrl;
    @AuraEnabled
    public String portfolioUrl;
  }

  /**
   * @description One role with its highlights for the persona.
   */
  public class Role {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String title;
    @AuraEnabled
    public String employer;
    @AuraEnabled
    public Date startDate;
    @AuraEnabled
    public Date endDate;
    @AuraEnabled
    public Boolean isCurrent;
    @AuraEnabled
    public Boolean isRemote;
    @AuraEnabled
    public List<String> highlights;
  }

  /**
   * @description Skills in one category, strongest first.
   */
  public class SkillGroup {
    @AuraEnabled
    public String category;
    @AuraEnabled
    public List<String> skills;
  }

  /**
   * @description A certification or an education entry.
   */
  public class Credential {
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String issuer;
    @AuraEnabled
    public Date dateValue;
    @AuraEnabled
    public String detail;
    @AuraEnabled
    public Boolean isRetired;
  }

  /**
   * @description The home page timeline: roles, schools and current certifications, newest
   *              first, with the verification link and how many entries a tab shows at first.
   */
  public class Timeline {
    @AuraEnabled
    public List<TimelineRole> work;
    @AuraEnabled
    public List<TimelineSchool> education;
    @AuraEnabled
    public List<TimelineCertification> certifications;
    @AuraEnabled
    public String verificationUrl;
    @AuraEnabled
    public Integer tabLimit;
  }

  /**
   * @description One role on the timeline. No highlights, no contact detail.
   */
  public class TimelineRole {
    @AuraEnabled
    public String key;
    @AuraEnabled
    public String title;
    @AuraEnabled
    public String employer;
    @AuraEnabled
    public Date startDate;
    @AuraEnabled
    public Date endDate;
    @AuraEnabled
    public Boolean isCurrent;
  }

  /**
   * @description One school on the timeline.
   */
  public class TimelineSchool {
    @AuraEnabled
    public String key;
    @AuraEnabled
    public String school;
    @AuraEnabled
    public String credential;
    @AuraEnabled
    public String fieldOfStudy;
    @AuraEnabled
    public Date completedDate;
  }

  /**
   * @description One current certification on the timeline.
   */
  public class TimelineCertification {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String issuer;
    @AuraEnabled
    public Date earnedDate;
  }
}
