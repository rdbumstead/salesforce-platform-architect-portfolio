/**
 * @description       : Reads recent commits from the GitHub API through the GitHub_API Named
 *                      Credential and maps them to DeliveryController.CommitItem, the payload
 *                      DTO of the Delivery page (pillar-e-design 4.2 and 4.4). Only
 *                      GitHubCacheRefreshJob calls it, as the scheduling admin. Guests never
 *                      reach it: the page reads the cache through DeliveryController. A
 *                      failure throws GitHubServiceException so the job inserts nothing and
 *                      counts the failure on the circuit breaker.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/12/2025
 * @Test Class        : [GitHubServiceTest]
 **/
public with sharing class GitHubService {
  /**
   * @description Thrown when the commits cannot be read: a bad path, a non-200 status or a
   *              body that is not a list of commits.
   */
  public class GitHubServiceException extends Exception {
  }

  public static final String BRANCH = 'main';
  public static final Integer COMMIT_COUNT = 10;
  public static final Integer MESSAGE_MAX_LENGTH = 100;

  /** owner/repository, each one GitHub name segment. */
  private static final Pattern REPO_PATH = Pattern.compile(
    '^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$'
  );

  /**
   * @description Calls GET /repos/{path}/commits on main and maps the newest commits.
   * @param repoPath owner/repository, from Portfolio_Config__mdt.GitHub_Repo_Path__c.
   * @return List<DeliveryController.CommitItem> Newest first, at most COMMIT_COUNT.
   * @throws GitHubServiceException When the path is invalid, the status is not 200 or the
   *                                body is not a commit list.
   */
  public static List<DeliveryController.CommitItem> fetchRecentCommits(
    String repoPath
  ) {
    if (!isValidRepoPath(repoPath)) {
      throw new GitHubServiceException('Invalid repository path.');
    }
    HttpResponse response = new Http().send(commitsRequest(repoPath.trim()));
    if (response.getStatusCode() != 200) {
      throw new GitHubServiceException('HTTP ' + response.getStatusCode());
    }
    return parseCommits(response.getBody());
  }

  /**
   * @description Whether a repository path is safe to put in the request path.
   * @param repoPath The configured path.
   * @return Boolean True for owner/repository.
   */
  public static Boolean isValidRepoPath(String repoPath) {
    return String.isNotBlank(repoPath) &&
      REPO_PATH.matcher(repoPath.trim()).matches();
  }

  private static HttpRequest commitsRequest(String repoPath) {
    HttpRequest request = new HttpRequest();
    request.setEndpoint(
      'callout:GitHub_API/repos/' +
        repoPath +
        '/commits?sha=' +
        BRANCH +
        '&per_page=' +
        COMMIT_COUNT
    );
    request.setMethod('GET');
    request.setHeader('Accept', 'application/vnd.github+json');
    return request;
  }

  @TestVisible
  private static List<DeliveryController.CommitItem> parseCommits(String body) {
    Object parsed;
    try {
      parsed = JSON.deserializeUntyped(body);
    } catch (JSONException e) {
      throw new GitHubServiceException('Body is not JSON.', e);
    }
    if (!(parsed instanceof List<Object>)) {
      throw new GitHubServiceException('Body is not a commit list.');
    }
    List<DeliveryController.CommitItem> items = new List<DeliveryController.CommitItem>();
    for (Object entry : (List<Object>) parsed) {
      if (entry instanceof Map<String, Object>) {
        items.add(toItem((Map<String, Object>) entry));
      }
    }
    return items;
  }

  private static DeliveryController.CommitItem toItem(
    Map<String, Object> root
  ) {
    Map<String, Object> commitData = mapOf(root.get('commit'));
    Map<String, Object> gitAuthor = mapOf(commitData?.get('author'));
    Map<String, Object> gitHubUser = mapOf(root.get('author'));

    DeliveryController.CommitItem item = new DeliveryController.CommitItem();
    item.sha = stringOf(root.get('sha'));
    item.url = stringOf(root.get('html_url'));
    item.message = firstLine(stringOf(commitData?.get('message')));
    if (gitHubUser != null) {
      item.authorName = stringOf(gitHubUser.get('login'));
      item.authorAvatarUrl = stringOf(gitHubUser.get('avatar_url'));
    }
    if (String.isBlank(item.authorName) && gitAuthor != null) {
      item.authorName = stringOf(gitAuthor.get('name'));
    }
    item.committedAt = DeliveryController.parseTimestamp(
      stringOf(gitAuthor?.get('date'))
    );
    return item;
  }

  /**
   * @description The first line of a commit message, cut to MESSAGE_MAX_LENGTH.
   * @param message Full commit message.
   * @return String The first line, or null.
   */
  @TestVisible
  private static String firstLine(String message) {
    if (message == null) {
      return null;
    }
    String line = message.split('\n', 2)[0].trim();
    return line.length() > MESSAGE_MAX_LENGTH
      ? line.substring(0, MESSAGE_MAX_LENGTH)
      : line;
  }

  private static Map<String, Object> mapOf(Object value) {
    return value instanceof Map<String, Object>
      ? (Map<String, Object>) value
      : null;
  }

  private static String stringOf(Object value) {
    return value instanceof String ? (String) value : null;
  }
}
