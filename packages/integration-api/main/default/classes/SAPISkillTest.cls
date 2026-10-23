/**
 * @description       : Unit tests for SAPISkill REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/02/2026
 **/
@IsTest
private class SAPISkillTest {
  @TestSetup
  static void setup() {
    Skill__c s = new Skill__c(
      Name = 'Apex',
      Category__c = 'Backend',
      Proficiency__c = 5
    );
    insert s;
  }

  @IsTest
  static void testGetSkillsSuccess() {
    RestTestUtil.initGet('/services/apexrest/sapi/v1/skills/');
    RestResponse res = RestTestUtil.getResponse();

    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.startTest();
      SAPISkill.getSkills();
      Test.stopTest();

      System.assertEquals(200, res.statusCode, 'Should return 200 OK');
      System.assertNotEquals(
        null,
        res.responseBody,
        'Response body should not be null'
      );

      String responseJson = res.responseBody.toString();
      System.assert(
        responseJson.contains('Apex'),
        'Response should contain skill name'
      );
    }
  }

  @IsTest
  static void testGetSkillsWithCategoryFilter() {
    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/skills/',
      new Map<String, String>{ 'category' => 'Backend Development' }
    );
    RestResponse res = RestTestUtil.getResponse();

    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.startTest();
      SAPISkill.getSkills();
      Test.stopTest();

      System.assertEquals(200, res.statusCode, 'Should return 200 OK');
    }
  }

  @IsTest
  static void testGetSkillsInvalidLimit() {
    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/skills/',
      new Map<String, String>{ 'limit' => '300' }
    );
    RestResponse res = RestTestUtil.getResponse();

    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.startTest();
      SAPISkill.getSkills();
      Test.stopTest();

      System.assertEquals(400, res.statusCode, 'Should return 400 Bad Request');
    }
  }
  @IsTest
  static void testGetSkillsInternalError() {
    RestTestUtil.initGet('/services/apexrest/sapi/v1/skills/');
    RestResponse res = RestTestUtil.getResponse();

    SAPISkill.throwException = true;

    Test.startTest();
    SAPISkill.getSkills();
    Test.stopTest();

    System.assertEquals(
      500,
      res.statusCode,
      'Should return 500 on internal error'
    );
  }

  // Property names of the Skill schema in salesforce-sapi.yaml.
  private static final Set<String> SPEC_SKILL_KEYS = new Set<String>{
    'id',
    'name',
    'displayName',
    'category',
    'proficiencyScore',
    'iconName',
    'svgPathData',
    'colorHex',
    'categoryOrder'
  };

  @IsTest
  static void responseKeysEqualTheSpecSchema() {
    Skill__c skill = [SELECT Id FROM Skill__c LIMIT 1];
    skill.Display_Name__c = 'Salesforce Apex';
    skill.Color_Hex__c = '#0070d2';
    skill.SVG_Path_Data__c = 'M10 10';
    skill.Category_Order__c = 3;
    update skill;
    RestTestUtil.initGet('/services/apexrest/sapi/v1/skills/');

    Test.startTest();
    SAPISkill.getSkills();
    Test.stopTest();

    List<Object> items = (List<Object>) JSON.deserializeUntyped(
      RestTestUtil.getResponse().responseBody.toString()
    );
    Map<String, Object> item = (Map<String, Object>) items[0];
    Assert.areEqual(SPEC_SKILL_KEYS, item.keySet(), 'Keys equal the spec');
    Assert.areEqual('Salesforce Apex', item.get('displayName'), 'displayName');
    Assert.areEqual('#0070d2', item.get('colorHex'), 'colorHex');
    Assert.areEqual('M10 10', item.get('svgPathData'), 'svgPathData');
    Assert.areEqual(
      3,
      Decimal.valueOf(String.valueOf(item.get('categoryOrder'))),
      'categoryOrder'
    );
  }
}
