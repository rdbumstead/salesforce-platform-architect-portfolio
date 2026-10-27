/**
 * @description       : Tests StorageSnapshotJob: the area counts, the file kinds, the
 *                      traffic sums, the report read when no report is visible, and the
 *                      queueable run that writes the stored record.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/27/2026
 * @Test Class        : n/a
 **/
@IsTest
private class StorageSnapshotJobTest {
  private static StorageSnapshot.Area areaNamed(
    List<StorageSnapshot.Area> areas,
    String label
  ) {
    for (StorageSnapshot.Area area : areas) {
      if (area.label == label) {
        return area;
      }
    }
    return null;
  }

  @IsTest
  static void shouldCountRecordsByAreaAtTwoKbEach() {
    insert new List<Lead>{
      new Lead(LastName = 'One', Company = 'A'),
      new Lead(LastName = 'Two', Company = 'B'),
      new Lead(LastName = 'Three', Company = 'C')
    };

    Test.startTest();
    List<StorageSnapshot.Area> areas = StorageSnapshotJob.dataAreas();
    Test.stopTest();

    Assert.areEqual(
      StorageSnapshotJob.AREA_DEFINITIONS.size(),
      areas.size(),
      'One entry per area'
    );
    StorageSnapshot.Area contact = areaNamed(areas, 'Contact and testimonials');
    Assert.areEqual(3, contact.records, 'Three leads and no other rows');
    Assert.areEqual(
      3 * StorageSnapshotJob.KB_PER_RECORD,
      contact.kb,
      'Records times 2 KB'
    );
  }

  @IsTest
  static void shouldNameNoObjectInTheAreas() {
    List<StorageSnapshot.Area> areas = StorageSnapshotJob.dataAreas();

    for (StorageSnapshot.Area area : areas) {
      Assert.isFalse(
        area.label.endsWith('__c') || area.label == 'Lead',
        'No object gets its own row, got ' + area.label
      );
    }
  }

  @IsTest
  static void shouldGroupFilesByKindLargestFirst() {
    ContentVersion image = new ContentVersion(
      Title = 'photo',
      PathOnClient = 'photo.png',
      VersionData = Blob.valueOf('x'.repeat(4096))
    );
    ContentVersion pdf = new ContentVersion(
      Title = 'doc',
      PathOnClient = 'doc.pdf',
      VersionData = Blob.valueOf('y'.repeat(2048))
    );
    ContentVersion other = new ContentVersion(
      Title = 'data',
      PathOnClient = 'data.bin',
      VersionData = Blob.valueOf('z'.repeat(1024))
    );
    insert new List<ContentVersion>{ image, pdf, other };

    List<StorageSnapshot.Area> kinds = StorageSnapshotJob.fileGroups();

    Assert.areEqual(3, kinds.size(), 'Three kinds: ' + JSON.serialize(kinds));
    Assert.areEqual('Images', kinds[0].label, 'Largest first');
    Assert.areEqual(4, kinds[0].kb, 'Four KB of images');
    Assert.areEqual('PDFs and text', kinds[1].label, 'Then the PDFs');
    Assert.areEqual(
      StorageSnapshotJob.FILES_OTHER,
      kinds[2].label,
      'Then the rest'
    );
  }

  @IsTest
  static void shouldCountDocumentsAsAttachedFiles() {
    insert new Document(
      Name = 'old',
      FolderId = UserInfo.getUserId(),
      Body = Blob.valueOf('d'.repeat(3072))
    );

    List<StorageSnapshot.Area> kinds = StorageSnapshotJob.fileGroups();

    StorageSnapshot.Area attached = areaNamed(
      kinds,
      StorageSnapshotJob.FILES_ATTACHED
    );
    Assert.isNotNull(attached, 'The document is counted');
    Assert.areEqual(3, attached.kb, 'Three KB');
  }

  @IsTest
  static void shouldReturnNoFileGroupsWhenThereAreNoFiles() {
    Assert.areEqual(
      0,
      StorageSnapshotJob.fileGroups().size(),
      'Empty kinds are left out'
    );
  }

  @IsTest
  static void shouldSumTrafficByDayNewestFirstForSevenDays() {
    Date today = Date.newInstance(2026, 10, 27);
    List<StorageSnapshotJob.TrafficRow> rows = new List<StorageSnapshotJob.TrafficRow>{
      new StorageSnapshotJob.TrafficRow('Origin Page Views', today, 10),
      new StorageSnapshotJob.TrafficRow('Cache Page Views', today, 40),
      new StorageSnapshotJob.TrafficRow('Origin Page Views', today, 5),
      new StorageSnapshotJob.TrafficRow('Origin Bandwidth', today, 2000),
      new StorageSnapshotJob.TrafficRow('Cache Bandwidth', today, 9000),
      new StorageSnapshotJob.TrafficRow('Request Time', today, 77),
      new StorageSnapshotJob.TrafficRow(
        'Origin Page Views',
        today.addDays(-3),
        7
      ),
      new StorageSnapshotJob.TrafficRow(
        'Origin Page Views',
        today.addDays(-7),
        99
      ),
      new StorageSnapshotJob.TrafficRow(
        'Origin Page Views',
        today.addDays(1),
        99
      ),
      new StorageSnapshotJob.TrafficRow('Origin Page Views', null, 99),
      new StorageSnapshotJob.TrafficRow('Origin Page Views', today, null)
    };

    List<StorageSnapshot.TrafficDay> days = StorageSnapshotJob.traffic(
      rows,
      today
    );

    Assert.areEqual(2, days.size(), 'Seven days back and no future day');
    Assert.areEqual(today, days[0].day, 'Newest first');
    Assert.areEqual(15, days[0].originPageViews, 'Origin page views summed');
    Assert.areEqual(40, days[0].cachePageViews, 'Cache page views');
    Assert.areEqual(2000, days[0].originBandwidth, 'Origin bandwidth');
    Assert.areEqual(9000, days[0].cacheBandwidth, 'Cache bandwidth');
    Assert.areEqual(7, days[1].originPageViews, 'Three days back');
  }

  @IsTest
  static void shouldReturnNoTrafficForNoRows() {
    Assert.areEqual(
      0,
      StorageSnapshotJob.traffic(
          new List<StorageSnapshotJob.TrafficRow>(),
          Date.today()
        )
        .size(),
      'Nothing in, nothing out'
    );
  }

  @IsTest
  static void shouldBuildWithNoTrafficWhenNoReportIsVisible() {
    StorageSnapshot.Snapshot snapshot = StorageSnapshotJob.build();

    Assert.areEqual(
      0,
      snapshot.traffic.size(),
      'A test without org data cannot see the report, so no rows'
    );
    Assert.isNotNull(snapshot.capturedAt, 'The time is stamped');
    Assert.isNotNull(
      snapshot.dataMaxMb,
      'The data maximum comes from OrgLimits'
    );
    Assert.isNotNull(
      snapshot.fileMaxMb,
      'The file maximum comes from OrgLimits'
    );
  }

  @IsTest
  static void shouldLeaveTotalsEmptyWhenOrgLimitsCannotBeRead() {
    StorageSnapshotJob.orgLimitsOverride = new Map<String, System.OrgLimit>();

    StorageSnapshot.Snapshot snapshot = StorageSnapshotJob.build();

    Assert.isNull(snapshot.dataUsedMb, 'No made up data figure');
    Assert.isNull(snapshot.fileMaxMb, 'No made up file figure');
    Assert.areEqual(
      StorageSnapshotJob.AREA_DEFINITIONS.size(),
      snapshot.dataAreas.size(),
      'The areas still come through'
    );
  }

  @IsTest
  static void shouldWriteOneRecordWhenTheQueueableRuns() {
    StorageSnapshotJob.trafficRowsOverride = new List<StorageSnapshotJob.TrafficRow>{
      new StorageSnapshotJob.TrafficRow('Origin Page Views', Date.today(), 4)
    };

    Test.startTest();
    System.enqueueJob(new StorageSnapshotJob());
    Test.stopTest();

    Assert.areEqual(
      1,
      [SELECT COUNT() FROM Storage_Snapshot__c],
      'The job wrote the one record'
    );
    PortfolioSettings.overrideNumber(StorageSnapshot.TRAFFIC_SETTING, 1);
    StorageSnapshot.Snapshot read = StorageSnapshot.read();
    Assert.areEqual(4, read.traffic[0].originPageViews, 'Traffic was stored');
    Assert.isFalse(StorageSnapshot.isDue(), 'The snapshot is now fresh');
  }

  @IsTest
  static void shouldKeepTheLastSnapshotWhenARefreshFails() {
    StorageSnapshot.Snapshot good = StorageSnapshotJob.build();
    good.dataUsedMb = 42;
    StorageSnapshot.save(good);
    StorageSnapshotJob.throwOnBuild = true;

    Boolean saved = StorageSnapshotJob.refresh();

    Assert.isFalse(saved, 'A failed build saves nothing');
    Assert.areEqual(
      42,
      StorageSnapshot.read().dataUsedMb,
      'The last good snapshot stays'
    );
  }
}
