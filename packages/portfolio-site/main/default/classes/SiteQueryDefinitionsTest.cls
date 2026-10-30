/**
 * @description       : Checks the site's content reads against their Query_Definition__mdt
 *                      records: each record ships active and equal to its code default, every
 *                      deployed record passes QueryDefinitions.validateAll(), and every guest
 *                      facing class reads through its records when the site guest calls it.
 *                      Also proves the resume's split role and highlight reads build the same
 *                      roles as one read with a highlights subquery, for every persona.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/24/2026
 **/
@IsTest
private class SiteQueryDefinitionsTest {
  private static final String RECORD = 'record';

  @TestSetup
  static void setup() {
    SiteGuestTestSupport.createResumeGraph();
    insert new Project__c(
      Name = 'Grounding Project',
      Sort_Order__c = 3,
      Is_Featured__c = true,
      Status__c = 'Active Development',
      Pillar__c = 'E',
      Headline_Metric_Source__c = ProjectCardController.SOURCE_APEX_TESTS,
      Headline_Metric_Label__c = '{n} tests',
      Home_Sort__c = 1,
      Case_Metric_Source__c = ProjectCardController.SOURCE_PRODUCTION_DEPLOYS,
      Case_Metric_Label__c = '{n} deploys'
    );
  }

  // Every site class that reads content through query definitions, one instance each.
  private static List<QueryDefinitions.Provider> siteProviders() {
    return new List<QueryDefinitions.Provider>{
      new ResumeController(),
      new PortfolioGroundingService(),
      new ProjectCardController(),
      new GovernanceController(),
      new DeliveryController(),
      new SourceController(),
      new TestimonialController(),
      new SkillGraphController()
    };
  }

  private static Map<String, QueryDefinitions.QueryDefault> siteDefaults() {
    Map<String, QueryDefinitions.QueryDefault> defaults = new Map<String, QueryDefinitions.QueryDefault>();
    for (QueryDefinitions.Provider provider : siteProviders()) {
      defaults.putAll(provider.queryDefaults());
    }
    return defaults;
  }

  private static String normal(String text) {
    return text == null ? '' : text.normalizeSpace();
  }

  private static void assertReadFromRecords(List<String> names) {
    for (String name : names) {
      Assert.areEqual(
        RECORD,
        QueryDefinitions.sourceByName.get(name),
        name + ' is read through its record'
      );
    }
  }

  @IsTest
  static void everySiteReadHasAnActiveRecord() {
    Map<String, QueryDefinitions.QueryDefault> defaults = siteDefaults();
    Map<String, Query_Definition__mdt> records = Query_Definition__mdt.getAll();

    Assert.areEqual(23, defaults.size(), 'Twenty three site content reads');
    for (String name : defaults.keySet()) {
      Assert.isTrue(records.containsKey(name), 'Record ships for ' + name);
      Assert.isTrue(records.get(name).Active__c, name + ' ships active');
    }
  }

  @IsTest
  static void everySiteRecordShipsEqualToItsDefault() {
    Map<String, QueryDefinitions.QueryDefault> defaults = siteDefaults();
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
      Assert.isNotNull(record, 'Record ships for ' + name);
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
  static void theSplitRoleReadBuildsTheSameRolesAsOneSubqueryRead() {
    // The roles as one read with the highlights as a child subquery.
    List<Experience__c> withChildren = [
      SELECT
        Id,
        Name,
        Employer__r.Name,
        Start_Date__c,
        End_Date__c,
        Is_Current_Role__c,
        Is_Remote__c,
        (
          SELECT
            Experience__c,
            Description__c,
            Persona_Tag__c,
            Sort_Order__c,
            Admin_Sort_Order__c,
            Developer_Sort_Order__c,
            Architect_Sort_Order__c,
            Lock_Sort_Across_Personas__c
          FROM Experience_Highlights__r
        )
      FROM Experience__c
      ORDER BY
        Is_Current_Role__c DESC,
        Start_Date__c DESC NULLS LAST,
        Sort_Order__c ASC
    ];
    Map<Id, List<Experience_Highlight__c>> children = new Map<Id, List<Experience_Highlight__c>>();
    for (Experience__c experience : withChildren) {
      children.put(experience.Id, experience.Experience_Highlights__r);
    }

    for (
      String persona : new List<String>{
        null,
        'Admin',
        'Developer',
        'Architect'
      }
    ) {
      String expected = JSON.serialize(
        ResumeController.toRoles(withChildren, children, persona)
      );
      String actual = JSON.serialize(ResumeController.getResume(persona).roles);
      Assert.areEqual(expected, actual, 'Same roles for persona ' + persona);
    }
  }

  @IsTest
  static void theGuestReadsTheResumeThroughItsRecords() {
    User guest = SiteGuestTestSupport.preparedGuest();
    ResumeController.ResumeData resume;
    ResumeController.Timeline timeline;

    Test.startTest();
    System.runAs(guest) {
      resume = ResumeController.getResume(null);
      timeline = ResumeController.getTimeline();
    }
    Test.stopTest();

    Assert.areEqual(3, resume.roles.size(), 'Three roles');
    Assert.areEqual(3, timeline.work.size(), 'Three timeline roles');
    assertReadFromRecords(
      new List<String>(new ResumeController().queryDefaults().keySet())
    );
  }

  @IsTest
  static void theGuestReadsTheGroundingThroughItsRecords() {
    User guest = SiteGuestTestSupport.preparedGuest();
    String facts;

    Test.startTest();
    System.runAs(guest) {
      facts = PortfolioGroundingService.build('Architect', 'Grounding work');
    }
    Test.stopTest();

    Assert.isTrue(facts.contains('Grounding Project'), 'The project grounds');
    assertReadFromRecords(
      new List<String>(new PortfolioGroundingService().queryDefaults().keySet())
    );
  }

  @IsTest
  static void theGuestReadsThePillarCardsThroughItsRecords() {
    User guest = SiteGuestTestSupport.preparedGuest();
    List<ProjectCardController.PillarCard> cards;
    List<ProjectCardController.CaseStudy> caseStudies;
    ProjectCardController.BuildCounts counts;

    Test.startTest();
    System.runAs(guest) {
      cards = ProjectCardController.getPillarCards();
      caseStudies = ProjectCardController.getHomeCaseStudies();
      counts = ProjectCardController.getBuildCounts();
    }
    Test.stopTest();

    Assert.areEqual(1, cards.size(), 'One pillar card');
    Assert.areEqual(1, caseStudies.size(), 'One project has a home sort');
    Assert.isNotNull(counts, 'The build counts come back');
    assertReadFromRecords(
      new List<String>(new ProjectCardController().queryDefaults().keySet())
    );
  }

  @IsTest
  static void theGuestReadsTheChecklistThroughItsRecords() {
    User guest = SiteGuestTestSupport.preparedGuest();

    Test.startTest();
    System.runAs(guest) {
      GovernanceController.getPipelineStatus();
    }
    Test.stopTest();

    assertReadFromRecords(
      new List<String>(new GovernanceController().queryDefaults().keySet())
    );
  }

  @IsTest
  static void theGuestReadsTheDeliveryFeedsThroughItsRecords() {
    User guest = SiteGuestTestSupport.preparedGuest();

    Test.startTest();
    System.runAs(guest) {
      DeliveryController.getRecentCommits(false);
      DeliveryController.getRoadmap(false);
    }
    Test.stopTest();

    assertReadFromRecords(
      new List<String>(new DeliveryController().queryDefaults().keySet())
    );
  }

  @IsTest
  static void theGuestReadsTheSourceCacheThroughItsRecords() {
    User guest = SiteGuestTestSupport.preparedGuest();
    Source_File__mdt file = SourceController.configuredFiles()[0];
    insert new Source_Cache__c(
      Path__c = file.Path__c,
      Content__c = 'cached text',
      Fetched_At__c = System.now()
    );

    Test.startTest();
    System.runAs(guest) {
      SourceController.getSourceFiles(file.Source_Key__c);
      SourceController.getDocs();
    }
    Test.stopTest();

    assertReadFromRecords(
      new List<String>(new SourceController().queryDefaults().keySet())
    );
  }

  @IsTest
  static void theGuestReadsTheWallThroughItsRecord() {
    User guest = SiteGuestTestSupport.preparedGuest();

    Test.startTest();
    System.runAs(guest) {
      TestimonialController.getApprovedTestimonials();
    }
    Test.stopTest();

    assertReadFromRecords(
      new List<String>(new TestimonialController().queryDefaults().keySet())
    );
  }

  @IsTest
  static void theGuestCanReadALongRecordAgainInFull() {
    User guest = SiteGuestTestSupport.preparedGuest();
    Query_Definition__mdt full = [
      SELECT DeveloperName, Fields__c
      FROM Query_Definition__mdt
      WHERE DeveloperName = 'ResumeController_Owner'
    ];
    // Stands in for what getAll() returns for a long field: the first 255 characters.
    Query_Definition__mdt cut = new Query_Definition__mdt(
      DeveloperName = full.DeveloperName,
      Fields__c = full.Fields__c.rightPad(255, ' ')
    );
    Map<String, Query_Definition__mdt> reread;

    Test.startTest();
    System.runAs(guest) {
      reread = QueryDefinitions.withFullText(
        new Map<String, Query_Definition__mdt>{ full.DeveloperName => cut }
      );
    }
    Test.stopTest();

    Assert.areEqual(
      full.Fields__c,
      reread.get(full.DeveloperName).Fields__c,
      'The guest reads the record again in full'
    );
  }
}
