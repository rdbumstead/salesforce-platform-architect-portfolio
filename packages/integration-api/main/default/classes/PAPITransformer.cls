/**
 * @description       : Transformation utilities for SAPI to PAPI field mappings.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/05/2025
 * @Test Class        : [PAPITransformerTest]
 **/
public with sharing class PAPITransformer {
  /**
   * @description Formats a date range for experience.
   * @param startDate The start date.
   * @param endDate The end date (null if current).
   * @return String Formatted as "MMM YYYY - MMM YYYY" or "MMM YYYY - Present".
   */
  public static String formatDateRange(Date startDate, Date endDate) {
    String startStr = formatMonthYear(startDate);
    String endStr = (endDate == null) ? 'Present' : formatMonthYear(endDate);
    return startStr + ' - ' + endStr;
  }

  /**
   * @description Formats a date as "MMM YYYY".
   */
  public static String formatMonthYear(Date d) {
    if (d == null)
      return '';
    Datetime dt = Datetime.newInstance(d.year(), d.month(), d.day());
    return dt.format('MMM yyyy');
  }

  /**
   * @description Transforms Contact__c to ContactDetail schema.
   */
  public static Map<String, Object> transformContact(Contact c) {
    return new Map<String, Object>{
      'id' => c.Id,
      'fullName' => c.Name,
      'email' => c.Email,
      'phone' => c.Phone,
      'title' => c.Title,
      'linkedIn' => c.LinkedIn_URL__c,
      'github' => c.GitHub_URL__c,
      'trailhead' => c.Trailhead_URL__c,
      'portfolioUrl' => c.Portfolio_URL__c,
      'bio' => c.Career_Objective__c
    };
  }

  /**
   * @description Transforms Experience__c to EnrichedExperience schema.
   */
  public static Map<String, Object> transformExperience(
    Experience__c exp,
    List<String> skillsUsed,
    List<String> highlights
  ) {
    return new Map<String, Object>{
      'id' => exp.Id,
      'employer' => exp.Employer__r?.Name,
      'role' => exp.Role__c,
      'dateRange' => formatDateRange(exp.Start_Date__c, exp.End_Date__c),
      'isCurrent' => exp.Is_Current__c,
      'isRemote' => exp.Is_Remote__c,
      'skillsUsed' => skillsUsed,
      'highlights' => highlights
    };
  }

  /**
   * @description Transforms Project__c to EnrichedProject schema.
   */
  public static Map<String, Object> transformProject(
    Project__c proj,
    List<String> technologies,
    List<Map<String, Object>> assets
  ) {
    Map<String, Object> result = new Map<String, Object>{
      'id' => proj.Id,
      'title' => proj.Name,
      'challenge' => proj.Challenge__c,
      'solution' => proj.Solution__c,
      'businessValue' => proj.Business_Value__c,
      'status' => proj.Status__c,
      'heroImageUrl' => proj.Hero_Image_URL__c,
      'liveUrl' => proj.Live_URL__c,
      'repositoryUrl' => proj.Repository_URL__c,
      'technologies' => technologies,
      'assets' => assets
    };

    if (proj.Date_Completed__c != null) {
      result.put('completionDate', String.valueOf(proj.Date_Completed__c));
    }

    return result;
  }

  /**
   * @description Transforms Skill__c to SkillSummary schema.
   */
  public static Map<String, Object> transformSkill(Skill__c s) {
    return new Map<String, Object>{
      'id' => s.Id,
      'name' => s.Name,
      'displayName' => s.Name,
      'category' => s.Category__c,
      'proficiency' => s.Proficiency__c,
      'iconName' => s.Icon_Name__c
    };
  }

  /**
   * @description Transforms Testimonial__c to EnrichedTestimonial schema.
   */
  public static Map<String, Object> transformTestimonial(Testimonial__c t) {
    return new Map<String, Object>{
      'id' => t.Id,
      'author' => t.Author_Name__c,
      'title' => t.Author_Title__c,
      'relationship' => t.Relationship_Type__c,
      'quote' => t.Context__c,
      'vibe' => t.Vibe_Mode__c,
      'avatarUrl' => t.Avatar_URL__c
    };
  }

  /**
   * @description Calculates a professional summary from experience.
   */
  public static String calculateSummary(List<Experience__c> experiences) {
    if (experiences == null || experiences.isEmpty()) {
      return 'Salesforce Professional';
    }

    // Calculate total years of experience
    Date earliest = Date.today();
    String currentRole = '';

    for (Experience__c exp : experiences) {
      if (exp.Start_Date__c != null && exp.Start_Date__c < earliest) {
        earliest = exp.Start_Date__c;
      }
      if (exp.Is_Current__c == true && String.isNotBlank(exp.Role__c)) {
        currentRole = exp.Role__c;
      }
    }

    Integer years = earliest.monthsBetween(Date.today()) / 12;
    String roleTitle = String.isNotBlank(currentRole)
      ? currentRole
      : 'Salesforce Platform Architect';

    return years + '+ Years of Experience as a ' + roleTitle;
  }
}
