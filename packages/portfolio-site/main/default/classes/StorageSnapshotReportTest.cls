/**
 * @description       : Runs the real Site_Usage_Last_30_Days report through
 *                      StorageSnapshotJob. Reports are not visible to a test without org
 *                      data, so this one class reads it with SeeAllData and does nothing
 *                      else. A scratch site has no usage rows, so the test expects none.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/27/2026
 * @Test Class        : n/a
 **/
@IsTest(SeeAllData=true)
private class StorageSnapshotReportTest {
  @IsTest
  static void shouldRunTheSavedReportAndReadItsRows() {
    Test.startTest();
    StorageSnapshot.Snapshot snapshot = StorageSnapshotJob.build();
    Test.stopTest();

    Assert.isNotNull(
      snapshot.traffic,
      'The report ran and its groupings were read'
    );
    for (StorageSnapshot.TrafficDay day : snapshot.traffic) {
      Assert.isNotNull(day.day, 'Every day entry has a date');
    }
  }
}
