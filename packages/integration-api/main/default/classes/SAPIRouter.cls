/**
 * @description       : The versionless SAPI entry (/sapi/*, ADR-040). While the
 *                      Api_Versionless_Urls switch is Off it answers 404 with the /v1/ URL. Maps the first route
 *                      segment to the existing handler and calls its static method, so
 *                      /sapi/skills and the old /sapi/v1/skills reach the same code. The most
 *                      specific urlMapping wins, so every existing /sapi/v1/ class still owns
 *                      its own URL. An unknown route is 404. SAPI has only GET routes, so any
 *                      other verb never reaches Apex: the platform answers 405 as it did
 *                      before. The site guest is granted this class and answered 401 on
 *                      every route, the same gate PAPIRouter has.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/31/2026
 * @Test Class        : [SAPIRouterTest]
 **/
@RestResource(urlMapping='/sapi/*')
global with sharing class SAPIRouter {
  public static final String ROUTE_HEALTH = 'health';

  /**
   * @description Routes a GET (and HEAD) to the handler for its resource.
   */
  @HttpGet
  global static void doGet() {
    String route = routeOf(RestContext.request?.requestURI);
    if (route == null) {
      ApiRouting.notFound();
    } else if (isGuest()) {
      ApiRouting.unauthorized();
    } else if (!ApiRoutes.isVersionless()) {
      ApiRouting.switchedOff();
    } else if (route == ROUTE_HEALTH) {
      SAPIHealth.getHealth();
    } else if (route == 'accounts') {
      SAPIAccount.getAccounts();
    } else if (route == 'certification-skills') {
      SAPICertificationSkill.getCertificationSkills();
    } else if (route == 'certifications') {
      SAPICertification.getCertifications();
    } else if (route == 'contacts') {
      SAPIContact.getContacts();
    } else if (route == 'education') {
      SAPIEducation.getEducation();
    } else if (route == 'experience-highlights') {
      SAPIExperienceHighlight.getExperienceHighlights();
    } else if (route == 'experience-skills') {
      SAPIExperienceSkill.getExperienceSkills();
    } else if (route == 'experience') {
      SAPIExperience.getExperiences();
    } else if (route == 'portfolio-config') {
      SAPIPortfolioConfig.getPortfolioConfig();
    } else if (route == 'project-assets') {
      SAPIProjectAsset.getProjectAssets();
    } else if (route == 'project-skills') {
      SAPIProjectSkill.getProjectSkills();
    } else if (route == 'projects') {
      SAPIProject.getProjects();
    } else if (route == 'skills') {
      SAPISkill.getSkills();
    } else {
      SAPITestimonial.getTestimonials();
    }
  }

  /**
   * @description The resource a URI names, or null when it names none. Health matches its
   *              segment and nothing after it. Every other resource takes anything after
   *              the segment, as its old wildcard mapping did.
   * @param uri The request URI.
   * @return String The resource name, or null.
   */
  @TestVisible
  private static String routeOf(String uri) {
    List<String> parts = ApiRouting.routeParts(uri);
    if (parts.isEmpty()) {
      return null;
    }
    if (parts[0] == ROUTE_HEALTH) {
      return parts.size() == 1 ? ROUTE_HEALTH : null;
    }
    return RESOURCES.contains(parts[0]) ? parts[0] : null;
  }

  // Class access is checked on the entry class, so the site guest is granted this class and
  // turned away here, as PAPIRouter does for the routes it may not reach. The guest is answered
  // 401 on every SAPI route and reaches no data.
  private static Boolean isGuest() {
    return guestOverride != null
      ? guestOverride
      : UserInfo.getUserType() == 'Guest';
  }

  // A test sets this to act as the guest or as anyone else.
  @TestVisible
  private static Boolean guestOverride;

  private static final Set<String> RESOURCES = new Set<String>{
    'accounts',
    'certification-skills',
    'certifications',
    'contacts',
    'education',
    'experience-highlights',
    'experience-skills',
    'experience',
    'portfolio-config',
    'project-assets',
    'project-skills',
    'projects',
    'skills',
    'testimonials'
  };
}
