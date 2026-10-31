/**
 * @description       : Tests that every SAPI response carries the public key beside the Id, and
 *                      that every Id parameter accepts the key in its place (ADR-038).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/28/2026
 **/
@IsTest
private class SAPIPublicKeyTest {
  private static final String KEY_FORMAT = '^[a-z]{3}_[a-km-np-z2-9]{10}$';

  @TestSetup
  static void setup() {
    SapiTestData.createGraph();
    // The project list query only returns live or in development projects.
    List<Project__c> projects = [SELECT Id FROM Project__c];
    for (Project__c project : projects) {
      project.Status__c = 'Active Development';
    }
    update projects;
  }

  private static void callResource(
    String resource,
    Map<String, String> params
  ) {
    SapiTestData.get(resource, params);
    if (resource == 'accounts') {
      SAPIAccount.getAccounts();
    } else if (resource == 'contacts') {
      SAPIContact.getContacts();
    } else if (resource == 'skills') {
      SAPISkill.getSkills();
    } else if (resource == 'experience') {
      SAPIExperience.getExperiences();
    } else if (resource == 'experience-highlights') {
      SAPIExperienceHighlight.getExperienceHighlights();
    } else if (resource == 'experience-skills') {
      SAPIExperienceSkill.getExperienceSkills();
    } else if (resource == 'projects') {
      SAPIProject.getProjects();
    } else if (resource == 'project-assets') {
      SAPIProjectAsset.getProjectAssets();
    } else if (resource == 'project-skills') {
      SAPIProjectSkill.getProjectSkills();
    } else if (resource == 'certifications') {
      SAPICertification.getCertifications();
    } else if (resource == 'certification-skills') {
      SAPICertificationSkill.getCertificationSkills();
    } else if (resource == 'education') {
      SAPIEducation.getEducation();
    } else if (resource == 'testimonials') {
      SAPITestimonial.getTestimonials();
    }
  }

  private static String keyOf(SObjectType objectType, String name) {
    String soql =
      'SELECT Public_Key__c FROM ' +
      objectType.getDescribe().getName() +
      ' WHERE Name = :name LIMIT 1';
    List<SObject> rows = Database.queryWithBinds(
      soql,
      new Map<String, Object>{ 'name' => name },
      AccessLevel.SYSTEM_MODE
    );
    return (String) rows[0].get('Public_Key__c');
  }

  private static String ownerKey() {
    return [
      SELECT Public_Key__c
      FROM Contact
      WHERE LastName = :SapiTestData.OWNER_LAST_NAME
    ]
    .Public_Key__c;
  }

  private static String employerKey() {
    return [
      SELECT Public_Key__c
      FROM Account
      WHERE Name = :SapiTestData.EMPLOYER_NAME
    ]
    .Public_Key__c;
  }

  private static void assertEveryRowKey(String resource, String prefix) {
    Test.startTest();
    callResource(resource, null);
    Test.stopTest();

    Assert.areEqual(
      200,
      RestContext.response.statusCode,
      resource + ' status. Body: ' + SapiTestData.bodyText()
    );
    List<Map<String, Object>> rows = SapiTestData.bodyAsList();
    Assert.isFalse(rows.isEmpty(), resource + ' returns rows');
    for (Map<String, Object> row : rows) {
      String key = (String) row.get('key');
      Assert.isNotNull(key, resource + ' row carries a key');
      Assert.isTrue(Pattern.matches(KEY_FORMAT, key), 'Key format: ' + key);
      Assert.isTrue(key.startsWith(prefix + '_'), resource + ' prefix: ' + key);
      Assert.isNotNull(row.get('id'), resource + ' still carries id');
    }
  }

  private static void assertFilterNarrows(
    String resource,
    String param,
    String value,
    Integer expectedRows
  ) {
    Test.startTest();
    callResource(resource, new Map<String, String>{ param => value });
    Test.stopTest();

    Assert.areEqual(
      200,
      RestContext.response.statusCode,
      SapiTestData.bodyText()
    );
    Assert.areEqual(
      expectedRows,
      SapiTestData.bodyAsList().size(),
      resource + ' ' + param + ' narrows by the key'
    );
  }

  @IsTest
  static void shouldReturnKeyWhenAccounts() {
    assertEveryRowKey('accounts', 'acc');
  }

  @IsTest
  static void shouldReturnKeyWhenContacts() {
    assertEveryRowKey('contacts', 'con');
  }

  @IsTest
  static void shouldReturnKeyWhenSkills() {
    assertEveryRowKey('skills', 'skl');
  }

  @IsTest
  static void shouldReturnKeyWhenExperience() {
    assertEveryRowKey('experience', 'exp');
  }

  @IsTest
  static void shouldReturnKeyWhenExperienceHighlights() {
    assertEveryRowKey('experience-highlights', 'hlt');
  }

  @IsTest
  static void shouldReturnKeyWhenExperienceSkills() {
    assertEveryRowKey('experience-skills', 'exs');
  }

  @IsTest
  static void shouldReturnKeyWhenProjects() {
    assertEveryRowKey('projects', 'prj');
  }

  @IsTest
  static void shouldReturnKeyWhenProjectAssets() {
    assertEveryRowKey('project-assets', 'pas');
  }

  @IsTest
  static void shouldReturnKeyWhenProjectSkills() {
    assertEveryRowKey('project-skills', 'prs');
  }

  @IsTest
  static void shouldReturnKeyWhenCertifications() {
    assertEveryRowKey('certifications', 'crt');
  }

  @IsTest
  static void shouldReturnKeyWhenCertificationSkills() {
    assertEveryRowKey('certification-skills', 'cks');
  }

  @IsTest
  static void shouldReturnKeyWhenEducation() {
    assertEveryRowKey('education', 'edu');
  }

  @IsTest
  static void shouldReturnKeyWhenTestimonials() {
    insert new Testimonial__c(
      Author_Name__c = 'Key Author',
      Approved__c = true,
      Relationship_Type__c = 'Manager',
      Vibe_Mode__c = 'Professional',
      Sort_Order__c = 1
    );
    assertEveryRowKey('testimonials', 'tst');
  }

  @IsTest
  static void shouldReturnReferenceKeysWhenJunctionRows() {
    String experienceKey = keyOf(
      Experience__c.SObjectType,
      SapiTestData.EXPERIENCE_ONE
    );
    String apexKey = keyOf(Skill__c.SObjectType, SapiTestData.SKILL_APEX);

    Test.startTest();
    callResource('experience-skills', null);
    Test.stopTest();

    Boolean sawApex = false;
    for (Map<String, Object> link : SapiTestData.bodyAsList()) {
      if (link.get('experienceName') == SapiTestData.EXPERIENCE_ONE) {
        Assert.areEqual(
          experienceKey,
          link.get('experienceKey'),
          'experienceKey'
        );
      }
      if (link.get('skillName') == SapiTestData.SKILL_APEX) {
        Assert.areEqual(apexKey, link.get('skillKey'), 'skillKey');
        sawApex = true;
      }
    }
    Assert.isTrue(sawApex, 'The Apex skill link was checked');
  }

  @IsTest
  static void shouldReturnProjectKeyWhenProjectAssets() {
    String projectKey = keyOf(Project__c.SObjectType, SapiTestData.PROJECT_ONE);

    Test.startTest();
    callResource('project-assets', null);
    Test.stopTest();

    Integer checked = 0;
    for (Map<String, Object> asset : SapiTestData.bodyAsList()) {
      if (asset.get('projectName') == SapiTestData.PROJECT_ONE) {
        Assert.areEqual(projectKey, asset.get('projectKey'), 'projectKey');
        checked++;
      }
    }
    Assert.areEqual(2, checked, 'Both assets of project one were checked');
  }

  @IsTest
  static void shouldReturnContactAndIssuerKeysWhenCertifications() {
    Test.startTest();
    callResource(
      'certifications',
      new Map<String, String>{ 'certificationName' => SapiTestData.CERT_ONE }
    );
    Test.stopTest();

    List<Map<String, Object>> rows = SapiTestData.bodyAsList();
    Assert.areEqual(1, rows.size(), 'One certification');
    Assert.areEqual(ownerKey(), rows[0].get('contactKey'), 'contactKey');
    Assert.areEqual(employerKey(), rows[0].get('issuerKey'), 'issuerKey');
  }

  @IsTest
  static void shouldReturnContactAndIssuerKeysWhenEducation() {
    Test.startTest();
    callResource('education', null);
    Test.stopTest();

    Integer checked = 0;
    for (Map<String, Object> row : SapiTestData.bodyAsList()) {
      if (row.get('name') == SapiTestData.DEGREE_ONE) {
        Assert.areEqual(ownerKey(), row.get('contactKey'), 'contactKey');
        checked++;
      }
      Assert.isNotNull(row.get('issuerKey'), 'issuerKey');
    }
    Assert.areEqual(1, checked, 'The owner degree was checked');
  }

  @IsTest
  static void shouldReturnEmployerAndContactKeysWhenExperience() {
    Test.startTest();
    callResource('experience', null);
    Test.stopTest();

    for (Map<String, Object> row : SapiTestData.bodyAsList()) {
      Assert.areEqual(employerKey(), row.get('employerKey'), 'employerKey');
      Assert.areEqual(ownerKey(), row.get('contactKey'), 'contactKey');
    }
  }

  @IsTest
  static void shouldReturnContactKeyWhenProjects() {
    Test.startTest();
    callResource('projects', null);
    Test.stopTest();

    for (Map<String, Object> row : SapiTestData.bodyAsList()) {
      Assert.areEqual(ownerKey(), row.get('contactKey'), 'contactKey');
    }
  }

  @IsTest
  static void shouldFilterByKeyWhenProjectAssetsGetProjectKey() {
    assertFilterNarrows(
      'project-assets',
      'projectId',
      keyOf(Project__c.SObjectType, SapiTestData.PROJECT_ONE),
      2
    );
  }

  @IsTest
  static void shouldFilterByKeyWhenKeyIsUpperCase() {
    assertFilterNarrows(
      'project-skills',
      'projectId',
      keyOf(Project__c.SObjectType, SapiTestData.PROJECT_ONE).toUpperCase(),
      2
    );
  }

  @IsTest
  static void shouldFilterByKeyWhenExperienceSkillsGetExperienceKey() {
    assertFilterNarrows(
      'experience-skills',
      'experienceId',
      keyOf(Experience__c.SObjectType, SapiTestData.EXPERIENCE_ONE),
      2
    );
  }

  @IsTest
  static void shouldFilterByKeyWhenHighlightsGetExperienceKey() {
    assertFilterNarrows(
      'experience-highlights',
      'experienceId',
      keyOf(Experience__c.SObjectType, SapiTestData.EXPERIENCE_ONE),
      2
    );
  }

  @IsTest
  static void shouldFilterByKeyWhenCertificationSkillsGetCertificationKey() {
    assertFilterNarrows(
      'certification-skills',
      'certificationId',
      keyOf(Certification__c.SObjectType, SapiTestData.CERT_ONE),
      2
    );
  }

  @IsTest
  static void shouldReturnNoRowsWhenKeyHasNoRecord() {
    assertFilterNarrows('project-assets', 'projectId', 'prj_abcdefghjk', 0);
  }

  @IsTest
  static void shouldReturnNoRowsWhenKeyBelongsToAnotherObject() {
    assertFilterNarrows(
      'project-assets',
      'projectId',
      keyOf(Skill__c.SObjectType, SapiTestData.SKILL_APEX),
      0
    );
  }

  @IsTest
  static void shouldReturn400WhenValueIsNeitherIdNorKey() {
    Test.startTest();
    callResource(
      'experience-skills',
      new Map<String, String>{ 'experienceId' => 'not-an-id' }
    );
    Test.stopTest();

    SapiTestData.assertError(400, 'BAD_REQUEST');
    Assert.areEqual(
      ApiMessages.idInvalid('experienceId', '/sapi/experience'),
      RestTestUtil.getBodyAsMap().get('message'),
      'The message names the list that holds the keys: ' +
      SapiTestData.bodyText()
    );
  }

  @IsTest
  static void shouldReturnProjectWhenPathIsTheKey() {
    String projectKey = keyOf(Project__c.SObjectType, SapiTestData.PROJECT_ONE);
    RestTestUtil.initGet('/services/apexrest/sapi/v1/projects/' + projectKey);

    Test.startTest();
    SAPIProject.getProjects();
    Test.stopTest();

    Assert.areEqual(
      200,
      RestContext.response.statusCode,
      SapiTestData.bodyText()
    );
    List<Map<String, Object>> rows = SapiTestData.bodyAsList();
    Assert.areEqual(1, rows.size(), 'One project');
    Assert.areEqual(projectKey, rows[0].get('key'), 'The key comes back');
    Assert.areEqual(
      SapiTestData.PROJECT_ONE,
      rows[0].get('name'),
      'The right project'
    );
  }

  @IsTest
  static void shouldReturnProjectWhenPathIsTheId() {
    Project__c project = [
      SELECT Id
      FROM Project__c
      WHERE Name = :SapiTestData.PROJECT_ONE
    ];
    RestTestUtil.initGet('/services/apexrest/sapi/v1/projects/' + project.Id);

    Test.startTest();
    SAPIProject.getProjects();
    Test.stopTest();

    Assert.areEqual(
      200,
      RestContext.response.statusCode,
      SapiTestData.bodyText()
    );
    Assert.areEqual(
      String.valueOf(project.Id),
      String.valueOf(SapiTestData.bodyAsList()[0].get('id')),
      'The Id still works'
    );
  }

  @IsTest
  static void shouldReturn404WhenPathKeyHasNoRecord() {
    RestTestUtil.initGet('/services/apexrest/sapi/v1/projects/prj_abcdefghjk');

    Test.startTest();
    SAPIProject.getProjects();
    Test.stopTest();

    SapiTestData.assertError(404, 'NOT_FOUND');
  }

  @IsTest
  static void shouldResolveReferenceWhenIdKeyOrOther() {
    Project__c project = [
      SELECT Id, Public_Key__c
      FROM Project__c
      WHERE Name = :SapiTestData.PROJECT_ONE
    ];

    Test.startTest();
    String fromId = SAPITransformer.resolveReference(
      Project__c.SObjectType,
      ' ' + project.Id + ' '
    );
    String fromKey = SAPITransformer.resolveReference(
      Project__c.SObjectType,
      project.Public_Key__c
    );
    String missing = SAPITransformer.resolveReference(
      Project__c.SObjectType,
      'prj_abcdefghjk'
    );
    String neither = SAPITransformer.resolveReference(
      Project__c.SObjectType,
      'nonsense'
    );
    String blank = SAPITransformer.resolveReference(
      Project__c.SObjectType,
      null
    );
    Test.stopTest();

    Assert.areEqual(
      String.valueOf(project.Id),
      fromId,
      'An Id passes through trimmed'
    );
    Assert.areEqual(
      String.valueOf(project.Id),
      fromKey,
      'A key resolves to its Id'
    );
    Assert.areEqual(
      SAPITransformer.NO_MATCH_ID,
      missing,
      'An unknown key resolves to the no match Id'
    );
    Assert.isNull(neither, 'Anything else is null');
    Assert.isNull(blank, 'Blank is null');
  }
}
