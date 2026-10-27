/**
 * @description       : The storage figures the footer's storage panel shows, and the one record
 *                      that holds them. StorageSnapshotJob builds a Snapshot and save() writes
 *                      it to the single Storage_Snapshot__c row, overwriting the last one.
 *                      FooterController.getSystemSnapshot() calls read(), which returns the
 *                      stored figures to any caller, the site guest included. The guest has
 *                      no access to the object, so a without sharing inner class reads it,
 *                      and only the aggregates in the payload leave, never a row. The
 *                      site usage readings leave read() only when the
 *                      Footer_Site_Traffic_Visible setting is 1.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/27/2026
 * @Test Class        : [StorageSnapshotTest]
 **/
public with sharing class StorageSnapshot {
  /** Key__c of the one record. */
  public static final String RECORD_KEY = 'current';
  /** Portfolio_Setting__mdt names. */
  public static final String HOURS_SETTING = 'Storage_Snapshot_Hours';
  public static final String TRAFFIC_SETTING = 'Footer_Site_Traffic_Visible';
  /** Hours between snapshots when the setting is missing. */
  public static final Integer DEFAULT_HOURS = 1;

  /**
   * @description One line of a breakdown: an area of the site's data, or a kind of file.
   *              Data areas carry a record count and an estimate, file groups carry a size.
   */
  public class Area {
    @AuraEnabled
    public String label;
    /** Records in the area, null for a file group. */
    @AuraEnabled
    public Integer records;
    /** Kilobytes. For data areas it is the record count times 2 KB, an estimate. */
    @AuraEnabled
    public Integer kb;
  }

  /**
   * @description One day of site usage, summed over the org's sites. Bandwidth keeps the
   *              report's own unit, page views are counts.
   */
  public class TrafficDay {
    @AuraEnabled
    public Date day;
    @AuraEnabled
    public Decimal originBandwidth = 0;
    @AuraEnabled
    public Decimal cacheBandwidth = 0;
    @AuraEnabled
    public Decimal originPageViews = 0;
    @AuraEnabled
    public Decimal cachePageViews = 0;
  }

  /**
   * @description Everything the storage panel shows. Aggregates only.
   */
  public class Snapshot {
    @AuraEnabled
    public Datetime capturedAt;
    @AuraEnabled
    public Decimal dataUsedMb;
    @AuraEnabled
    public Decimal dataMaxMb;
    @AuraEnabled
    public Decimal fileUsedMb;
    @AuraEnabled
    public Decimal fileMaxMb;
    @AuraEnabled
    public List<Area> dataAreas = new List<Area>();
    @AuraEnabled
    public List<Area> fileGroups = new List<Area>();
    /** The last seven days, newest first. Empty unless the traffic setting is on. */
    @AuraEnabled
    public List<TrafficDay> traffic = new List<TrafficDay>();
  }

  /**
   * @description The stored snapshot, or null when the job has not written one or the
   *              payload cannot be read. The traffic list is emptied unless the
   *              Footer_Site_Traffic_Visible setting is 1.
   * @return Snapshot The stored figures, or null.
   */
  public static Snapshot read() {
    Storage_Snapshot__c row = stored();
    if (row == null || String.isBlank(row.Payload__c)) {
      return null;
    }
    Snapshot snapshot;
    try {
      snapshot = (Snapshot) JSON.deserialize(row.Payload__c, Snapshot.class);
    } catch (JSONException e) {
      return null;
    }
    snapshot.capturedAt = row.Captured_At__c;
    if (PortfolioSettings.getInteger(TRAFFIC_SETTING, 0) != 1) {
      snapshot.traffic = new List<TrafficDay>();
    }
    return snapshot;
  }

  /**
   * @description True when no snapshot exists or the last one is older than the
   *              Storage_Snapshot_Hours setting.
   * @return Boolean Whether StorageSnapshotJob should run now.
   */
  public static Boolean isDue() {
    Storage_Snapshot__c row = stored();
    if (row == null || row.Captured_At__c == null) {
      return true;
    }
    Integer hours = PortfolioSettings.getInteger(HOURS_SETTING, DEFAULT_HOURS);
    Datetime nextDue = row.Captured_At__c.addHours(Math.max(1, hours));
    return Datetime.now() >= nextDue;
  }

  /**
   * @description Writes the snapshot to the one record, replacing the last one.
   * @param snapshot The figures to store.
   */
  public static void save(Snapshot snapshot) {
    Storage_Snapshot__c row = new Storage_Snapshot__c(
      Key__c = RECORD_KEY,
      Captured_At__c = snapshot.capturedAt,
      Payload__c = JSON.serialize(snapshot)
    );
    new Store().write(row);
  }

  private static Storage_Snapshot__c stored() {
    return new Store().current();
  }

  /**
   * Without sharing on purpose: the object is admin only and the footer reads it for the site
   * guest, who has no access to it. System mode alone still applies the enclosing class's
   * sharing, so the class that reads and writes the one record is without sharing. It hands
   * one row to StorageSnapshot and nothing else.
   */
  private without sharing class Store {
    public Storage_Snapshot__c current() {
      List<Storage_Snapshot__c> rows = [
        SELECT Captured_At__c, Payload__c
        FROM Storage_Snapshot__c
        WHERE Key__c = :RECORD_KEY
        WITH SYSTEM_MODE
        LIMIT 1
      ];
      return rows.isEmpty() ? null : rows[0];
    }

    public void write(Storage_Snapshot__c row) {
      Database.upsert(row, Storage_Snapshot__c.Key__c, AccessLevel.SYSTEM_MODE);
    }
  }
}
