/**
 * @description       : Checks the PAPI reads and the API Lab option reads against their
 *                      Query_Definition__mdt records: each record passes validation, ships
 *                      active and equal to its code default, and serves its read. The PAPI
 *                      experience highlights are a second read now, and the payload tests
 *                      compare them with the child query the endpoints ran before, on the
 *                      same data.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/24/2026
 **/
@IsTest
private class ApiQueryDefinitionsTest {
  private static final Integer READ_COUNT = 27;
  private static final String RECORD = 'record';

  private static List<QueryDefinitions.Provider> apiProviders() {
    return new List<QueryDefinitions.Provider>{
      new PAPIProfile(),
      new PAPIProjects(),
      new PAPIResume(),
      new PAPITestimonialFeed(),
      new ApiLabOptionsController()
    };
  }

  private static Map<String, QueryDefinitions.QueryDefault> apiDefaults() {
    Map<String, QueryDefinitions.QueryDefault> defaults = new Map<String, QueryDefinitions.QueryDefault>();
    for (QueryDefinitions.Provider provider : apiProviders()) {
      defaults.putAll(provider.queryDefaults());
    }
    return defaults;
  }

  private static String normal(String text) {
    return text == null ? '' : text.normalizeSpace();
  }

  @TestSetup
  static void setup() {
    Contact owner = new Contact(
      FirstName = 'Query',
      LastName = 'Owner',
      Is_Portfolio_Owner__c = true,
      LinkedIn_URL__c = 'https://linkedin.com/in/query-owner'
    );
    insert owner;
    Account employer = new Account(Name = 'Query Employer');
    insert employer;

    Experience__c current = new Experience__c(
      Employer__c = employer.Id,
      Name = 'Query Architect',
      Start_Date__c = Date.today().addYears(-2),
      Is_Current_Role__c = true,
      Sort_Order__c = 1,
      Contact__c = owner.Id
    );
    Experience__c past = new Experience__c(
      Employer__c = employer.Id,
      Name = 'Query Developer',
      Start_Date__c = Date.today().addYears(-6),
      End_Date__c = Date.today().addYears(-2),
      Is_Current_Role__c = false,
      Sort_Order__c = 2,
      Contact__c = owner.Id
    );
    insert new List<Experience__c>{ current, past };

    // Inserted out of order, with mixed tags and more than five on one role, so the
    // order, the persona filter and the cap of five all show in the comparison.
    List<Experience_Highlight__c> highlights = new List<Experience_Highlight__c>();
    List<Integer> order = new List<Integer>{ 4, 1, 6, 2, 5, 3, 7 };
    for (Integer i = 0; i < order.size(); i++) {
      highlights.add(
        new Experience_Highlight__c(
          Experience__c = current.Id,
          Name = 'Current ' + order[i],
          Description__c = 'Current highlight ' + order[i],
          Persona_Tag__c = Math.mod(order[i], 2) == 0
            ? 'Architect'
            : 'Developer',
          Sort_Order__c = order[i]
        )
      );
    }
    highlights.add(
      new Experience_Highlight__c(
        Experience__c = past.Id,
        Name = 'Past 2',
        Description__c = 'Past highlight 2',
        Persona_Tag__c = 'Architect',
        Sort_Order__c = 2
      )
    );
    highlights.add(
      new Experience_Highlight__c(
        Experience__c = past.Id,
        Name = 'Past 1',
        Description__c = 'Past highlight 1',
        Persona_Tag__c = 'Developer',
        Sort_Order__c = 1
      )
    );
    insert highlights;

    Skill__c skill = new Skill__c(
      Name = 'Query Apex',
      Category__c = 'Backend',
      Proficiency__c = 5,
      Category_Order__c = 1
    );
    insert skill;
    insert new Experience_Skill__c(
      Experience__c = current.Id,
      Skill__c = skill.Id
    );

    Project__c project = new Project__c(
      Name = 'Query Project',
      Status__c = 'Live – In Production',
      Is_Featured__c = true,
      Sort_Order__c = 1
    );
    insert project;
    insert new Project_Skill__c(Project__c = project.Id, Skill__c = skill.Id);

    insert new Testimonial__c(
      Author_Name__c = 'Query Manager',
      Approved__c = true,
      Vibe_Mode__c = 'Professional',
      Relationship_Type__c = 'Manager',
      Sort_Order__c = 1
    );
  }

  // The highlight texts per experience Id as the endpoints read them before: one child
  // query ordered by Sort_Order__c.
  private static Map<String, List<String>> childQueryHighlights() {
    Map<String, List<String>> result = new Map<String, List<String>>();
    for (Experience__c exp : [
      SELECT
        Id,
        (
          SELECT Description__c
          FROM Experience_Highlights__r
          ORDER BY Sort_Order__c ASC
        )
      FROM Experience__c
    ]) {
      List<String> texts = new List<String>();
      for (Experience_Highlight__c h : exp.Experience_Highlights__r) {
        texts.add(h.Description__c);
      }
      result.put(exp.Id, texts);
    }
    return result;
  }

  // The resume's highlight lines as the child query gave them: a persona filter, five at most.
  private static List<String> childQueryResumeLines(String persona) {
    List<String> lines = new List<String>();
    for (Experience__c exp : [
      SELECT
        Id,
        (
          SELECT Description__c, Persona_Tag__c
          FROM Experience_Highlights__r
          ORDER BY Sort_Order__c ASC
        )
      FROM Experience__c
      ORDER BY Is_Current_Role__c DESC, End_Date__c DESC NULLS FIRST
      LIMIT 10
    ]) {
      Integer printed = 0;
      for (Experience_Highlight__c h : exp.Experience_Highlights__r) {
        if (printed >= 5) {
          break;
        }
        if (
          String.isBlank(persona) ||
          (h.Persona_Tag__c != null && h.Persona_Tag__c.contains(persona))
        ) {
          lines.add('- ' + h.Description__c);
          printed++;
        }
      }
    }
    return lines;
  }

  private static List<String> highlightLines(String text) {
    List<String> lines = new List<String>();
    for (String line : text.split('\n')) {
      if (line.startsWith('- ')) {
        lines.add(line);
      }
    }
    return lines;
  }

  private static Map<String, Object> get(String uri) {
    RestTestUtil.initGet(uri);
    PAPIProfile.getProfile();
    return RestTestUtil.getBodyAsMap();
  }

  @IsTest
  static void everyApiRecordPassesValidation() {
    Set<String> names = apiDefaults().keySet();

    Test.startTest();
    List<String> failures = QueryDefinitions.validateAll();
    Test.stopTest();

    List<String> mine = new List<String>();
    for (String failure : failures) {
      if (names.contains(failure.substringBefore(':'))) {
        mine.add(failure);
      }
    }
    Assert.areEqual(
      new List<String>(),
      mine,
      'Every PAPI and API Lab option record passes its code default'
    );
  }

  @IsTest
  static void everyApiReadHasAnActiveRecord() {
    Map<String, QueryDefinitions.QueryDefault> defaults = apiDefaults();
    Map<String, Query_Definition__mdt> records = Query_Definition__mdt.getAll();

    Assert.areEqual(READ_COUNT, defaults.size(), 'One default per read');
    for (String name : defaults.keySet()) {
      Assert.isTrue(records.containsKey(name), 'Record ships for ' + name);
      Assert.isTrue(records.get(name).Active__c, name + ' ships active');
    }
  }

  @IsTest
  static void everyApiRecordShipsEqualToItsDefault() {
    Map<String, QueryDefinitions.QueryDefault> defaults = apiDefaults();
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
      WHERE DeveloperName IN :defaults.keySet()
    ]) {
      records.put(record.DeveloperName, record);
    }

    Assert.areEqual(READ_COUNT, records.size(), 'Every record read');
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

  @IsTest
  static void everyPapiReadIsServedByItsRecord() {
    Test.startTest();
    get('/services/apexrest/papi/v1/profile/full');
    RestTestUtil.initGet('/services/apexrest/papi/v1/resume/generate');
    PAPIResume.getResume();
    RestTestUtil.initGet('/services/apexrest/papi/v1/projects/featured');
    PAPIProjects.getProjects();
    RestTestUtil.initGet('/services/apexrest/papi/v1/projects');
    PAPIProjects.getProjects();
    RestTestUtil.initGet(
      '/services/apexrest/papi/v1/testimonials/feed',
      new Map<String, String>{ 'mode' => 'casual' }
    );
    PAPITestimonialFeed.getFeed();
    RestTestUtil.initGet('/services/apexrest/papi/v1/testimonials/feed');
    PAPITestimonialFeed.getFeed();
    Test.stopTest();

    for (String name : apiDefaults().keySet()) {
      if (name.startsWith('ApiLabOptionsController_')) {
        continue;
      }
      Assert.areEqual(
        RECORD,
        QueryDefinitions.sourceByName.get(name),
        name + ' is served by its record'
      );
    }
  }

  @IsTest
  static void profileHighlightsMatchTheChildQuery() {
    Map<String, List<String>> expected = childQueryHighlights();

    Test.startTest();
    Map<String, Object> body = get('/services/apexrest/papi/v1/profile/full');
    Test.stopTest();

    List<Object> experiences = (List<Object>) body.get('experience');
    Assert.areEqual(expected.size(), experiences.size(), 'Every experience');
    for (Object item : experiences) {
      Map<String, Object> exp = (Map<String, Object>) item;
      Assert.areEqual(
        JSON.serialize(expected.get((String) exp.get('id'))),
        JSON.serialize(exp.get('highlights')),
        'The same highlights in the same order for ' + exp.get('role')
      );
    }
    Assert.areEqual('complete', body.get('integrityNote'), 'Nothing failed');
  }

  @IsTest
  static void summaryHighlightsMatchTheChildQuery() {
    Map<String, List<String>> expected = childQueryHighlights();

    Test.startTest();
    Map<String, Object> body = get(
      '/services/apexrest/papi/v1/profile/summary'
    );
    Test.stopTest();

    for (Object item : (List<Object>) body.get('experience')) {
      Map<String, Object> exp = (Map<String, Object>) item;
      Assert.areEqual(
        JSON.serialize(expected.get((String) exp.get('id'))),
        JSON.serialize(exp.get('highlights')),
        'The same summary highlights for ' + exp.get('role')
      );
    }
  }

  @IsTest
  static void resumeHighlightLinesMatchTheChildQuery() {
    List<String> expected = childQueryResumeLines(null);

    Test.startTest();
    RestTestUtil.initGet('/services/apexrest/papi/v1/resume/generate');
    PAPIResume.getResume();
    Test.stopTest();

    String text = (String) RestTestUtil.getBodyAsMap().get('generatedText');
    Assert.areEqual(7, expected.size(), 'Five from the current role, two past');
    Assert.areEqual(expected, highlightLines(text), 'The same lines in order');
  }

  @IsTest
  static void resumePersonaHighlightLinesMatchTheChildQuery() {
    List<String> expected = childQueryResumeLines('Architect');

    Test.startTest();
    RestTestUtil.initGet(
      '/services/apexrest/papi/v1/resume/generate',
      new Map<String, String>{ 'persona' => 'Architect' }
    );
    PAPIResume.getResume();
    Test.stopTest();

    String text = (String) RestTestUtil.getBodyAsMap().get('generatedText');
    Assert.areEqual(
      4,
      expected.size(),
      'Three tagged current, one tagged past'
    );
    Assert.areEqual(expected, highlightLines(text), 'The same tagged lines');
  }

  @IsTest
  static void experienceFailureStillEmptiesTheSection() {
    PAPITransformer.forcedSectionFailures.add('experience');

    Test.startTest();
    Map<String, Object> body = get('/services/apexrest/papi/v1/profile/full');
    Test.stopTest();

    Assert.areEqual(
      0,
      ((List<Object>) body.get('experience')).size(),
      'No experience'
    );
    Assert.areEqual(
      ApiMessages.partial(new List<String>{ 'experience' }),
      body.get('integrityNote'),
      'The experience section is named as before'
    );
  }
}
