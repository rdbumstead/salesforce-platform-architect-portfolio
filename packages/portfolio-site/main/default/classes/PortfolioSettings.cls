/**
 * @description       : Reads operational values (page sizes, rate limits, refresh intervals)
 *                      from Portfolio_Setting__mdt, one record per value. Every caller passes
 *                      its own code default as the fallback, so the code still says what the
 *                      default is. A record that is missing, holds no value, or holds a number
 *                      outside its Min_Value__c to Max_Value__c range gives that fallback, so a
 *                      mistyped record never breaks a request. The records are read once per
 *                      transaction with getAll(), which runs no SOQL.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 * @Test Class        : [PortfolioSettingsTest]
 **/
public with sharing class PortfolioSettings {
  private static final Decimal INTEGER_MIN = -2147483648.0;
  private static final Decimal INTEGER_MAX = 2147483647.0;

  // Tests put a record here to set a value without deploying one. A key mapped to null
  // reads as a missing record.
  @TestVisible
  private static Map<String, Portfolio_Setting__mdt> overrides = new Map<String, Portfolio_Setting__mdt>();

  // How many times the records were loaded in this transaction. Tests read it.
  @TestVisible
  private static Integer loadCount = 0;

  private static Map<String, Portfolio_Setting__mdt> recordsByName;

  /**
   * @description A whole number setting. A decimal value is cut to its whole part.
   * @param developerName The record's DeveloperName, such as Api_Max_Page_Size.
   * @param fallback The code default, returned when the record is missing, empty or out of
   *                 range.
   * @return Integer The record's value, or the fallback.
   */
  public static Integer getInteger(String developerName, Integer fallback) {
    Decimal value = numberOf(developerName);
    if (value == null || value < INTEGER_MIN || value > INTEGER_MAX) {
      return fallback;
    }
    return value.intValue();
  }

  /**
   * @description A decimal setting.
   * @param developerName The record's DeveloperName.
   * @param fallback The code default, returned when the record is missing, empty or out of
   *                 range.
   * @return Decimal The record's value, or the fallback.
   */
  public static Decimal getDecimal(String developerName, Decimal fallback) {
    Decimal value = numberOf(developerName);
    return value == null ? fallback : value;
  }

  /**
   * @description A text setting. A blank value counts as empty.
   * @param developerName The record's DeveloperName.
   * @param fallback The code default, returned when the record is missing or blank.
   * @return String The record's text, or the fallback.
   */
  public static String getText(String developerName, String fallback) {
    Portfolio_Setting__mdt record = recordOf(developerName);
    if (record == null || String.isBlank(record.Text_Value__c)) {
      return fallback;
    }
    return record.Text_Value__c;
  }

  /**
   * @description Test helper: sets a number for one setting with no range, so a test can
   *              change a value without a record.
   * @param developerName The record's DeveloperName.
   * @param value The number the setting should read as.
   */
  @TestVisible
  private static void overrideNumber(String developerName, Decimal value) {
    overrides.put(
      developerName,
      new Portfolio_Setting__mdt(
        DeveloperName = developerName,
        Number_Value__c = value
      )
    );
  }

  // The record's number when it is set and inside its range, otherwise null.
  private static Decimal numberOf(String developerName) {
    Portfolio_Setting__mdt record = recordOf(developerName);
    Decimal value = record?.Number_Value__c;
    if (value == null) {
      return null;
    }
    if (record.Min_Value__c != null && value < record.Min_Value__c) {
      return null;
    }
    if (record.Max_Value__c != null && value > record.Max_Value__c) {
      return null;
    }
    return value;
  }

  private static Portfolio_Setting__mdt recordOf(String developerName) {
    if (String.isBlank(developerName)) {
      return null;
    }
    if (overrides.containsKey(developerName)) {
      return overrides.get(developerName);
    }
    return records().get(developerName);
  }

  private static Map<String, Portfolio_Setting__mdt> records() {
    if (recordsByName == null) {
      loadCount++;
      recordsByName = Portfolio_Setting__mdt.getAll();
    }
    return recordsByName;
  }
}
