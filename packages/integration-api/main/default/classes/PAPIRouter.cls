/**
 * @description       : The versionless PAPI entry (/papi/*, ADR-040). While the
 *                      Api_Versionless_Urls switch is Off it answers 404 with the /v1/ URL. Maps the first route
 *                      segment to the existing handler for the verb and calls its static
 *                      method, so /papi/projects and the old /papi/v1/projects reach the same
 *                      code. The most specific urlMapping wins, so every existing /papi/v1/
 *                      class still owns its own URL and this class only ever sees versionless
 *                      URLs and unknown ones. An unknown route is 404 and a verb the route
 *                      lacks is 405, both in the standard error envelope. Class access is checked on
 *                      this class and not on the ones it calls, so it keeps the old matrix
 *                      itself: the site guest reaches the token route only and is answered 401 on any other
 *                      route, and the integration user reaches everything but the token route
 *                      and is answered 403 there (ADR-028, ADR-040).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/31/2026
 * @Test Class        : [PAPIRouterTest]
 **/
@RestResource(urlMapping='/papi/*')
global with sharing class PAPIRouter {
  public static final String ROUTE_AI_GENERATE = 'ai/generate';
  public static final String ROUTE_AUTH_TOKEN = 'auth/token';
  public static final String ROUTE_HEALTH = 'health';
  public static final String ROUTE_PROFILE = 'profile';
  public static final String ROUTE_PROJECTS = 'projects';
  public static final String ROUTE_RESUME = 'resume';
  public static final String ROUTE_TESTIMONIAL_FEED = 'testimonials/feed';

  public static final String INTEGRATION_PROFILE = 'Portfolio API Integration';

  // A test sets these to act as the guest, as the integration user, or as anyone else.
  @TestVisible
  private static Boolean guestOverride;
  @TestVisible
  private static Boolean integrationUserOverride;

  /**
   * @description Routes a GET (and HEAD) to the handler for its route.
   */
  @HttpGet
  global static void doGet() {
    String route = routeOf(RestContext.request?.requestURI);
    if (route == null) {
      ApiRouting.notFound(isGuest());
    } else if (isHidden(route)) {
      refuse();
    } else if (!ApiRoutes.isVersionless()) {
      ApiRouting.switchedOff();
    } else if (route == ROUTE_HEALTH) {
      PAPIHealth.getHealth();
    } else if (route == ROUTE_PROFILE) {
      PAPIProfile.getProfile();
    } else if (route == ROUTE_PROJECTS) {
      PAPIProjects.getProjects();
    } else if (route == ROUTE_RESUME) {
      PAPIResume.getResume();
    } else if (route == ROUTE_TESTIMONIAL_FEED) {
      PAPITestimonialFeed.getFeed();
    } else {
      ApiRouting.methodNotAllowed('GET', 'POST', route);
    }
  }

  /**
   * @description Routes a POST to the handler for its route.
   */
  @HttpPost
  global static void doPost() {
    String route = routeOf(RestContext.request?.requestURI);
    if (route == null) {
      ApiRouting.notFound(isGuest());
    } else if (isHidden(route)) {
      refuse();
    } else if (!ApiRoutes.isVersionless()) {
      ApiRouting.switchedOff();
    } else if (route == ROUTE_AUTH_TOKEN) {
      PAPIAuthToken.requestToken();
    } else if (route == ROUTE_AI_GENERATE) {
      PAPIAiGenerate.generate();
    } else {
      ApiRouting.methodNotAllowed('POST', 'GET,HEAD', route);
    }
  }

  /**
   * @description The route a URI names, or null when it names none. Health and the three
   *              routes with two segments match their segments and nothing after them.
   *              Profile, projects and resume take anything after the segment, as their
   *              old wildcard mappings did.
   * @param uri The request URI.
   * @return String One of the ROUTE_ constants, or null.
   */
  @TestVisible
  private static String routeOf(String uri) {
    List<String> parts = ApiRouting.routeParts(uri);
    if (parts.isEmpty()) {
      return null;
    }
    String first = parts[0];
    if (parts.size() == 1 && first == ROUTE_HEALTH) {
      return ROUTE_HEALTH;
    }
    if (parts.size() == 2) {
      String pair = first + '/' + parts[1];
      if (
        pair == ROUTE_AI_GENERATE ||
        pair == ROUTE_AUTH_TOKEN ||
        pair == ROUTE_TESTIMONIAL_FEED
      ) {
        return pair;
      }
    }
    if (
      first == ROUTE_PROFILE ||
      first == ROUTE_PROJECTS ||
      first == ROUTE_RESUME
    ) {
      return first;
    }
    return null;
  }

  // Class access is checked on the entry class, not on the classes it calls, so the router
  // holds the access the old classes had. The guest could run PAPIAuthToken and nothing else.
  // The integration user (the profile the vended tokens run as) could run every PAPI class
  // except PAPIAuthToken. Anyone else, an administrator for one, could run all of them.
  private static Boolean isHidden(String route) {
    Boolean tokenRoute = route == ROUTE_AUTH_TOKEN;
    if (isGuest()) {
      return !tokenRoute;
    }
    return tokenRoute && isIntegrationUser();
  }

  // The guest is told to get a token (401). The integration user is told tokens are issued on
  // the site (403).
  private static void refuse() {
    if (isGuest()) {
      ApiRouting.unauthorized();
    } else {
      ApiRouting.forbidden();
    }
  }

  private static Boolean isGuest() {
    return guestOverride != null
      ? guestOverride
      : UserInfo.getUserType() == 'Guest';
  }

  private static Boolean isIntegrationUser() {
    if (integrationUserOverride != null) {
      return integrationUserOverride;
    }
    List<Profile> profiles = [
      SELECT Name
      FROM Profile
      WHERE Id = :UserInfo.getProfileId()
      LIMIT 1
    ];
    return !profiles.isEmpty() && profiles[0].Name == INTEGRATION_PROFILE;
  }
}
