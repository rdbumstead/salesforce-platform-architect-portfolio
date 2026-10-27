/**
 * @description       : Tests for FooterController. getLinks never returns the
 *                      owner email or phone. The AI request aggregate returns only a
 *                      number, counts only today's papi-ai windows, and sees every caller's rows
 *                      when run as the real Portfolio1 site guest.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
@isTest
private class FooterControllerTest {
  private static final String GITHUB_URL = 'https://github.com/example-owner';
  private static final String LINKEDIN_URL = 'https://www.linkedin.com/in/example-owner';
  private static final Integer AI_TODAY_FIRST = 3;
  private static final Integer AI_TODAY_SECOND = 4;

  private static Portfolio_Config__mdt configWithContactDetails() {
    return new Portfolio_Config__mdt(
      GitHub_Profile_URL__c = GITHUB_URL,
      LinkedIn_URL__c = LINKEDIN_URL,
      Owner_Email__c = SiteGuestTestSupport.OWNER_EMAIL,
      Owner_Phone__c = SiteGuestTestSupport.OWNER_PHONE
    );
  }

  private static API_Rate_Window__c window(
    String callerKey,
    Datetime windowStart,
    Integer count
  ) {
    return new API_Rate_Window__c(
      Key__c = callerKey + '|' + windowStart.formatGmt('yyyyMMddHHmm'),
      Window_Start__c = windowStart,
      Count__c = count
    );
  }

  /** Two papi-ai windows today, plus rows that must not be counted. */
  private static void insertWindows() {
    Datetime now = Datetime.now();
    insert new List<API_Rate_Window__c>{
      window('papi-ai:caller-one', now, AI_TODAY_FIRST),
      window('papi-ai:caller-two', now, AI_TODAY_SECOND),
      window('papi:caller-one', now, 9),
      window('sapi:caller-one', now, 5),
      window('testimonial-submit', now, 2),
      window('papi-ai:caller-one', now.addDays(-1), 7)
    };
  }

  @isTest
  static void getLinksReturnsTheTwoProfileUrls() {
    FooterController.configOverride = configWithContactDetails();

    Test.startTest();
    FooterController.FooterLinks links = FooterController.getLinks();
    Test.stopTest();

    Assert.areEqual(GITHUB_URL, links.gitHubUrl, 'GitHub URL from the config');
    Assert.areEqual(
      LINKEDIN_URL,
      links.linkedInUrl,
      'LinkedIn URL from the config'
    );
  }

  @isTest
  static void getLinksNeverReturnsEmailOrPhone() {
    FooterController.configOverride = configWithContactDetails();

    Test.startTest();
    String payload = JSON.serialize(FooterController.getLinks());
    Test.stopTest();

    Map<String, Object> fields = (Map<String, Object>) JSON.deserializeUntyped(
      payload
    );
    Assert.areEqual(
      new Set<String>{ 'gitHubUrl', 'linkedInUrl' },
      fields.keySet(),
      'Only the two link fields are returned'
    );
    Assert.isFalse(
      payload.contains(SiteGuestTestSupport.OWNER_EMAIL),
      'The owner email never reaches the payload'
    );
    Assert.isFalse(
      payload.contains(SiteGuestTestSupport.OWNER_PHONE),
      'The owner phone never reaches the payload'
    );
  }

  @isTest
  static void getLinksReadsTheFirstConfigRecordByDeveloperName() {
    Portfolio_Config__mdt expected;
    for (
      Portfolio_Config__mdt record : Portfolio_Config__mdt.getAll().values()
    ) {
      if (
        expected == null ||
        record.DeveloperName.compareTo(expected.DeveloperName) < 0
      ) {
        expected = record;
      }
    }

    Test.startTest();
    FooterController.FooterLinks links = FooterController.getLinks();
    Test.stopTest();

    Assert.areEqual(
      expected?.GitHub_Profile_URL__c,
      links.gitHubUrl,
      'GitHub URL matches the org record, null when the org has none'
    );
    Assert.areEqual(
      expected?.LinkedIn_URL__c,
      links.linkedInUrl,
      'LinkedIn URL matches the org record, null when the org has none'
    );
  }

  private static Portfolio_Config__mdt namedConfig(String developerName) {
    return new Portfolio_Config__mdt(
      DeveloperName = developerName,
      GitHub_Profile_URL__c = 'https://github.com/' + developerName
    );
  }

  @isTest
  static void firstByNamePicksTheFirstDeveloperNameFromUnorderedRecords() {
    List<Portfolio_Config__mdt> records = new List<Portfolio_Config__mdt>{
      namedConfig('Zulu_Config'),
      namedConfig('Alpha_Config'),
      namedConfig('Mike_Config')
    };

    Test.startTest();
    Portfolio_Config__mdt first = FooterController.firstByName(records);
    Test.stopTest();

    Assert.areEqual(
      'Alpha_Config',
      first.DeveloperName,
      'The record that sorts first by DeveloperName wins'
    );
  }

  @isTest
  static void firstByNameReturnsTheOnlyRecord() {
    Portfolio_Config__mdt only = namedConfig('Only_Config');

    Test.startTest();
    Portfolio_Config__mdt first = FooterController.firstByName(
      new List<Portfolio_Config__mdt>{ only }
    );
    Test.stopTest();

    Assert.areEqual(
      'Only_Config',
      first.DeveloperName,
      'A single record is returned'
    );
  }

  @isTest
  static void firstByNameReturnsNullForNoRecords() {
    Test.startTest();
    Portfolio_Config__mdt fromEmpty = FooterController.firstByName(
      new List<Portfolio_Config__mdt>()
    );
    Portfolio_Config__mdt fromNull = FooterController.firstByName(null);
    Test.stopTest();

    Assert.isNull(fromEmpty, 'An empty list gives null');
    Assert.isNull(fromNull, 'A null list gives null');
  }

  @isTest
  static void getSystemSnapshotCountsOnlyTodaysAiTierWindows() {
    insertWindows();

    Test.startTest();
    FooterController.SystemSnapshot snapshot = FooterController.getSystemSnapshot();
    Test.stopTest();

    Assert.areEqual(
      AI_TODAY_FIRST + AI_TODAY_SECOND,
      snapshot.aiRequestsToday,
      'Sum of today papi-ai windows only'
    );
  }

  @isTest
  static void aLetterTheApiAlsoCountedCountsOnce() {
    // One site letter through the API: the visitor's own count, the API's count on its
    // session key, and the marker ApiLabController adds when the API counted it.
    Datetime now = Datetime.now();
    insert new List<API_Rate_Window__c>{
      window(ApiLabController.AI_RATE_KEY, now, 1),
      window('papi-ai:integration-session', now, 1),
      window(ApiLabController.PROXIED_RATE_KEY, now, 1)
    };

    Test.startTest();
    FooterController.SystemSnapshot snapshot = FooterController.getSystemSnapshot();
    Test.stopTest();

    Assert.areEqual(1, snapshot.aiRequestsToday, 'One letter, one request');
  }

  @isTest
  static void aMarkerFromYesterdayIsNotTakenOffToday() {
    insertWindows();
    insert window(
      ApiLabController.PROXIED_RATE_KEY,
      Datetime.now().addDays(-1),
      5
    );

    Test.startTest();
    FooterController.SystemSnapshot snapshot = FooterController.getSystemSnapshot();
    Test.stopTest();

    Assert.areEqual(
      AI_TODAY_FIRST + AI_TODAY_SECOND,
      snapshot.aiRequestsToday,
      'Only markers from today count'
    );
  }

  @isTest
  static void theCountNeverGoesBelowZero() {
    insert window(ApiLabController.PROXIED_RATE_KEY, Datetime.now(), 3);

    Test.startTest();
    FooterController.SystemSnapshot snapshot = FooterController.getSystemSnapshot();
    Test.stopTest();

    Assert.areEqual(0, snapshot.aiRequestsToday, 'Never negative');
  }

  @isTest
  static void getSystemSnapshotReturnsZeroWhenNoWindowsExist() {
    Test.startTest();
    FooterController.SystemSnapshot snapshot = FooterController.getSystemSnapshot();
    Test.stopTest();

    Assert.areEqual(
      0,
      snapshot.aiRequestsToday,
      'No rows means zero, not null'
    );
  }

  @isTest
  static void getSystemSnapshotAggregateReturnsANumberAndNoRowData() {
    insertWindows();

    Test.startTest();
    FooterController.SystemSnapshot snapshot = FooterController.getSystemSnapshot();
    Test.stopTest();

    Object count = snapshot.aiRequestsToday;
    Assert.isInstanceOfType(count, Integer.class, 'The count is a number');
    String payload = JSON.serialize(snapshot);
    Assert.isFalse(
      payload.contains('caller-'),
      'No caller key reaches the payload'
    );
    Assert.isFalse(
      payload.contains('papi-ai'),
      'No rate key reaches the payload'
    );
  }

  @isTest
  static void getSystemSnapshotGuestCountsEveryCallersRows() {
    insertWindows();
    User guest = SiteGuestTestSupport.preparedGuest();

    FooterController.SystemSnapshot snapshot;
    Test.startTest();
    System.runAs(guest) {
      snapshot = FooterController.getSystemSnapshot();
    }
    Test.stopTest();

    Assert.areEqual(
      AI_TODAY_FIRST + AI_TODAY_SECOND,
      snapshot.aiRequestsToday,
      'The guest sees the total of rows it does not own'
    );
  }

  @isTest
  static void getSystemSnapshotReturnsProviderStatusAsIs() {
    List<ContentGenerationController.ProviderStatus> expected = ContentGenerationController.providerStatus();

    Test.startTest();
    FooterController.SystemSnapshot snapshot = FooterController.getSystemSnapshot();
    Test.stopTest();

    Assert.areEqual(
      JSON.serialize(expected),
      JSON.serialize(snapshot.providers),
      'Provider rows are passed through unchanged'
    );
  }

  @isTest
  static void getSystemSnapshotReportsLimitsAgainstTheirCeilings() {
    Test.startTest();
    FooterController.SystemSnapshot snapshot = FooterController.getSystemSnapshot();
    Test.stopTest();

    Assert.areEqual(
      Limits.getLimitCpuTime(),
      snapshot.cpuTimeLimitMs,
      'CPU limit'
    );
    Assert.areEqual(
      Limits.getLimitHeapSize(),
      snapshot.heapLimitBytes,
      'Heap limit'
    );
    Assert.areEqual(
      Limits.getLimitQueries(),
      snapshot.soqlQueryLimit,
      'SOQL limit'
    );
    Assert.isTrue(snapshot.soqlQueries >= 1, 'The aggregate query is counted');
    Assert.isTrue(snapshot.heapBytes > 0, 'Heap in use is reported');
    Assert.isNotNull(snapshot.cpuTimeMs, 'CPU time is reported');
  }

  @isTest
  static void getSystemSnapshotFailureThrowsAuraHandledException() {
    FooterController.throwException = true;

    Test.startTest();
    try {
      FooterController.getSystemSnapshot();
      Assert.fail('Expected an AuraHandledException');
    } catch (AuraHandledException e) {
      Assert.isNotNull(e, 'The failure surfaces as an AuraHandledException');
    }
    Test.stopTest();
  }

  @isTest
  static void getSystemSnapshotReportsTheOrgQuotasFromOrgLimits() {
    Map<String, System.OrgLimit> expected = OrgLimits.getMap();

    Test.startTest();
    FooterController.SystemSnapshot snapshot = FooterController.getSystemSnapshot();
    Test.stopTest();

    Assert.areEqual(
      FooterController.QUOTA_NAMES.size(),
      snapshot.orgQuotas.size(),
      'Every named quota is reported in this org'
    );
    for (Integer i = 0; i < snapshot.orgQuotas.size(); i++) {
      FooterController.OrgQuota quota = snapshot.orgQuotas[i];
      Assert.areEqual(
        FooterController.QUOTA_NAMES[i],
        quota.name,
        'Quotas keep their order'
      );
      Assert.areEqual(
        expected.get(quota.name).getLimit(),
        quota.max,
        'The ceiling comes from OrgLimits for ' + quota.name
      );
      Assert.isTrue(quota.used >= 0, 'Usage is a real count for ' + quota.name);
      Assert.isFalse(String.isBlank(quota.label), 'Every quota has a label');
    }
  }

  @isTest
  static void getSystemSnapshotGuestReadsTheOrgQuotas() {
    User guest = SiteGuestTestSupport.preparedGuest();

    FooterController.SystemSnapshot snapshot;
    Test.startTest();
    System.runAs(guest) {
      snapshot = FooterController.getSystemSnapshot();
    }
    Test.stopTest();

    Assert.areEqual(
      FooterController.QUOTA_NAMES.size(),
      snapshot.orgQuotas.size(),
      'The site guest can read the org quotas, got ' +
      JSON.serialize(snapshot.orgQuotas)
    );
    Assert.areEqual(
      2,
      snapshot.integrations.size(),
      'The site guest can read the GitHub and Jira breakers'
    );
  }

  @isTest
  static void getSystemSnapshotReturnsNoStorageBeforeTheFirstSnapshot() {
    Test.startTest();
    FooterController.SystemSnapshot snapshot = FooterController.getSystemSnapshot();
    Test.stopTest();

    Assert.isNull(snapshot.storage, 'Nothing stored, nothing made up');
  }

  @isTest
  static void getSystemSnapshotGuestReadsTheStoredStorage() {
    StorageSnapshot.save(StorageSnapshotJob.build());
    User guest = SiteGuestTestSupport.preparedGuest();

    FooterController.SystemSnapshot snapshot;
    Test.startTest();
    System.runAs(guest) {
      snapshot = FooterController.getSystemSnapshot();
    }
    Test.stopTest();

    Assert.isNotNull(snapshot.storage, 'The guest reads the stored snapshot');
    Assert.areEqual(
      StorageSnapshotJob.AREA_DEFINITIONS.size(),
      snapshot.storage.dataAreas.size(),
      'The areas come through'
    );
    Assert.areEqual(
      0,
      snapshot.storage.traffic.size(),
      'Traffic stays behind the switch'
    );
  }

  @isTest
  static void getSystemSnapshotKeepsTheRestWhenTheStorageReadFails() {
    FooterController.throwOnStorage = true;

    Test.startTest();
    FooterController.SystemSnapshot snapshot = FooterController.getSystemSnapshot();
    Test.stopTest();

    Assert.isNull(snapshot.storage, 'A failed storage read is left out');
    Assert.isNotNull(
      snapshot.integrations,
      'The rest of the snapshot is intact'
    );
  }

  @isTest
  static void orgQuotasLeavesOutAQuotaTheOrgDoesNotReport() {
    FooterController.orgLimitsOverride = new Map<String, System.OrgLimit>();

    Test.startTest();
    List<FooterController.OrgQuota> quotas = FooterController.orgQuotas();
    Test.stopTest();

    Assert.areEqual(0, quotas.size(), 'No quota is made up');
  }

  @isTest
  static void orgQuotasIsEmptyWhenOrgLimitsCannotBeRead() {
    FooterController.throwOnOrgLimits = true;

    Test.startTest();
    FooterController.SystemSnapshot snapshot = FooterController.getSystemSnapshot();
    Test.stopTest();

    Assert.areEqual(
      0,
      snapshot.orgQuotas.size(),
      'A failed read shows no quota instead of a broken number'
    );
    Assert.isNotNull(
      snapshot.providers,
      'The rest of the snapshot still loads'
    );
  }

  @isTest
  static void getSystemSnapshotReportsClosedBreakersWhenNoRowExists() {
    Test.startTest();
    FooterController.SystemSnapshot snapshot = FooterController.getSystemSnapshot();
    Test.stopTest();

    Assert.areEqual(2, snapshot.integrations.size(), 'GitHub and Jira');
    Assert.areEqual('github', snapshot.integrations[0].key, 'GitHub first');
    Assert.areEqual('GitHub', snapshot.integrations[0].label, 'GitHub label');
    Assert.areEqual('jira', snapshot.integrations[1].key, 'Jira second');
    Assert.areEqual('Jira', snapshot.integrations[1].label, 'Jira label');
    for (FooterController.IntegrationState state : snapshot.integrations) {
      Assert.isFalse(state.open, state.key + ' is closed');
      Assert.isNull(state.openUntil, state.key + ' has no reopen time');
    }
  }

  @isTest
  static void getSystemSnapshotReportsAnOpenJiraBreaker() {
    Datetime openUntil = Datetime.now().addMinutes(20);
    insert new Circuit_Breaker_State__c(
      Name = CircuitBreaker.KEY_JIRA,
      Consecutive_Failures__c = CircuitBreaker.FAILURE_THRESHOLD,
      Open_Until__c = openUntil
    );

    Test.startTest();
    FooterController.SystemSnapshot snapshot = FooterController.getSystemSnapshot();
    Test.stopTest();

    FooterController.IntegrationState jira = snapshot.integrations[1];
    Assert.isTrue(jira.open, 'The Jira breaker is open');
    Assert.areEqual(openUntil, jira.openUntil, 'It reopens at the stored time');
    Assert.isFalse(snapshot.integrations[0].open, 'GitHub stays closed');
  }
}
