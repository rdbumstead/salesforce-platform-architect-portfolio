/**
 * @description       : Tests for DataSourceController. Counts are checked against rows the test
 *                      inserts, through the shipped ResumeController_Skills definition and
 *                      through in memory definitions. The guest test runs as the real
 *                      Portfolio1 site guest user.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/28/2026
 **/
@isTest
private class DataSourceControllerTest {
  private static Query_Definition__mdt definition(
    String filterText,
    Boolean active
  ) {
    return new Query_Definition__mdt(
      Object__c = 'Skill__c',
      Fields__c = 'Name',
      Filter__c = filterText,
      Row_Limit__c = 50000,
      Access_Mode__c = 'SYSTEM_MODE',
      Active__c = active,
      Description__c = 'Test skills.'
    );
  }

  private static void insertSkills(Integer howMany, String category) {
    List<Skill__c> skills = new List<Skill__c>();
    for (Integer i = 0; i < howMany; i++) {
      skills.add(
        new Skill__c(
          Name = category + ' ' + i,
          Category__c = category,
          Category_Order__c = 1,
          Proficiency__c = 3
        )
      );
    }
    insert skills;
  }

  @isTest
  static void countMatchesInsertedRowsForShippedDefinition() {
    insertSkills(4, 'Backend');

    Test.startTest();
    List<DataSourceController.DataSource> sources = DataSourceController.getSources(
      new List<String>{ 'ResumeController_Skills' }
    );
    Test.stopTest();

    Assert.areEqual(1, sources.size(), 'The shipped definition is returned.');
    Assert.areEqual('ResumeController_Skills', sources[0].name);
    Assert.areEqual(
      Skill__c.SObjectType.getDescribe().getLabelPlural(),
      sources[0].label,
      'The label is the object plural label.'
    );
    Assert.isTrue(sources[0].hasCount, 'A filterless definition is counted.');
    Assert.areEqual(4, sources[0].count, 'The count matches the rows.');
    Assert.areEqual(
      'Skill__c',
      sources[0].objectName,
      'The object API name is returned.'
    );
    Assert.isFalse(
      JSON.serialize(sources).containsIgnoreCase('description'),
      'No description is returned.'
    );
  }

  @isTest
  static void sourcesSayWhetherTheModelDrawsTheirObject() {
    Query_Definition__mdt unknown = definition(null, true);
    unknown.Object__c = 'User';
    DataSourceController.overrides.put('Test_Not_In_Model', unknown);
    DataSourceController.overrides.put('Test_In_Model', definition(null, true));
    Boolean skillDrawn = SchemaService.modelObjectNames().contains('Skill__c');

    List<DataSourceController.DataSource> sources = DataSourceController.getSources(
      new List<String>{ 'Test_In_Model', 'Test_Not_In_Model' }
    );
    List<DataSourceController.DataSource> objects = DataSourceController.getObjectSources(
      new List<String>{ 'skill__c' }
    );

    Assert.areEqual(2, sources.size());
    Assert.areEqual(skillDrawn, sources[0].inModel, 'Skill follows the model.');
    Assert.isFalse(sources[1].inModel, 'User is not drawn by the model.');
    Assert.areEqual(
      skillDrawn,
      objects[0].inModel,
      'Object sources follow it too.'
    );
  }

  @isTest
  static void visitorLabelWinsOverObjectPluralLabel() {
    Query_Definition__mdt withLabel = definition(null, true);
    withLabel.Visitor_Label__c = 'abilities';
    DataSourceController.overrides.put('Test_With_Label', withLabel);
    DataSourceController.overrides.put(
      'Test_Blank_Label',
      definition(null, true)
    );

    List<DataSourceController.DataSource> sources = DataSourceController.getSources(
      new List<String>{ 'Test_With_Label', 'Test_Blank_Label' }
    );

    Assert.areEqual(2, sources.size());
    Assert.areEqual('abilities', sources[0].label, 'The visitor label wins.');
    Assert.areEqual(
      Skill__c.SObjectType.getDescribe().getLabelPlural(),
      sources[1].label,
      'A blank visitor label falls back to the plural label.'
    );
  }

  @isTest
  static void objectSourceTakesVisitorLabelOfFirstDefinitionThatHasOne() {
    Query_Definition__mdt second = definition(null, true);
    second.Visitor_Label__c = 'second label';
    Query_Definition__mdt first = definition(null, true);
    first.Visitor_Label__c = 'first label';
    DataSourceController.overrides.put('AAA_Test_Second', second);
    DataSourceController.overrides.put('AAA_Test_First', first);
    Query_Definition__mdt inactive = definition(null, false);
    inactive.Visitor_Label__c = 'inactive label';
    DataSourceController.overrides.put('AAA_A_Inactive', inactive);

    List<DataSourceController.DataSource> sources = DataSourceController.getObjectSources(
      new List<String>{ 'Skill__c' }
    );

    Assert.areEqual(1, sources.size());
    Assert.areEqual('Skill__c', sources[0].objectName);
    Assert.areEqual(
      'first label',
      sources[0].label,
      'The first active definition by developer name with a label wins.'
    );
  }

  @isTest
  static void filterOfDefinitionIsHonoured() {
    insertSkills(3, 'Backend');
    insertSkills(2, 'Frontend');
    DataSourceController.overrides.put(
      'Test_Backend',
      definition('Category__c = \'Backend\'', true)
    );

    List<DataSourceController.DataSource> sources = DataSourceController.getSources(
      new List<String>{ 'Test_Backend' }
    );

    Assert.areEqual(1, sources.size());
    Assert.areEqual(3, sources[0].count, 'Only matching rows are counted.');
  }

  @isTest
  static void unknownNameIsSkipped() {
    List<DataSourceController.DataSource> sources = DataSourceController.getSources(
      new List<String>{ 'No_Such_Definition', '', null }
    );

    Assert.isTrue(sources.isEmpty(), 'Unknown and blank names return nothing.');
    Assert.isTrue(
      DataSourceController.getSources(null).isEmpty(),
      'A null list returns nothing.'
    );
  }

  @isTest
  static void inactiveDefinitionIsSkipped() {
    DataSourceController.overrides.put(
      'Test_Inactive',
      definition(null, false)
    );

    List<DataSourceController.DataSource> sources = DataSourceController.getSources(
      new List<String>{ 'Test_Inactive' }
    );

    Assert.isTrue(sources.isEmpty(), 'An inactive definition is skipped.');
  }

  @isTest
  static void bindFilterReturnsNoCount() {
    DataSourceController.overrides.put(
      'Test_Bind',
      definition('Id IN :ids', true)
    );

    List<DataSourceController.DataSource> sources = DataSourceController.getSources(
      new List<String>{ 'Test_Bind' }
    );

    Assert.areEqual(1, sources.size());
    Assert.isFalse(sources[0].hasCount, 'A bind filter is not counted.');
    Assert.isNull(sources[0].count);
  }

  @isTest
  static void capAndDuplicatesHold() {
    List<String> names = new List<String>();
    for (Integer i = 0; i < DataSourceController.MAX_NAMES + 5; i++) {
      String name = 'Test_Cap_' + i;
      DataSourceController.overrides.put(name, definition(null, true));
      names.add(name);
    }
    names.add('Test_Cap_0');

    List<DataSourceController.DataSource> sources = DataSourceController.getSources(
      names
    );

    Assert.areEqual(
      DataSourceController.MAX_NAMES,
      sources.size(),
      'No more than the cap is read.'
    );
    Assert.areEqual('Test_Cap_0', sources[0].name, 'Order is kept.');
  }

  @isTest
  static void guestSeesCountsButNoQueryText() {
    SiteGuestTestSupport.createResumeGraph();
    User guest = SiteGuestTestSupport.preparedGuest();
    List<DataSourceController.DataSource> sources;

    Test.startTest();
    System.runAs(guest) {
      sources = DataSourceController.getSources(
        new List<String>{ 'ResumeController_Skills' }
      );
    }
    Test.stopTest();

    Assert.areEqual(1, sources.size(), 'The guest can read the marker.');
    Assert.areEqual(3, sources[0].count, 'The graph holds three skills.');
    String body = JSON.serialize(sources);
    Assert.isFalse(body.contains('Fields__c'), 'No field list leaks.');
    Assert.isFalse(body.contains('Category_Order__c'), 'No field name leaks.');
  }

  @isTest
  static void objectSourcesServeOnlyObjectsADefinitionReads() {
    insertSkills(2, 'Backend');

    List<DataSourceController.DataSource> sources = DataSourceController.getObjectSources(
      new List<String>{ 'Skill__c', 'skill__c', 'User', 'Not_An_Object__c', '' }
    );

    Assert.areEqual(
      1,
      sources.size(),
      'Duplicates and unserved objects drop out.'
    );
    Assert.areEqual('Skill__c', sources[0].name);
    Assert.isTrue(sources[0].hasCount);
    Assert.areEqual(2, sources[0].count, 'The count matches the rows.');
    Assert.isTrue(
      DataSourceController.getObjectSources(null).isEmpty(),
      'A null list returns nothing.'
    );
  }
}
