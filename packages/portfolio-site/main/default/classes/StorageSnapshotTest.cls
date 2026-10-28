/**
 * @description       : Tests StorageSnapshot: the one stored record, when a snapshot is due,
 *                      what the site guest reads, and the traffic setting.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/27/2026
 * @Test Class        : n/a
 **/
@IsTest
private class StorageSnapshotTest {
  private static StorageSnapshot.Snapshot sample() {
    StorageSnapshot.Snapshot snapshot = new StorageSnapshot.Snapshot();
    snapshot.capturedAt = Datetime.now();
    snapshot.dataUsedMb = 1;
    snapshot.dataMaxMb = 5;
    snapshot.fileUsedMb = 5;
    snapshot.fileMaxMb = 20;
    StorageSnapshot.Area area = new StorageSnapshot.Area();
    area.label = 'Site content';
    area.records = 10;
    area.kb = 20;
    snapshot.dataAreas.add(area);
    StorageSnapshot.TrafficDay day = new StorageSnapshot.TrafficDay();
    day.day = Date.today();
    day.originPageViews = 12;
    day.cachePageViews = 30;
    snapshot.traffic.add(day);
    return snapshot;
  }

  @IsTest
  static void shouldReadNullWhenNothingIsStored() {
    Assert.isNull(StorageSnapshot.read(), 'No snapshot yet');
  }

  @IsTest
  static void shouldBeDueWhenNothingIsStored() {
    Assert.isTrue(StorageSnapshot.isDue(), 'The first run is always due');
  }

  @IsTest
  static void shouldKeepOneRecordWhenSavedTwice() {
    StorageSnapshot.save(sample());
    StorageSnapshot.Snapshot second = sample();
    second.dataUsedMb = 3;

    Test.startTest();
    StorageSnapshot.save(second);
    Test.stopTest();

    Assert.areEqual(
      1,
      [SELECT COUNT() FROM Storage_Snapshot__c],
      'The record is overwritten, not added'
    );
    Assert.areEqual(
      3,
      StorageSnapshot.read().dataUsedMb,
      'The newer figures are stored'
    );
  }

  @IsTest
  static void shouldNotBeDueRightAfterASave() {
    StorageSnapshot.save(sample());

    Assert.isFalse(StorageSnapshot.isDue(), 'A snapshot taken now is fresh');
  }

  @IsTest
  static void shouldBeDueWhenTheSnapshotIsOlderThanTheSetting() {
    PortfolioSettings.overrideNumber(StorageSnapshot.HOURS_SETTING, 2);
    StorageSnapshot.Snapshot old = sample();
    old.capturedAt = Datetime.now().addMinutes(-121);
    StorageSnapshot.save(old);

    Assert.isTrue(StorageSnapshot.isDue(), 'Two hours and a minute is stale');
  }

  @IsTest
  static void shouldNotBeDueInsideTheSettingsWindow() {
    PortfolioSettings.overrideNumber(StorageSnapshot.HOURS_SETTING, 2);
    StorageSnapshot.Snapshot recent = sample();
    recent.capturedAt = Datetime.now().addMinutes(-119);
    StorageSnapshot.save(recent);

    Assert.isFalse(StorageSnapshot.isDue(), 'Under two hours is fresh');
  }

  @IsTest
  static void shouldHideTrafficWhenTheSwitchIsOff() {
    StorageSnapshot.save(sample());

    StorageSnapshot.Snapshot read = StorageSnapshot.read();

    Assert.areEqual(
      1,
      read.dataAreas.size(),
      'The areas are returned: ' + JSON.serialize(read)
    );
    Assert.areEqual(
      0,
      read.traffic.size(),
      'Traffic stays stored, not returned'
    );
  }

  @IsTest
  static void shouldReturnTrafficWhenTheSwitchIsOn() {
    PortfolioSettings.overrideNumber(StorageSnapshot.TRAFFIC_SETTING, 1);
    StorageSnapshot.save(sample());

    StorageSnapshot.Snapshot read = StorageSnapshot.read();

    Assert.areEqual(1, read.traffic.size(), 'The switch lets traffic out');
    Assert.areEqual(12, read.traffic[0].originPageViews, 'Origin page views');
    Assert.areEqual(30, read.traffic[0].cachePageViews, 'Cache page views');
  }

  @IsTest
  static void shouldReadNullWhenThePayloadIsNotJson() {
    insert new Storage_Snapshot__c(
      Key__c = StorageSnapshot.RECORD_KEY,
      Captured_At__c = Datetime.now(),
      Payload__c = 'not json'
    );

    Assert.isNull(StorageSnapshot.read(), 'A bad payload reads as no snapshot');
  }

  @IsTest
  static void shouldLetTheSiteGuestReadTheStoredFigures() {
    StorageSnapshot.save(sample());
    User guest = SiteGuestTestSupport.preparedGuest();

    StorageSnapshot.Snapshot read;
    Test.startTest();
    System.runAs(guest) {
      read = StorageSnapshot.read();
    }
    Test.stopTest();

    Assert.isNotNull(read, 'The guest reads the snapshot through the class');
    Assert.areEqual(5, read.dataMaxMb, 'The guest sees the stored maximum');
  }
}
