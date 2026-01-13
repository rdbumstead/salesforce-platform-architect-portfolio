/**
 * @description       : Unit tests for PortfolioAgentService.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/13/2025
 **/
@IsTest
private class PortfolioAgentServiceTest {
  @testSetup
  static void makeData() {
    // 1. Contact
    Contact c = new Contact(
      LastName = 'Bumstead',
      Title = 'Architect',
      Email = 'test@example.com'
    );
    insert c;

    // 2. Account (Employer/Issuer)
    Account employer = new Account(Name = 'Tech Corp');
    insert employer;

    // 3. Experience (Using 'Name' for Title)
    Experience__c job = new Experience__c(
      Name = 'Senior Dev',
      Contact__c = c.Id,
      Employer__c = employer.Id,
      Start_Date__c = Date.today().addYears(-2),
      Is_Current_Role__c = true
    );
    insert job;

    // 4. Experience Highlight
    Experience_Highlight__c highlight = new Experience_Highlight__c(
      Name = 'Highlight 1',
      Experience__c = job.Id,
      Description__c = 'Reduced deploy time',
      Sort_Order__c = 1
    );
    insert highlight;

    // 5. Education (Using 'Name' for Degree)
    Education__c edu = new Education__c(
      Name = 'BS Computer Science',
      Contact__c = c.Id,
      Issuer__c = employer.Id,
      Graduation_Date__c = Date.today().addYears(-5)
    );
    insert edu;

    // 6. Certification
    Certification__c cert = new Certification__c(
      Name = 'Salesforce Architect',
      Contact__c = c.Id,
      Issuer__c = employer.Id,
      Earned_Date__c = Date.today().addYears(-1)
    );
    insert cert;

    // 7. Skill & Project
    Skill__c apex = new Skill__c(Name = 'Apex', Proficiency__c = 90);
    insert apex;

    Project__c proj = new Project__c(
      Name = 'Portfolio Site',
      Contact__c = c.Id,
      Challenge__c = 'Need a job',
      Solution__c = 'Built a site',
      Business_Value__c = 'Got hired',
      Sort_Order__c = 1
    );
    insert proj;

    Project_Skill__c ps = new Project_Skill__c(
      Project__c = proj.Id,
      Skill__c = apex.Id
    );
    insert ps;

    // 8. Testimonial (Using Context__c, not Company__c)
    Testimonial__c t1 = new Testimonial__c(
      Name = 'T1',
      Contact__c = c.Id,
      Context__c = 'Manager',
      Author_Name__c = 'Jane Doe',
      Author_Title__c = 'CTO',
      Approved__c = true,
      Sort_Order__c = 1
    );
    insert t1;
  }

  @IsTest
  static void testGetPortfolioContext_HappyPath() {
    Contact c = [SELECT Id FROM Contact LIMIT 1];
    PortfolioAgentService.PortfolioContextRequest req = new PortfolioAgentService.PortfolioContextRequest();
    req.contactId = c.Id;

    Test.startTest();
    List<PortfolioAgentService.PortfolioContextResult> results = PortfolioAgentService.getPortfolioContext(
      new List<PortfolioAgentService.PortfolioContextRequest>{ req }
    );
    Test.stopTest();

    Assert.areEqual(1, results.size());
    String jsonString = results[0].jsonContext;

    System.debug('JSON Output: ' + jsonString);

    // Assertions based on verified fields
    Assert.isTrue(
      jsonString.contains('Senior Dev'),
      'Should find Experience Name'
    );
    Assert.isTrue(
      jsonString.contains('BS Computer Science'),
      'Should find Degree Name'
    );
    Assert.isTrue(
      jsonString.contains('Salesforce Architect'),
      'Should find Cert Name'
    );
    Assert.isTrue(
      jsonString.contains('Portfolio Site'),
      'Should find Project Name'
    );
    Assert.isTrue(
      jsonString.contains('Jane Doe'),
      'Should find Testimonial Author'
    );
  }

  @IsTest
  static void testGetPortfolioContext_InvalidId() {
    PortfolioAgentService.PortfolioContextRequest req = new PortfolioAgentService.PortfolioContextRequest();
    req.contactId = '003000000000000AAA'; // Fake ID

    Test.startTest();
    List<PortfolioAgentService.PortfolioContextResult> results = PortfolioAgentService.getPortfolioContext(
      new List<PortfolioAgentService.PortfolioContextRequest>{ req }
    );
    Test.stopTest();

    Assert.isTrue(
      results[0].jsonContext.contains('ERROR'),
      'Should return Error JSON'
    );
  }
}
