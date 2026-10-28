/**
 * @description       : Unit tests for SAPITransformer, on in-memory records.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 **/
@IsTest
private class SAPITransformerTest {
  @IsTest
  static void shouldAcceptIdWhenFifteenOrEighteenChars() {
    Id sample = UserInfo.getUserId();
    Assert.isTrue(SAPITransformer.isSalesforceId(sample), '18-char Id');
    Assert.isTrue(
      SAPITransformer.isSalesforceId(String.valueOf(sample).left(15)),
      '15-char Id'
    );
  }

  @IsTest
  static void shouldRejectIdWhenBlankOrMalformed() {
    Assert.isFalse(SAPITransformer.isSalesforceId(null), 'null');
    Assert.isFalse(SAPITransformer.isSalesforceId('  '), 'blank');
    Assert.isFalse(SAPITransformer.isSalesforceId('not-an-id'), 'malformed');
  }

  @IsTest
  static void shouldMapNullParentsWhenRelationshipsMissing() {
    List<Map<String, Object>> rows = SAPITransformer.toProjectSkills(
      new List<Project_Skill__c>{ new Project_Skill__c() }
    );

    Assert.areEqual(
      SapiTestData.PROJECT_SKILL_KEYS,
      rows[0].keySet(),
      'Keys are present even when parents are absent'
    );
    Assert.isNull(rows[0].get('skillName'), 'skillName null without parent');
    Assert.isNull(rows[0].get('projectName'), 'projectName null');
  }

  @IsTest
  static void shouldFormatDatesWhenPresent() {
    Certification__c cert = new Certification__c(
      Name = 'Cert',
      Earned_Date__c = Date.newInstance(2024, 5, 15)
    );
    Education__c edu = new Education__c(Name = 'Degree');

    Map<String, Object> certRow = SAPITransformer.toCertifications(
      new List<Certification__c>{ cert }
    )[0];
    Map<String, Object> eduRow = SAPITransformer.toEducation(
      new List<Education__c>{ edu }
    )[0];

    Assert.areEqual('2024-05-15', certRow.get('earnedDate'), 'ISO date');
    Assert.isNull(eduRow.get('graduationDate'), 'Null date stays null');
  }

  @IsTest
  static void shouldMapSkillParentWhenJunctionHasSkill() {
    Skill__c skill = new Skill__c(
      Name = 'Apex',
      Category__c = 'Backend',
      Proficiency__c = 5
    );
    Experience_Skill__c expLink = new Experience_Skill__c(
      Skill__r = skill,
      Experience__r = new Experience__c(Name = 'Role')
    );
    Certification_Skill__c certLink = new Certification_Skill__c(
      Skill__r = skill,
      Certification__r = new Certification__c(Name = 'Cert')
    );

    Map<String, Object> expRow = SAPITransformer.toExperienceSkills(
      new List<Experience_Skill__c>{ expLink }
    )[0];
    Map<String, Object> certRow = SAPITransformer.toCertificationSkills(
      new List<Certification_Skill__c>{ certLink }
    )[0];

    Assert.areEqual('Apex', expRow.get('skillName'), 'skillName');
    Assert.areEqual('Backend', expRow.get('skillCategory'), 'skillCategory');
    Assert.areEqual(
      Decimal.valueOf(5),
      expRow.get('skillProficiencyScore'),
      'proficiency'
    );
    Assert.areEqual('Role', expRow.get('experienceName'), 'experienceName');
    Assert.areEqual(
      SapiTestData.CERTIFICATION_SKILL_KEYS,
      certRow.keySet(),
      'CertificationSkill keys'
    );
    Assert.areEqual('Cert', certRow.get('certificationName'), 'cert name');
  }

  @IsTest
  static void shouldReturnEmptyObjectWhenConfigNull() {
    Assert.isTrue(
      SAPITransformer.toPortfolioConfig(null).isEmpty(),
      'Null config maps to an empty object'
    );
  }
}
