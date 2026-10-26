/**
 * @description       : Unit tests for GitHubService: the commit mapping and its failures. The
 *                      refresh path end to end is in GitHubCacheRefreshJobTest.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
@IsTest
private class GitHubServiceTest {
  private class StatusMock implements HttpCalloutMock {
    private final Integer status;
    private final String body;

    StatusMock(Integer status, String body) {
      this.status = status;
      this.body = body;
    }

    public HttpResponse respond(HttpRequest request) {
      HttpResponse response = new HttpResponse();
      response.setStatusCode(status);
      response.setBody(body);
      return response;
    }
  }

  @IsTest
  static void shouldMapCommitsWhenGitHubAnswers() {
    Test.setMock(
      HttpCalloutMock.class,
      new StatusMock(
        200,
        '[{"sha":"123","html_url":"u","commit":{"message":"msg","author":{"name":"GitUser","date":"2023-01-01T00:00:00Z"}}}]'
      )
    );

    Test.startTest();
    List<DeliveryController.CommitItem> items = GitHubService.fetchRecentCommits(
      'test/repo'
    );
    Test.stopTest();

    Assert.areEqual(1, items.size(), 'One commit');
    Assert.areEqual('123', items[0].sha, 'sha');
    Assert.areEqual('GitUser', items[0].authorName, 'Git author name');
    Assert.areEqual(
      Datetime.newInstanceGmt(2023, 1, 1, 0, 0, 0),
      items[0].committedAt,
      'Date'
    );
  }

  @IsTest
  static void shouldThrowWithStatusWhenGitHubFails() {
    Test.setMock(HttpCalloutMock.class, new StatusMock(401, 'Unauthorized'));

    Test.startTest();
    try {
      GitHubService.fetchRecentCommits('test/repo');
      Assert.fail('A 401 must throw');
    } catch (GitHubService.GitHubServiceException e) {
      Assert.areEqual('HTTP 401', e.getMessage(), 'Status only');
    }
    Test.stopTest();
  }

  @IsTest
  static void shouldSkipNonObjectsWhenListHasOtherValues() {
    List<DeliveryController.CommitItem> items = GitHubService.parseCommits(
      '[1, {"sha":"abc"}]'
    );

    Assert.areEqual(1, items.size(), 'Only the commit object');
    Assert.isNull(items[0].message, 'No message');
  }

  @IsTest
  static void shouldLeaveOutMergeCommitsWhenAMessageHasTwoParents() {
    String body =
      '[' +
      '{"sha":"m1","commit":{"message":"Merge pull request #1"},"parents":[{"sha":"a"},{"sha":"b"}]},' +
      '{"sha":"c1","commit":{"message":"feat(lwc): one parent"},"parents":[{"sha":"a"}]},' +
      '{"sha":"c2","commit":{"message":"no parents list"}},' +
      '{"sha":"c3","commit":{"message":"empty parents"},"parents":[]}' +
      ']';

    List<DeliveryController.CommitItem> items = GitHubService.parseCommits(
      body
    );

    Assert.areEqual(3, items.size(), 'Only the merge is dropped');
    Assert.areEqual('c1', items[0].sha, 'Order kept');
    Assert.areEqual('c2', items[1].sha, 'No parents list is not a merge');
    Assert.areEqual('c3', items[2].sha, 'Empty parents is not a merge');
  }

  @IsTest
  static void shouldEndACutMessageWithAnEllipsisWithinTheLimit() {
    String longLine = 'word '.repeat(40);

    String cut = GitHubService.firstLine(longLine + '\nsecond line');

    Assert.areEqual(
      GitHubService.MESSAGE_MAX_LENGTH,
      cut.length(),
      'The ellipsis fits inside the limit'
    );
    Assert.isTrue(cut.endsWith(GitHubService.ELLIPSIS), 'Ends in an ellipsis');
    Assert.areEqual(1, GitHubService.ELLIPSIS.length(), 'One character');
  }

  @IsTest
  static void shouldKeepAShortOrExactLengthMessageWhole() {
    String exact = 'x'.repeat(GitHubService.MESSAGE_MAX_LENGTH);

    Assert.areEqual(exact, GitHubService.firstLine(exact), 'Exact length kept');
    Assert.areEqual(
      'short',
      GitHubService.firstLine(' short \nmore'),
      'Trimmed'
    );
    Assert.isNull(GitHubService.firstLine(null), 'Null stays null');
  }

  @IsTest
  static void shouldRejectPathsWhenNotOwnerSlashRepo() {
    Assert.isTrue(GitHubService.isValidRepoPath('owner/repo.name'), 'Valid');
    Assert.isFalse(GitHubService.isValidRepoPath('owner'), 'No repository');
    Assert.isFalse(GitHubService.isValidRepoPath('a/b/c'), 'Extra segment');
    Assert.isFalse(GitHubService.isValidRepoPath(null), 'Null');
  }

  private static String fileJson(String text) {
    return JSON.serialize(
      new Map<String, Object>{
        'type' => 'file',
        'encoding' => 'base64',
        'path' => 'a/b.js',
        'size' => 12,
        'html_url' => 'https://github.com/o/r/blob/main/a/b.js',
        // GitHub wraps base64 at 60 characters, so the decoder must drop line breaks.
        'content' => EncodingUtil.base64Encode(Blob.valueOf(text)) + '\n'
      }
    );
  }

  @IsTest
  static void shouldDecodeFileWhenContentsApiAnswers() {
    Test.setMock(
      HttpCalloutMock.class,
      new StatusMock(200, fileJson('const a = 1;'))
    );

    Test.startTest();
    GitHubService.FileContent file = GitHubService.fetchFile('o/r', 'a/b.js');
    Test.stopTest();

    Assert.areEqual('const a = 1;', file.content, 'Decoded text');
    Assert.areEqual('a/b.js', file.path, 'Path');
    Assert.areEqual(
      'https://github.com/o/r/blob/main/a/b.js',
      file.htmlUrl,
      'html_url'
    );
    Assert.areEqual(12, file.size, 'Size');
  }

  @IsTest
  static void shouldThrowWithStatusWhenFileIsMissing() {
    Test.setMock(HttpCalloutMock.class, new StatusMock(404, '{}'));

    Test.startTest();
    try {
      GitHubService.fetchFile('o/r', 'a/missing.js');
      Assert.fail('A 404 must throw');
    } catch (GitHubService.GitHubServiceException e) {
      Assert.areEqual('HTTP 404', e.getMessage(), 'Status only');
    }
    Test.stopTest();
  }

  @IsTest
  static void shouldThrowWhenFilePathIsUnsafe() {
    try {
      GitHubService.fetchFile('o/r', '../secrets');
      Assert.fail('A parent segment must throw');
    } catch (GitHubService.GitHubServiceException e) {
      Assert.areEqual('Invalid file path.', e.getMessage(), 'Path refused');
    }
  }

  @IsTest
  static void shouldThrowWhenRepoPathIsInvalidForAFile() {
    try {
      GitHubService.fetchFile('not a repo', 'a/b.js');
      Assert.fail('A bad repository must throw');
    } catch (GitHubService.GitHubServiceException e) {
      Assert.areEqual('Invalid repository path.', e.getMessage(), 'Refused');
    }
  }

  @IsTest
  static void shouldValidateFilePathsWhenChecked() {
    Assert.isTrue(
      GitHubService.isValidFilePath('packages/a-b/c_d/E.cls'),
      'Valid'
    );
    Assert.isFalse(GitHubService.isValidFilePath('/a/b.js'), 'Leading slash');
    Assert.isFalse(GitHubService.isValidFilePath('a//b.js'), 'Empty segment');
    Assert.isFalse(GitHubService.isValidFilePath('a/./b.js'), 'Dot segment');
    Assert.isFalse(GitHubService.isValidFilePath('a/b c.js'), 'Space');
    Assert.isFalse(GitHubService.isValidFilePath('a?b=1'), 'Query');
    Assert.isFalse(GitHubService.isValidFilePath(null), 'Null');
    Assert.isFalse(
      GitHubService.isValidFilePath('a/' + 'b'.repeat(255)),
      'Too long'
    );
  }

  @IsTest
  static void shouldThrowWhenBodyIsADirectory() {
    try {
      GitHubService.parseFile('[{"type":"file"}]');
      Assert.fail('A directory listing must throw');
    } catch (GitHubService.GitHubServiceException e) {
      Assert.areEqual('Body is not a file.', e.getMessage(), 'Not a file');
    }
  }

  @IsTest
  static void shouldThrowWhenFileIsTooLargeForTheApi() {
    try {
      GitHubService.parseFile('{"type":"file","encoding":"none","content":""}');
      Assert.fail('No content must throw');
    } catch (GitHubService.GitHubServiceException e) {
      Assert.areEqual(
        'File is too large for the API.',
        e.getMessage(),
        'Too large'
      );
    }
  }

  @IsTest
  static void shouldThrowWhenFileBodyIsNotJson() {
    try {
      GitHubService.parseFile('not json');
      Assert.fail('Must throw');
    } catch (GitHubService.GitHubServiceException e) {
      Assert.areEqual('Body is not JSON.', e.getMessage(), 'Not JSON');
    }
  }

  @IsTest
  static void shouldReturnEmptyTextWhenFileIsEmpty() {
    GitHubService.FileContent file = GitHubService.parseFile(
      '{"type":"file","encoding":"base64","content":"","path":"a.txt"}'
    );

    Assert.areEqual('', file.content, 'Empty file');
    Assert.isNull(file.size, 'No size given');
  }
}
