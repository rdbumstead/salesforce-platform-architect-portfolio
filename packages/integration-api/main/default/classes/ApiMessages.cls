/**
 * @description       : Every sentence the API sends a person, in one place. Each message is a
 *                      constant or a small builder, so a test asserts the constant and not a
 *                      copy of the text. A message says what happened, what the person needs
 *                      and how to get it, in plain second person English with a closing period,
 *                      and never holds an exception type, a stack line or a class name.
 *                      Holds no data access.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/31/2026
 * @Test Class        : [ApiMessagesTest]
 **/
public with sharing class ApiMessages {
  /**
   * @description A number of seconds as words, with the singular for one.
   * @param count The number of seconds.
   * @return String For example 1 second or 30 seconds.
   */
  public static String seconds(Integer count) {
    return count + (count == 1 ? ' second' : ' seconds');
  }

  /**
   * @description The 500 message. It holds the correlation id so the owner can find the
   *              logged detail, and no part of the exception.
   * @param correlationId The request's correlation id.
   * @return String The message.
   */
  public static String serverError(String correlationId) {
    return 'Something went wrong on our side, and it has been logged as ' +
      correlationId +
      '. Try again in a minute. If it keeps happening, send that id through ryanbumstead.com/contact.';
  }

  /**
   * @description The 401 for a caller with no token on a route that needs one.
   * @param path The route called, for example /papi/projects.
   * @param tokenUrl The site's token URL, see ApiSite.tokenUrl.
   * @return String The message.
   */
  public static String needsToken(String path, String tokenUrl) {
    return 'This route needs an evaluator token. Get one with POST ' +
      tokenUrl +
      ' and a JSON body with your email and a purpose. Then call ' +
      path +
      ' on the instance_url from that answer, with the header Authorization: Bearer <access_token>.';
  }

  /**
   * @description The 403 for a token holder who asks the instance address for a token.
   * @param tokenUrl The site's token URL.
   * @return String The message.
   */
  public static String tokensNotHere(String tokenUrl) {
    return 'This address does not issue tokens. Send POST ' +
      tokenUrl +
      ' without an Authorization header to get one.';
  }

  /** The token body sample, reused by every message that shows the shape. */
  public static final String TOKEN_BODY_SAMPLE = '{"email":"you@example.com","purpose":"Evaluating the API"}';

  /**
   * @description The 405 message for a route called with a verb it does not have.
   * @param path The route called.
   * @param allowed The verbs it has, for example GET,HEAD.
   * @param verb The verb sent.
   * @param route The route name after the API root, to add the sentence about its body.
   * @return String The message.
   */
  public static String methodNotAllowed(
    String path,
    String allowed,
    String verb,
    String route
  ) {
    String message =
      path +
      ' takes ' +
      String.join(allowed.split(','), ' or ') +
      ', not ' +
      verb +
      '.';
    if (route == PAPIRouter.ROUTE_AUTH_TOKEN) {
      message += ' Send a JSON body like ' + TOKEN_BODY_SAMPLE + '.';
    } else if (route == PAPIRouter.ROUTE_AI_GENERATE) {
      message += ' See the request body in the API reference.';
    }
    return message;
  }
}
