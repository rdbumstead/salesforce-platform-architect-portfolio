/**
 * @description       : Checks the SAPI reads against their Query_Definition__mdt records: every
 *                      deployed record passes QueryDefinitions.validateAll(), every SAPI code
 *                      default has an active record, and each record ships equal to its code
 *                      default, so a deploy changes nothing until a record is edited.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/24/2026
 **/
@IsTest
private class SAPIQueryDefinitionsTest {
  // Every SAPI class that reads content, one instance each.
  private static List<QueryDefinitions.Provider> sapiProviders() {
    return new List<QueryDefinitions.Provider>{
      new SAPIAccount(),
      new SAPICertification(),
      new SAPICertificationSkill(),
      new SAPIContact(),
      new SAPIEducation(),
      new SAPIExperience(),
      new SAPIExperienceHighlight(),
      new SAPIExperienceSkill(),
      new SAPIProject(),
      new SAPIProjectAsset(),
      new SAPIProjectSkill(),
      new SAPISkill(),
      new SAPITestimonial()
    };
  }

  private static Map<String, QueryDefinitions.QueryDefault> sapiDefaults() {
    Map<String, QueryDefinitions.QueryDefault> defaults = new Map<String, QueryDefinitions.QueryDefault>();
    for (QueryDefinitions.Provider provider : sapiProviders()) {
      defaults.putAll(provider.queryDefaults());
    }
    return defaults;
  }

  private static String normal(String text) {
    return text == null ? '' : text.normalizeSpace();
  }

  @IsTest
  static void everyDeployedRecordPassesValidation() {
    Test.startTest();
    List<String> failures = QueryDefinitions.validateAll();
    Test.stopTest();

    Assert.areEqual(
      new List<String>(),
      failures,
      'Every Query_Definition__mdt record passes its code default'
    );
  }

  @IsTest
  static void everySapiReadHasAnActiveRecord() {
    Map<String, QueryDefinitions.QueryDefault> defaults = sapiDefaults();
    Map<String, Query_Definition__mdt> records = Query_Definition__mdt.getAll();

    Assert.areEqual(
      14,
      defaults.size(),
      'Thirteen list reads and one detail read'
    );
    for (String name : defaults.keySet()) {
      Assert.isTrue(records.containsKey(name), 'Record ships for ' + name);
      Assert.isTrue(records.get(name).Active__c, name + ' ships active');
    }
  }

  @IsTest
  static void everySapiRecordShipsEqualToItsDefault() {
    Map<String, QueryDefinitions.QueryDefault> defaults = sapiDefaults();
    // SOQL, because getAll() cuts long text to 255 characters.
    Map<String, Query_Definition__mdt> records = new Map<String, Query_Definition__mdt>();
    for (Query_Definition__mdt record : [
      SELECT
        DeveloperName,
        Object__c,
        Fields__c,
        Filter__c,
        Order_By__c,
        Row_Limit__c,
        Access_Mode__c
      FROM Query_Definition__mdt
    ]) {
      records.put(record.DeveloperName, record);
    }

    for (String name : defaults.keySet()) {
      QueryDefinitions.QueryDefault codeDefault = defaults.get(name);
      Query_Definition__mdt record = records.get(name);
      Assert.areEqual(
        codeDefault.objectName,
        record.Object__c,
        name + ' object'
      );
      Assert.areEqual(
        normal(codeDefault.fieldList),
        normal(record.Fields__c),
        name + ' fields'
      );
      Assert.areEqual(
        normal(codeDefault.filterText),
        normal(record.Filter__c),
        name + ' filter'
      );
      Assert.areEqual(
        normal(codeDefault.orderByText),
        normal(record.Order_By__c),
        name + ' order'
      );
      Assert.areEqual(
        codeDefault.rowLimitValue,
        record.Row_Limit__c.intValue(),
        name + ' row limit'
      );
      Assert.areEqual(
        codeDefault.accessMode.name(),
        record.Access_Mode__c,
        name + ' access mode'
      );
    }
  }
}
