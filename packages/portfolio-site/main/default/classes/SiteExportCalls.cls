/**
 * @description       : The allowlist behind the site export (/site/export). Each entry names one
 *                      site controller method the static build may read and the parameter values
 *                      it accepts. A call or a value that is not on the list is refused before
 *                      anything runs. Accepted values come from the org (doc keys, source keys,
 *                      query definition names) or from fixed lists the controllers already use
 *                      (personas, schema scopes), never from free text. The methods run as the
 *                      calling user, so the build user must hold exactly what the site guest
 *                      holds. SiteExportResourceTest proves the results match the guest's.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/02/2026
 * @Test Class        : [SiteExportResourceTest]
 **/
public with sharing class SiteExportCalls {
  /** The most names a list parameter may hold, the same cap the controllers apply. */
  public static final Integer MAX_LIST = 12;

  @TestVisible
  private static final Set<String> PERSONAS = new Set<String>{
    'Admin',
    'Developer',
    'Architect'
  };

  @TestVisible
  private static final Set<String> SCHEMA_SCOPES = new Set<String>{
    SchemaService.SCOPE_PORTFOLIO,
    SchemaService.SCOPE_EMPLOYER_HUB
  };

  /** Every call the export serves, with the names of the parameters each one takes. */
  @TestVisible
  private static final Map<String, Set<String>> PARAMS_BY_CALL = new Map<String, Set<String>>{
    'ResumeController.getHeader' => new Set<String>(),
    'ResumeController.getTimeline' => new Set<String>(),
    'ResumeController.getResume' => new Set<String>{ 'persona' },
    'ProjectCardController.getHomeCaseStudies' => new Set<String>(),
    'ProjectCardController.getBuildCounts' => new Set<String>(),
    'ProjectCardController.getPillarCards' => new Set<String>(),
    'TestimonialController.getHomeTestimonials' => new Set<String>(),
    'TestimonialController.getApprovedTestimonials' => new Set<String>(),
    'TestimonialController.getFragments' => new Set<String>(),
    'DeliveryController.getRecentCommits' => new Set<String>{ 'simulate' },
    'DeliveryController.getRoadmap' => new Set<String>{ 'simulate' },
    'GovernanceController.getPipelineStatus' => new Set<String>(),
    'PortfolioStatsController.getStats' => new Set<String>(),
    'SourceController.getDocs' => new Set<String>(),
    'SourceController.getDoc' => new Set<String>{ 'docKey' },
    'SourceController.getSourceFiles' => new Set<String>{ 'sourceKey' },
    'SchemaService.getSchemaGraph' => new Set<String>{ 'scope' },
    'DataSourceController.getSources' => new Set<String>{ 'names' },
    'DataSourceController.getObjectSources' => new Set<String>{ 'objectNames' },
    'DecisionMatrixController.getMatrix' => new Set<String>(),
    'SkillGraphController.getCertificationLinks' => new Set<String>(),
    'FooterController.getLinks' => new Set<String>(),
    'ApiLabController.getCatalog' => new Set<String>(),
    'ApiLabController.getPostmanRunUrl' => new Set<String>(),
    'ApiLabController.getVersionlessUrls' => new Set<String>(),
    'ApiLabOptionsController.getOptions' => new Set<String>()
  };

  /**
   * @description A call or a parameter value the allowlist does not accept.
   */
  public class NotAllowedException extends Exception {
  }

  /**
   * @description Every call name on the allowlist, sorted, with its parameter names.
   * @return call name to its sorted parameter names
   */
  public static Map<String, List<String>> describe() {
    Map<String, List<String>> described = new Map<String, List<String>>();
    List<String> calls = new List<String>(PARAMS_BY_CALL.keySet());
    calls.sort();
    for (String call : calls) {
      List<String> names = new List<String>(PARAMS_BY_CALL.get(call));
      names.sort();
      described.put(call, names);
    }
    return described;
  }

  /**
   * @description Checks a call and its parameters against the allowlist, then runs it.
   * @param call the controller method, as Class.method
   * @param params the parameters, as the component would pass them
   * @return the method's result, unchanged
   * @throws NotAllowedException when the call or any value is not on the allowlist
   * @example
   * Object header = SiteExportCalls.run('ResumeController.getHeader', new Map<String, Object>());
   */
  public static Object run(String call, Map<String, Object> params) {
    Map<String, Object> given = params ?? new Map<String, Object>();
    if (String.isBlank(call) || !PARAMS_BY_CALL.containsKey(call)) {
      throw new NotAllowedException('Unknown call.');
    }
    for (String name : given.keySet()) {
      if (!PARAMS_BY_CALL.get(call).contains(name)) {
        throw new NotAllowedException('Unknown parameter: ' + name);
      }
    }
    for (String name : PARAMS_BY_CALL.get(call)) {
      if (!given.containsKey(name)) {
        throw new NotAllowedException('Missing parameter: ' + name);
      }
    }
    return dispatch(call, given);
  }

  private static Object dispatch(String call, Map<String, Object> params) {
    return call.startsWith('SourceController.') ||
      call.startsWith('SchemaService.') ||
      call.startsWith('DataSourceController.') ||
      call.startsWith('DecisionMatrixController.') ||
      call.startsWith('SkillGraphController.') ||
      call.startsWith('FooterController.') ||
      call.startsWith('ApiLab')
      ? dispatchSite(call, params)
      : dispatchContent(call, params);
  }

  private static Object dispatchContent(
    String call,
    Map<String, Object> params
  ) {
    switch on call {
      when 'ResumeController.getHeader' {
        return ResumeController.getHeader();
      }
      when 'ResumeController.getTimeline' {
        return ResumeController.getTimeline();
      }
      when 'ResumeController.getResume' {
        return ResumeController.getResume(oneOf(params, 'persona', PERSONAS));
      }
      when 'ProjectCardController.getHomeCaseStudies' {
        return ProjectCardController.getHomeCaseStudies();
      }
      when 'ProjectCardController.getBuildCounts' {
        return ProjectCardController.getBuildCounts();
      }
      when 'ProjectCardController.getPillarCards' {
        return ProjectCardController.getPillarCards();
      }
      when 'TestimonialController.getHomeTestimonials' {
        return TestimonialController.getHomeTestimonials();
      }
      when 'TestimonialController.getApprovedTestimonials' {
        return TestimonialController.getApprovedTestimonials();
      }
      when 'TestimonialController.getFragments' {
        return TestimonialController.getFragments();
      }
      when 'DeliveryController.getRecentCommits' {
        return DeliveryController.getRecentCommits(flag(params, 'simulate'));
      }
      when 'DeliveryController.getRoadmap' {
        return DeliveryController.getRoadmap(flag(params, 'simulate'));
      }
      when 'GovernanceController.getPipelineStatus' {
        return GovernanceController.getPipelineStatus();
      }
      when 'PortfolioStatsController.getStats' {
        return PortfolioStatsController.getStats();
      }
    }
    throw new NotAllowedException('Unknown call.');
  }

  private static Object dispatchSite(String call, Map<String, Object> params) {
    switch on call {
      when 'SourceController.getDocs' {
        return SourceController.getDocs();
      }
      when 'SourceController.getDoc' {
        return SourceController.getDoc(oneOf(params, 'docKey', docKeys()));
      }
      when 'SourceController.getSourceFiles' {
        return SourceController.getSourceFiles(
          oneOf(params, 'sourceKey', sourceKeys())
        );
      }
      when 'SchemaService.getSchemaGraph' {
        return SchemaService.getSchemaGraph(
          oneOf(params, 'scope', SCHEMA_SCOPES)
        );
      }
      when 'DataSourceController.getSources' {
        return DataSourceController.getSources(
          listOf(params, 'names', definitionNames())
        );
      }
      when 'DataSourceController.getObjectSources' {
        return DataSourceController.getObjectSources(
          listOf(params, 'objectNames', definitionObjects())
        );
      }
      when 'DecisionMatrixController.getMatrix' {
        return DecisionMatrixController.getMatrix();
      }
      when 'SkillGraphController.getCertificationLinks' {
        return SkillGraphController.getCertificationLinks();
      }
      when 'FooterController.getLinks' {
        return FooterController.getLinks();
      }
      when 'ApiLabController.getCatalog' {
        return ApiLabController.getCatalog();
      }
      when 'ApiLabController.getPostmanRunUrl' {
        return ApiLabController.getPostmanRunUrl();
      }
      when 'ApiLabController.getVersionlessUrls' {
        return ApiLabController.getVersionlessUrls();
      }
      when 'ApiLabOptionsController.getOptions' {
        return ApiLabOptionsController.getOptions();
      }
    }
    throw new NotAllowedException('Unknown call.');
  }

  private static String oneOf(
    Map<String, Object> params,
    String name,
    Set<String> allowed
  ) {
    Object value = params.get(name);
    if (!(value instanceof String) || !allowed.contains((String) value)) {
      throw new NotAllowedException('Value not allowed for ' + name);
    }
    return (String) value;
  }

  private static Boolean flag(Map<String, Object> params, String name) {
    Object value = params.get(name);
    if (!(value instanceof Boolean)) {
      throw new NotAllowedException('Value not allowed for ' + name);
    }
    return (Boolean) value;
  }

  private static List<String> listOf(
    Map<String, Object> params,
    String name,
    Set<String> allowed
  ) {
    Object value = params.get(name);
    if (!(value instanceof List<Object>)) {
      throw new NotAllowedException('Value not allowed for ' + name);
    }
    List<Object> items = (List<Object>) value;
    if (items.isEmpty() || items.size() > MAX_LIST) {
      throw new NotAllowedException('Value not allowed for ' + name);
    }
    List<String> names = new List<String>();
    for (Object item : items) {
      if (!(item instanceof String) || !allowed.contains((String) item)) {
        throw new NotAllowedException('Value not allowed for ' + name);
      }
      names.add((String) item);
    }
    return names;
  }

  /** The doc keys the docs page lists, read the way the page reads them. */
  @TestVisible
  private static Set<String> docKeys() {
    Set<String> keys = new Set<String>();
    for (SourceController.DocSummary doc : SourceController.getDocs()) {
      if (doc != null && String.isNotBlank(doc.key)) {
        keys.add(doc.key);
      }
    }
    return keys;
  }

  /** Every source key a View source button can name. */
  @TestVisible
  private static Set<String> sourceKeys() {
    Set<String> keys = new Set<String>();
    for (Source_File__mdt file : Source_File__mdt.getAll().values()) {
      if (String.isNotBlank(file.Source_Key__c)) {
        keys.add(file.Source_Key__c);
      }
    }
    return keys;
  }

  /** Every query definition name a live data marker can name. */
  @TestVisible
  private static Set<String> definitionNames() {
    return new Set<String>(Query_Definition__mdt.getAll().keySet());
  }

  /** Every object a query definition reads, for a marker that names objects. */
  @TestVisible
  private static Set<String> definitionObjects() {
    Set<String> objects = new Set<String>();
    for (
      Query_Definition__mdt definition : Query_Definition__mdt.getAll().values()
    ) {
      if (String.isNotBlank(definition.Object__c)) {
        objects.add(definition.Object__c);
      }
    }
    return objects;
  }
}
