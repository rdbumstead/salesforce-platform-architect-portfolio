/**
 * @description       : Transformation utilities for SAPI to PAPI field mappings. The
 *                      transform methods build the v1 shape, with id and key. toV2 turns a
 *                      built body into the v2 shape, keys only.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
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
   * @description Shapes a PAPI body to v2: no `id` in any map, keys only. The rule is the
   *              one SAPI uses, so it lives in SAPITransformer.toV2.
   * @param body A map, a list, or any other value.
   * @return Object The shaped copy.
   */
  public static Object toV2(Object body) {
    return SAPITransformer.toV2(body);
  }

  /**
   * @description Transforms Contact__c to ContactDetail schema.
   */
  public static Map<String, Object> transformContact(Contact c) {
    return new Map<String, Object>{
      'id' => c.Id,
      'key' => c.Public_Key__c,
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
      'key' => exp.Public_Key__c,
      'employer' => exp.Employer__r?.Name,
      'role' => exp.Name,
      'dateRange' => formatDateRange(exp.Start_Date__c, exp.End_Date__c),
      'isCurrent' => exp.Is_Current_Role__c,
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
      'key' => proj.Public_Key__c,
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
      'key' => s.Public_Key__c,
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
      'key' => t.Public_Key__c,
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
      if (exp.Is_Current_Role__c == true && String.isNotBlank(exp.Name)) {
        currentRole = exp.Name;
      }
    }

    Integer years = earliest.monthsBetween(Date.today()) / 12;
    String roleTitle = String.isNotBlank(currentRole)
      ? currentRole
      : 'Salesforce Platform Architect';

    return years + '+ Years of Experience as a ' + roleTitle;
  }

  // --- Aggregation: partial-failure tracking and "strictest cache wins" ---

  public static final String INTEGRITY_COMPLETE = 'complete';
  public static final String INTEGRITY_PARTIAL = 'partial';

  /**
   * @description Cache policy of each upstream SAPI resource, the same policy each
   *              SAPI path sets on its own response.
   */
  public static final Map<String, ApiRequestContext.CachePolicy> UPSTREAM_CACHE = new Map<String, ApiRequestContext.CachePolicy>{
    'contacts' => ApiRequestContext.CachePolicy.NO_STORE,
    'portfolio-config' => ApiRequestContext.CachePolicy.PRIVATE_300,
    'experience' => ApiRequestContext.CachePolicy.NO_STORE,
    'experience-highlights' => ApiRequestContext.CachePolicy.NO_STORE,
    'experience-skills' => ApiRequestContext.CachePolicy.PUBLIC_300,
    'testimonials' => ApiRequestContext.CachePolicy.NO_STORE,
    'skills' => ApiRequestContext.CachePolicy.PUBLIC_300,
    'projects' => ApiRequestContext.CachePolicy.PUBLIC_300,
    'project-skills' => ApiRequestContext.CachePolicy.PUBLIC_300,
    'project-assets' => ApiRequestContext.CachePolicy.PUBLIC_300,
    'certifications' => ApiRequestContext.CachePolicy.PUBLIC_300,
    'education' => ApiRequestContext.CachePolicy.PUBLIC_300
  };

  // Higher is stricter: no-store beats private, private beats public, then the shorter max-age.
  private static final Map<ApiRequestContext.CachePolicy, Integer> STRICTNESS = new Map<ApiRequestContext.CachePolicy, Integer>{
    ApiRequestContext.CachePolicy.PUBLIC_300 => 1,
    ApiRequestContext.CachePolicy.PRIVATE_300 => 2,
    ApiRequestContext.CachePolicy.PRIVATE_60 => 3,
    ApiRequestContext.CachePolicy.NO_STORE => 4
  };

  @TestVisible
  private static Set<String> forcedSectionFailures = new Set<String>();

  /**
   * @description Raised when an aggregated section cannot be read.
   */
  public class SectionUnavailableException extends Exception {
  }

  /**
   * @description Returns the strictest of the given cache policies ("strictest policy wins",
   *              PAPI spec section 4). An empty list, or a policy without a known rank,
   *              resolves to NO_STORE.
   * @param policies Upstream policies that contributed to a response.
   * @return ApiRequestContext.CachePolicy The policy to emit.
   */
  public static ApiRequestContext.CachePolicy strictest(
    List<ApiRequestContext.CachePolicy> policies
  ) {
    if (policies == null || policies.isEmpty()) {
      return ApiRequestContext.CachePolicy.NO_STORE;
    }
    ApiRequestContext.CachePolicy result = policies[0];
    for (ApiRequestContext.CachePolicy policy : policies) {
      if (!STRICTNESS.containsKey(policy)) {
        return ApiRequestContext.CachePolicy.NO_STORE;
      }
      if (STRICTNESS.get(policy) > STRICTNESS.get(result)) {
        result = policy;
      }
    }
    return result;
  }

  /**
   * @description Test seam for partial-failure paths: throws when a test has marked the
   *              section as failing. Does nothing outside tests.
   * @param section Upstream resource name, e.g. "certifications".
   */
  public static void guardSection(String section) {
    if (Test.isRunningTest() && forcedSectionFailures.contains(section)) {
      throw new SectionUnavailableException(
        'Forced failure for section ' + section
      );
    }
  }

  /**
   * @description Tracks which upstream resources an aggregated response read, which of
   *              them failed, and derives the integrity note and cache policy.
   */
  public class Aggregation {
    private final List<String> failedSections = new List<String>();
    private final List<ApiRequestContext.CachePolicy> policies = new List<ApiRequestContext.CachePolicy>();

    /**
     * @description Records that the response draws on an upstream resource.
     * @param section Upstream resource name, a key of UPSTREAM_CACHE.
     */
    public void source(String section) {
      ApiRequestContext.CachePolicy policy = UPSTREAM_CACHE.get(section);
      policies.add(
        policy == null ? ApiRequestContext.CachePolicy.NO_STORE : policy
      );
    }

    /**
     * @description Records that an upstream resource could not be read.
     * @param section Upstream resource name.
     */
    public void fail(String section) {
      if (!failedSections.contains(section)) {
        failedSections.add(section);
      }
    }

    /**
     * @description True when every section was read.
     * @return Boolean True when nothing failed.
     */
    public Boolean isComplete() {
      return failedSections.isEmpty();
    }

    /**
     * @description Value for the X-Data-Integrity header.
     * @return String "complete" or "partial".
     */
    public String integrity() {
      return isComplete() ? INTEGRITY_COMPLETE : INTEGRITY_PARTIAL;
    }

    /**
     * @description Value for the integrityNote body field.
     * @return String "complete", or the sentence that names the sections that failed.
     */
    public String integrityNote() {
      return isComplete()
        ? INTEGRITY_COMPLETE
        : ApiMessages.partial(failedSections);
    }

    /**
     * @description The strictest policy among the recorded sources.
     * @return ApiRequestContext.CachePolicy The policy to emit.
     */
    public ApiRequestContext.CachePolicy cachePolicy() {
      return strictest(policies);
    }
  }
}
