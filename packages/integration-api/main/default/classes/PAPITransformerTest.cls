/**
 * @description       : Unit tests for PAPITransformer utility class.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/02/2026
 **/
@IsTest
private class PAPITransformerTest {
  @IsTest
  static void testFormatDateRangeCurrentRole() {
    Date startDate = Date.newInstance(2023, 1, 15);
    String result = PAPITransformer.formatDateRange(startDate, null);
    System.assert(
      result.endsWith('- Present'),
      'Should end with Present for null end date'
    );
  }

  @IsTest
  static void testFormatDateRangePastRole() {
    Date startDate = Date.newInstance(2020, 6, 1);
    Date endDate = Date.newInstance(2023, 12, 31);
    String result = PAPITransformer.formatDateRange(startDate, endDate);
    System.assert(result.contains(' - '), 'Should contain date separator');
    System.assert(!result.contains('Present'), 'Should not contain Present');
  }

  @IsTest
  static void testFormatMonthYear() {
    Date d = Date.newInstance(2024, 3, 15);
    String result = PAPITransformer.formatMonthYear(d);
    System.assert(result.contains('Mar'), 'Should contain month abbreviation');
    System.assert(result.contains('2024'), 'Should contain year');
  }

  @IsTest
  static void testFormatMonthYearNull() {
    String result = PAPITransformer.formatMonthYear(null);
    System.assertEquals('', result, 'Should return empty string for null');
  }

  @IsTest
  static void testCalculateSummaryWithExperiences() {
    Account employer = new Account(Name = 'Test Employer');
    insert employer;

    Contact c = new Contact(LastName = 'TestUser');
    insert c;

    Experience__c exp = new Experience__c(
      Employer__c = employer.Id,
      Name = 'Senior Architect',
      Start_Date__c = Date.today().addYears(-5),
      Is_Current_Role__c = true,
      Contact__c = c.Id
    );
    /*
    insert exp;

    List<Experience__c> experiences = [
      SELECT Id, Start_Date__c, Name, Is_Current_Role__c
      FROM Experience__c
    ];
    */
    List<Experience__c> experiences = new List<Experience__c>{ exp };

    String result = PAPITransformer.calculateSummary(experiences);
    System.assert(
      result.contains('Years of Experience'),
      'Should contain years of experience'
    );
    System.assert(
      result.contains('Senior Architect'),
      'Should contain current role'
    );
  }

  @IsTest
  static void testCalculateSummaryEmptyList() {
    String result = PAPITransformer.calculateSummary(new List<Experience__c>());
    System.assertEquals(
      'Salesforce Professional',
      result,
      'Should return default title'
    );
  }

  @IsTest
  static void strictestOfEmptyListIsNoStore() {
    Assert.areEqual(
      ApiRequestContext.CachePolicy.NO_STORE,
      PAPITransformer.strictest(new List<ApiRequestContext.CachePolicy>()),
      'No sources means nothing is known to be cacheable'
    );
  }

  @IsTest
  static void strictestPrefersPrivateOverPublic() {
    Assert.areEqual(
      ApiRequestContext.CachePolicy.PRIVATE_300,
      PAPITransformer.strictest(
        new List<ApiRequestContext.CachePolicy>{
          ApiRequestContext.CachePolicy.PUBLIC_300,
          ApiRequestContext.CachePolicy.PRIVATE_300
        }
      ),
      'Any private source makes the response private'
    );
  }

  @IsTest
  static void strictestPrefersShorterPrivateMaxAge() {
    Assert.areEqual(
      ApiRequestContext.CachePolicy.PRIVATE_60,
      PAPITransformer.strictest(
        new List<ApiRequestContext.CachePolicy>{
          ApiRequestContext.CachePolicy.PRIVATE_300,
          ApiRequestContext.CachePolicy.PRIVATE_60
        }
      ),
      'Between private policies the shorter max-age wins'
    );
  }

  @IsTest
  static void strictestPrefersNoStoreOverEverything() {
    Assert.areEqual(
      ApiRequestContext.CachePolicy.NO_STORE,
      PAPITransformer.strictest(
        new List<ApiRequestContext.CachePolicy>{
          ApiRequestContext.CachePolicy.PUBLIC_300,
          ApiRequestContext.CachePolicy.NO_STORE,
          ApiRequestContext.CachePolicy.PRIVATE_60
        }
      ),
      'Any no-store source makes the response no-store'
    );
  }

  @IsTest
  static void strictestOfPublicOnlyIsPublic() {
    Assert.areEqual(
      ApiRequestContext.CachePolicy.PUBLIC_300,
      PAPITransformer.strictest(
        new List<ApiRequestContext.CachePolicy>{
          ApiRequestContext.CachePolicy.PUBLIC_300,
          ApiRequestContext.CachePolicy.PUBLIC_300
        }
      ),
      'All-public sources stay public'
    );
  }

  @IsTest
  static void aggregationCompleteWhenNothingFails() {
    PAPITransformer.Aggregation agg = new PAPITransformer.Aggregation();
    agg.source('skills');
    agg.source('projects');

    Assert.isTrue(agg.isComplete(), 'Nothing failed');
    Assert.areEqual('complete', agg.integrity(), 'Header value');
    Assert.areEqual('complete', agg.integrityNote(), 'Body value');
    Assert.areEqual(
      ApiRequestContext.CachePolicy.PUBLIC_300,
      agg.cachePolicy(),
      'Skills and projects are both public'
    );
  }

  @IsTest
  static void aggregationNamesEachFailedSectionOnce() {
    PAPITransformer.Aggregation agg = new PAPITransformer.Aggregation();
    agg.source('certifications');
    agg.fail('certifications');
    agg.fail('certifications');
    agg.fail('education');

    Assert.isFalse(agg.isComplete(), 'Two sections failed');
    Assert.areEqual('partial', agg.integrity(), 'Header value');
    Assert.areEqual(
      'partial: certifications, education unavailable',
      agg.integrityNote(),
      'Failed sections are listed once, in order'
    );
  }

  @IsTest
  static void aggregationTreatsUnknownSourceAsNoStore() {
    PAPITransformer.Aggregation agg = new PAPITransformer.Aggregation();
    agg.source('skills');
    agg.source('not-a-resource');

    Assert.areEqual(
      ApiRequestContext.CachePolicy.NO_STORE,
      agg.cachePolicy(),
      'An unmapped source is assumed to be no-store'
    );
  }

  @IsTest
  static void guardSectionThrowsOnlyForForcedSections() {
    PAPITransformer.forcedSectionFailures.add('skills');

    PAPITransformer.guardSection('projects');
    try {
      PAPITransformer.guardSection('skills');
      Assert.fail('Expected SectionUnavailableException');
    } catch (PAPITransformer.SectionUnavailableException e) {
      Assert.isTrue(
        e.getMessage().contains('skills'),
        'Message names the section'
      );
    }
  }
}
