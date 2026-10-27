/**
 * @description       : Agent action "Get Portfolio Projects" for the Portfolio Guide Agent.
 *                      Returns the featured projects and the home page case studies, each with
 *                      its name, the problem, the solution, the business value, its headline
 *                      metric, status and year, as JSON the agent reads. An optional keyword
 *                      phrase keeps the projects whose text holds one of its words, and returns
 *                      all of them when none does. Reads only through QueryDefinitions (record
 *                      PortfolioAgentProjects_Projects, shipped equal to the code default).
 *                      Read only. The client line is never read, so no client name reaches the
 *                      agent, and email and phone shapes are removed from every text.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 * @Test Class        : [PortfolioAgentProjectsTest]
 **/
public with sharing class PortfolioAgentProjects implements QueryDefinitions.Provider {
  private static final String PROJECTS_QUERY = 'PortfolioAgentProjects_Projects';
  /** Projects returned at most. */
  public static final Integer MAX_PROJECTS = 6;
  /** Projects read at most before the keyword is applied. */
  public static final Integer CANDIDATES = 50;

  /**
   * @description What the agent passes in.
   */
  public class Request {
    @InvocableVariable(
      label='Keyword'
      description='Optional. Words from the question, such as integration or nonprofit, to pick the projects that mention them.'
      required=false
    )
    public String keyword;
  }

  /**
   * @description What the agent gets back.
   */
  public class Response {
    @InvocableVariable(
      label='Projects (JSON)'
      description='The projects with name, problem, solution, business value, headline metric, status and year.'
    )
    public String projectsJson;
  }

  /**
   * @description One project as the agent reads it.
   */
  public class ProjectView {
    public String name;
    public String area;
    public String problem;
    public String solution;
    public String businessValue;
    public String headlineMetric;
    public String status;
    public String year;
  }

  /**
   * @description Returns the projects once per request.
   * @param requests One request per agent call.
   * @return List<Response> One response per request, in order.
   */
  @InvocableMethod(
    label='Get Portfolio Projects'
    description='Returns Ryan Bumstead\'s featured projects and case studies with the problem, the solution and the business value. Read only.'
    category='Portfolio'
  )
  public static List<Response> getProjects(List<Request> requests) {
    List<Response> responses = new List<Response>();
    List<Request> safeRequests = requests ?? new List<Request>();
    if (safeRequests.isEmpty()) {
      return responses;
    }
    List<ProjectView> all = new List<ProjectView>();
    for (
      Project__c project : (List<Project__c>) QueryDefinitions.run(
        PROJECTS_QUERY,
        new Map<String, Object>(),
        projectsDefault()
      )
    ) {
      all.add(toView(project));
    }
    for (Request request : safeRequests) {
      Response response = new Response();
      response.projectsJson = JSON.serialize(
        pickProjects(all, request?.keyword),
        true
      );
      responses.add(response);
    }
    return responses;
  }

  /**
   * @description Up to MAX_PROJECTS projects that match the keyword, or the first ones when
   *              none matches.
   * @param all Every project in read order.
   * @param keyword Words to look for, or blank.
   * @return List<ProjectView> The projects.
   */
  @TestVisible
  private static List<ProjectView> pickProjects(
    List<ProjectView> all,
    String keyword
  ) {
    List<ProjectView> matched = new List<ProjectView>();
    for (ProjectView view : all) {
      if (PortfolioAgentText.matches(searchable(view), keyword)) {
        matched.add(view);
      }
    }
    List<ProjectView> source = matched.isEmpty() ? all : matched;
    List<ProjectView> picked = new List<ProjectView>();
    for (ProjectView view : source) {
      if (picked.size() >= MAX_PROJECTS) {
        break;
      }
      picked.add(view);
    }
    return picked;
  }

  private static String searchable(ProjectView view) {
    return String.join(
      new List<String>{
        view.name ?? '',
        view.area ?? '',
        view.problem ?? '',
        view.solution ?? '',
        view.businessValue ?? ''
      },
      ' '
    );
  }

  private static ProjectView toView(Project__c project) {
    ProjectView view = new ProjectView();
    view.name = PortfolioAgentText.clean(project.Name);
    view.area = PortfolioAgentText.clean(project.Pillar_Label__c);
    view.problem = PortfolioAgentText.clean(project.Challenge__c);
    view.solution = PortfolioAgentText.clean(project.Solution__c);
    view.businessValue = PortfolioAgentText.clean(project.Business_Value__c);
    String metric = PortfolioAgentText.clean(project.Headline_Metric__c);
    String label = PortfolioAgentText.clean(project.Headline_Metric_Label__c);
    view.headlineMetric = metric == null
      ? null
      : (label == null ? metric : metric + ' ' + label);
    view.status = PortfolioAgentText.clean(project.Status__c);
    String year = PortfolioAgentText.clean(project.Year_Completed__c);
    // The formula reads a missing completion date as 0.
    view.year = year == '0' ? null : year;
    return view;
  }

  /**
   * @description The code defaults this class owns, for QueryDefinitions.validateAll().
   * @return Map<String, QueryDefinitions.QueryDefault> The defaults by record name.
   */
  public Map<String, QueryDefinitions.QueryDefault> queryDefaults() {
    return new Map<String, QueryDefinitions.QueryDefault>{
      PROJECTS_QUERY => projectsDefault()
    };
  }

  @TestVisible
  private static QueryDefinitions.QueryDefault projectsDefault() {
    return new QueryDefinitions.QueryDefault(
        'Project__c',
        'Name, Pillar_Label__c, Challenge__c, Solution__c, Business_Value__c, Headline_Metric__c, Headline_Metric_Label__c, Status__c, Year_Completed__c'
      )
      .filter('Is_Featured__c = TRUE OR Home_Sort__c != NULL')
      .orderBy(
        'Home_Sort__c ASC NULLS LAST, Sort_Order__c ASC NULLS LAST, Name ASC'
      )
      .rowLimit(CANDIDATES)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE);
  }
}
