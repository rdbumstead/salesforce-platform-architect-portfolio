/**
 * @description       : Agent action "Get Career History" for the Portfolio Guide Agent. Returns
 *                      the owner's roles, newest first, each with its title, employer, years and
 *                      up to MAX_HIGHLIGHTS highlights, as JSON the agent reads. A persona
 *                      (Architect, Developer or Admin) puts the highlights tagged with it first.
 *                      Reads only through QueryDefinitions (records PortfolioAgentCareer_Roles and
 *                      PortfolioAgentCareer_Highlights, shipped equal to the code defaults).
 *                      Read only. No Contact is read, and email and phone shapes are removed
 *                      from every text, so no contact detail can reach the agent.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/26/2026
 * @Test Class        : [PortfolioAgentCareerTest]
 **/
public with sharing class PortfolioAgentCareer implements QueryDefinitions.Provider {
  private static final String ROLES_QUERY = 'PortfolioAgentCareer_Roles';
  private static final String HIGHLIGHTS_QUERY = 'PortfolioAgentCareer_Highlights';
  /** Highlights returned per role at most. */
  public static final Integer MAX_HIGHLIGHTS = 3;
  /** Roles returned at most. */
  public static final Integer MAX_ROLES = 15;

  /**
   * @description What the agent passes in.
   */
  public class Request {
    @InvocableVariable(
      label='Persona'
      description='Optional. Architect, Developer or Admin, to put the highlights of that kind of work first.'
      required=false
    )
    public String persona;
  }

  /**
   * @description What the agent gets back.
   */
  public class Response {
    @InvocableVariable(
      label='Career history (JSON)'
      description='The roles, newest first, with title, employer, years, whether current, and highlights.'
    )
    public String careerJson;
  }

  /**
   * @description One role as the agent reads it.
   */
  public class RoleView {
    public String title;
    public String employer;
    public String startYear;
    public String endYear;
    public Boolean isCurrent;
    public List<String> highlights = new List<String>();
  }

  /**
   * @description Returns the career history once per request.
   * @param requests One request per agent call.
   * @return List<Response> One response per request, in order.
   */
  @InvocableMethod(
    label='Get Career History'
    description='Returns Ryan Bumstead\'s roles, newest first, with employer, years and highlights. Read only.'
    category='Portfolio'
  )
  public static List<Response> getCareerHistory(List<Request> requests) {
    List<Response> responses = new List<Response>();
    List<Request> safeRequests = requests ?? new List<Request>();
    if (safeRequests.isEmpty()) {
      return responses;
    }
    List<Experience__c> roles = (List<Experience__c>) QueryDefinitions.run(
      ROLES_QUERY,
      new Map<String, Object>(),
      rolesDefault()
    );
    Map<Id, List<Experience_Highlight__c>> highlightsByRole = highlightsFor(
      roles
    );
    for (Request request : safeRequests) {
      Response response = new Response();
      response.careerJson = JSON.serialize(
        toViews(roles, highlightsByRole, request?.persona),
        true
      );
      responses.add(response);
    }
    return responses;
  }

  private static Map<Id, List<Experience_Highlight__c>> highlightsFor(
    List<Experience__c> roles
  ) {
    Map<Id, List<Experience_Highlight__c>> byRole = new Map<Id, List<Experience_Highlight__c>>();
    if (roles.isEmpty()) {
      return byRole;
    }
    Set<Id> roleIds = new Map<Id, Experience__c>(roles).keySet();
    for (
      Experience_Highlight__c highlight : (List<Experience_Highlight__c>) QueryDefinitions.run(
        HIGHLIGHTS_QUERY,
        new Map<String, Object>{ 'experienceIds' => roleIds },
        highlightsDefault()
      )
    ) {
      if (!byRole.containsKey(highlight.Experience__c)) {
        byRole.put(
          highlight.Experience__c,
          new List<Experience_Highlight__c>()
        );
      }
      byRole.get(highlight.Experience__c).add(highlight);
    }
    return byRole;
  }

  private static List<RoleView> toViews(
    List<Experience__c> roles,
    Map<Id, List<Experience_Highlight__c>> highlightsByRole,
    String persona
  ) {
    List<RoleView> views = new List<RoleView>();
    for (Experience__c role : roles) {
      if (views.size() >= MAX_ROLES) {
        break;
      }
      RoleView view = new RoleView();
      view.title = PortfolioAgentText.clean(role.Name);
      view.employer = PortfolioAgentText.clean(role.Employer__r?.Name);
      view.startYear = PortfolioAgentText.yearOf(role.Start_Date__c);
      view.endYear = role.Is_Current_Role__c == true
        ? null
        : PortfolioAgentText.yearOf(role.End_Date__c);
      view.isCurrent = role.Is_Current_Role__c == true;
      view.highlights = pickHighlights(highlightsByRole.get(role.Id), persona);
      views.add(view);
    }
    return views;
  }

  /**
   * @description Up to MAX_HIGHLIGHTS highlight texts: those tagged with the persona first,
   *              then the rest, each group in sort order.
   * @param highlights The role's highlights in sort order, or null.
   * @param persona Architect, Developer or Admin, or blank.
   * @return List<String> The texts.
   */
  @TestVisible
  private static List<String> pickHighlights(
    List<Experience_Highlight__c> highlights,
    String persona
  ) {
    List<String> tagged = new List<String>();
    List<String> others = new List<String>();
    for (
      Experience_Highlight__c highlight : highlights ??
        new List<Experience_Highlight__c>()
    ) {
      String text = PortfolioAgentText.clean(highlight.Description__c);
      if (text == null) {
        continue;
      }
      Boolean matches =
        String.isNotBlank(persona) &&
        String.isNotBlank(highlight.Persona_Tag__c) &&
        new Set<String>(highlight.Persona_Tag__c.split(';'))
          .contains(persona.trim());
      (matches ? tagged : others).add(text);
    }
    tagged.addAll(others);
    List<String> picked = new List<String>();
    for (String text : tagged) {
      if (picked.size() >= MAX_HIGHLIGHTS) {
        break;
      }
      picked.add(text);
    }
    return picked;
  }

  /**
   * @description The code defaults this class owns, for QueryDefinitions.validateAll().
   * @return Map<String, QueryDefinitions.QueryDefault> The defaults by record name.
   */
  public Map<String, QueryDefinitions.QueryDefault> queryDefaults() {
    return new Map<String, QueryDefinitions.QueryDefault>{
      ROLES_QUERY => rolesDefault(),
      HIGHLIGHTS_QUERY => highlightsDefault()
    };
  }

  @TestVisible
  private static QueryDefinitions.QueryDefault rolesDefault() {
    return new QueryDefinitions.QueryDefault(
        'Experience__c',
        'Id, Name, Employer__r.Name, Start_Date__c, End_Date__c, Is_Current_Role__c'
      )
      .orderBy(
        'Is_Current_Role__c DESC, Start_Date__c DESC NULLS LAST, Sort_Order__c ASC'
      )
      .rowLimit(MAX_ROLES)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE);
  }

  @TestVisible
  private static QueryDefinitions.QueryDefault highlightsDefault() {
    return new QueryDefinitions.QueryDefault(
        'Experience_Highlight__c',
        'Experience__c, Description__c, Persona_Tag__c, Sort_Order__c'
      )
      .filter('Experience__c IN :experienceIds')
      .orderBy('Sort_Order__c ASC NULLS LAST')
      .rowLimit(500)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(new Map<String, Object>{ 'experienceIds' => new Set<Id>() });
  }
}
