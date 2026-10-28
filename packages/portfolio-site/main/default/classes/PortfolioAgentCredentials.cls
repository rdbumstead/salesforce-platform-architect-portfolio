/**
 * @description       : Agent action "Get Skills and Certifications" for the Portfolio Guide
 *                      Agent. Returns the owner's skills grouped by category, in the order the
 *                      resume uses, and the current certifications, newest first, with issuer
 *                      and year. Retired certifications are left out. Reads only through
 *                      QueryDefinitions (records PortfolioAgentCredentials_Skills and
 *                      PortfolioAgentCredentials_Certifications, shipped equal to the code
 *                      defaults). Read only, with email and phone shapes removed from every text.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/26/2026
 * @Test Class        : [PortfolioAgentCredentialsTest]
 **/
public with sharing class PortfolioAgentCredentials implements QueryDefinitions.Provider {
  private static final String SKILLS_QUERY = 'PortfolioAgentCredentials_Skills';
  private static final String CERTIFICATIONS_QUERY = 'PortfolioAgentCredentials_Certifications';
  /** The group name for a skill with no category. */
  public static final String OTHER_CATEGORY = 'Other';

  /**
   * @description What the agent passes in. Nothing is needed. The variable lets the agent call
   *              the action with an empty request.
   */
  public class Request {
    @InvocableVariable(
      label='Category'
      description='Optional. A skill category, such as Backend, to return only that group of skills.'
      required=false
    )
    public String category;
  }

  /**
   * @description What the agent gets back.
   */
  public class Response {
    @InvocableVariable(
      label='Skills and certifications (JSON)'
      description='Skills by category and the current certifications with issuer and year.'
    )
    public String credentialsJson;
  }

  /**
   * @description One skill group.
   */
  public class SkillGroup {
    public String category;
    public List<String> skills = new List<String>();
  }

  /**
   * @description One current certification.
   */
  public class CertificationView {
    public String name;
    public String issuer;
    public String year;
  }

  /**
   * @description The whole answer.
   */
  public class CredentialsView {
    public List<SkillGroup> skills = new List<SkillGroup>();
    public List<CertificationView> currentCertifications = new List<CertificationView>();
    public Integer currentCertificationCount = 0;
  }

  /**
   * @description Returns the skills and certifications once per request.
   * @param requests One request per agent call.
   * @return List<Response> One response per request, in order.
   */
  @InvocableMethod(
    label='Get Skills and Certifications'
    description='Returns Ryan Bumstead\'s skills by category and his current certifications. Read only.'
    category='Portfolio'
  )
  public static List<Response> getCredentials(List<Request> requests) {
    List<Response> responses = new List<Response>();
    List<Request> safeRequests = requests ?? new List<Request>();
    if (safeRequests.isEmpty()) {
      return responses;
    }
    List<Skill__c> skills = (List<Skill__c>) QueryDefinitions.run(
      SKILLS_QUERY,
      new Map<String, Object>(),
      skillsDefault()
    );
    List<CertificationView> certifications = toCertifications(
      (List<Certification__c>) QueryDefinitions.run(
        CERTIFICATIONS_QUERY,
        new Map<String, Object>(),
        certificationsDefault()
      )
    );
    for (Request request : safeRequests) {
      CredentialsView view = new CredentialsView();
      view.skills = groupSkills(skills, request?.category);
      view.currentCertifications = certifications;
      view.currentCertificationCount = certifications.size();
      Response response = new Response();
      response.credentialsJson = JSON.serialize(view, true);
      responses.add(response);
    }
    return responses;
  }

  /**
   * @description Skills grouped by category in read order. A category asked for returns only
   *              that group, or every group when no group has that name.
   * @param skills The skills in read order.
   * @param category A category name, or blank.
   * @return List<SkillGroup> The groups.
   */
  @TestVisible
  private static List<SkillGroup> groupSkills(
    List<Skill__c> skills,
    String category
  ) {
    Map<String, SkillGroup> groups = new Map<String, SkillGroup>();
    for (Skill__c skill : skills) {
      String name = PortfolioAgentText.clean(
        skill.Display_Name__c ?? skill.Name
      );
      if (name == null) {
        continue;
      }
      String groupName = PortfolioAgentText.clean(skill.Category__c) ??
        OTHER_CATEGORY;
      if (!groups.containsKey(groupName)) {
        SkillGroup skillGroup = new SkillGroup();
        skillGroup.category = groupName;
        groups.put(groupName, skillGroup);
      }
      groups.get(groupName).skills.add(name);
    }
    if (String.isNotBlank(category)) {
      for (String groupName : groups.keySet()) {
        if (groupName.equalsIgnoreCase(category.trim())) {
          return new List<SkillGroup>{ groups.get(groupName) };
        }
      }
    }
    return groups.values();
  }

  private static List<CertificationView> toCertifications(
    List<Certification__c> rows
  ) {
    List<CertificationView> views = new List<CertificationView>();
    for (Certification__c row : rows) {
      CertificationView view = new CertificationView();
      view.name = PortfolioAgentText.clean(row.Name);
      view.issuer = PortfolioAgentText.clean(row.Issuer__r?.Name);
      view.year = PortfolioAgentText.yearOf(row.Earned_Date__c);
      if (view.name != null) {
        views.add(view);
      }
    }
    return views;
  }

  /**
   * @description The code defaults this class owns, for QueryDefinitions.validateAll().
   * @return Map<String, QueryDefinitions.QueryDefault> The defaults by record name.
   */
  public Map<String, QueryDefinitions.QueryDefault> queryDefaults() {
    return new Map<String, QueryDefinitions.QueryDefault>{
      SKILLS_QUERY => skillsDefault(),
      CERTIFICATIONS_QUERY => certificationsDefault()
    };
  }

  @TestVisible
  private static QueryDefinitions.QueryDefault skillsDefault() {
    return new QueryDefinitions.QueryDefault(
        'Skill__c',
        'Name, Display_Name__c, Category__c'
      )
      .orderBy(
        'Category_Order__c ASC, Proficiency__c DESC NULLS LAST, Name ASC'
      )
      .rowLimit(500)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE);
  }

  @TestVisible
  private static QueryDefinitions.QueryDefault certificationsDefault() {
    return new QueryDefinitions.QueryDefault(
        'Certification__c',
        'Name, Issuer__r.Name, Earned_Date__c'
      )
      .filter('Is_Retired__c = FALSE')
      .orderBy('Earned_Date__c DESC NULLS LAST, Name ASC')
      .rowLimit(100)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE);
  }
}
