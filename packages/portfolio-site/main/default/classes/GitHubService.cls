/**
 * @description       : Reads the GitHub API through the GitHub_API Named Credential. Recent
 *                      commits map to DeliveryController.CommitItem, the payload DTO of the
 *                      Delivery page (pillar-e-design 4.2 and 4.4). A file on main comes back
 *                      as FileContent for the View source cache (Round 7 contract P2). Only
 *                      GitHubCacheRefreshJob and SourceCacheRefreshJob call it, as the
 *                      scheduling admin. Guests never reach it: pages read the caches. A
 *                      failure throws GitHubServiceException so the caller keeps its newest good
 *                      row and counts the failure on the circuit breaker.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/12/2025
 * @Test Class        : [GitHubServiceTest]
 **/
public with sharing class GitHubService {
  /**
   * @description Thrown when GitHub cannot be read: a bad path, a non-200 status or a body
   *              that is not a commit list or a file.
   */
  public class GitHubServiceException extends Exception {
  }

  /**
   * @description One file read from the contents API.
   */
  public class FileContent {
    public String path;
    public String content;
    public String htmlUrl;
    public Integer size;
  }

  public static final String BRANCH = 'main';
  public static final Integer COMMIT_COUNT = 10;
  public static final Integer MESSAGE_MAX_LENGTH = 100;
  public static final Integer FILE_PATH_MAX_LENGTH = 255;

  /** owner/repository, each one GitHub name segment. */
  private static final Pattern REPO_PATH = Pattern.compile(
    '^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$'
  );

  /** A repository file path: name segments joined by slashes, no leading slash. */
  private static final Pattern FILE_PATH = Pattern.compile(
    '^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$'
  );

  /**
   * @description Calls GET /repos/{repo}/contents/{path} on main and decodes the file.
   * @param repoPath owner/repository, from Portfolio_Config__mdt.GitHub_Repo_Path__c.
   * @param filePath The file's path from the repository root.
   * @return FileContent The decoded text, the GitHub page link and the size in bytes.
   * @throws GitHubServiceException When a path is invalid, the status is not 200 or the
   *                                body is not a base64 file.
   * @example
   * GitHubService.FileContent file = GitHubService.fetchFile('owner/repo', 'README.md');
   */
  public static FileContent fetchFile(String repoPath, String filePath) {
    if (!isValidRepoPath(repoPath)) {
      throw new GitHubServiceException('Invalid repository path.');
    }
    if (!isValidFilePath(filePath)) {
      throw new GitHubServiceException('Invalid file path.');
    }
    HttpResponse response = new Http()
      .send(contentsRequest(repoPath.trim(), filePath.trim()));
    if (response.getStatusCode() != 200) {
      throw new GitHubServiceException('HTTP ' + response.getStatusCode());
    }
    return parseFile(response.getBody());
  }

  /**
   * @description Whether a file path is safe to put in the request path: name segments of
   *              letters, digits, dot, dash and underscore, and no "." or ".." segment.
   * @param filePath The configured path.
   * @return Boolean True for a path such as packages/a/b.js.
   */
  public static Boolean isValidFilePath(String filePath) {
    if (
      String.isBlank(filePath) ||
      filePath.trim().length() > FILE_PATH_MAX_LENGTH ||
      !FILE_PATH.matcher(filePath.trim()).matches()
    ) {
      return false;
    }
    for (String segment : filePath.trim().split('/')) {
      if (segment == '.' || segment == '..') {
        return false;
      }
    }
    return true;
  }

  private static HttpRequest contentsRequest(String repoPath, String filePath) {
    HttpRequest request = new HttpRequest();
    request.setEndpoint(
      'callout:GitHub_API/repos/' +
        repoPath +
        '/contents/' +
        filePath +
        '?ref=' +
        BRANCH
    );
    request.setMethod('GET');
    request.setHeader('Accept', 'application/vnd.github+json');
    request.setTimeout(20000);
    return request;
  }

  @TestVisible
  private static FileContent parseFile(String body) {
    Object parsed;
    try {
      parsed = JSON.deserializeUntyped(body);
    } catch (JSONException e) {
      throw new GitHubServiceException('Body is not JSON.', e);
    }
    Map<String, Object> root = mapOf(parsed);
    if (root == null || stringOf(root.get('type')) != 'file') {
      throw new GitHubServiceException('Body is not a file.');
    }
    if (stringOf(root.get('encoding')) != 'base64') {
      throw new GitHubServiceException('File is too large for the API.');
    }
    String encoded = stringOf(root.get('content'));
    FileContent file = new FileContent();
    file.path = stringOf(root.get('path'));
    file.htmlUrl = stringOf(root.get('html_url'));
    file.size = root.get('size') instanceof Integer
      ? (Integer) root.get('size')
      : null;
    try {
      file.content = String.isBlank(encoded)
        ? ''
        : EncodingUtil.base64Decode(encoded.replaceAll('\\s', '')).toString();
    } catch (Exception e) {
      throw new GitHubServiceException('File content is not base64 text.', e);
    }
    return file;
  }

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
