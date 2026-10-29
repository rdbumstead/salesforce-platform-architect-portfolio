/**
 * @description       : Test data and assertion helpers for the SAPI resource tests.
 *                      Builds one small record graph covering every object the ten
 *                      resources read, and holds the spec schema key sets.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 * @Test Class        : [SapiTestData]
 **/
@IsTest
public class SapiTestData {
  public static final String EMPLOYER_NAME = 'Acme Employer';
  public static final String UNIVERSITY_NAME = 'State University';
  public static final String OWNER_FIRST_NAME = 'Ryan';
  public static final String OWNER_LAST_NAME = 'Owner';
  public static final String OWNER_NAME = 'Ryan Owner';
  public static final String OTHER_NAME = 'Pat Other';
  public static final String EXPERIENCE_ONE = 'Technical Architect';
  public static final String EXPERIENCE_TWO = 'Salesforce Developer';
  public static final String PROJECT_ONE = 'Project One';
  public static final String PROJECT_TWO = 'Project Two';
  public static final String SKILL_APEX = 'Apex';
  public static final String SKILL_LWC = 'LWC';
  public static final String CERT_ONE = 'Platform Developer I';
  public static final String CERT_TWO = 'Application Architect';
  public static final String DEGREE_ONE = 'Bachelor of Science';
  public static final String DEGREE_TWO = 'Master of Business Administration';

  // Response schema keys, copied from salesforce-sapi.yaml components.schemas. Keys with
  // no granted Salesforce source are left out and logged as [conflict] (Contact accountId,
  // accountName).
  // No email or phone: never returned (owner decision, 2026-10-21).
  public static final Set<String> CONTACT_KEYS = new Set<String>{
    'id',
    'key',
    'name',
    'title',
    'trailhead',
    'careerObjective',
    'linkedIn',
    'portfolio'
  };
  public static final Set<String> ACCOUNT_KEYS = new Set<String>{
    'id',
    'key',
    'name',
    'industry',
    'abbreviation'
  };
  public static final Set<String> EXPERIENCE_HIGHLIGHT_KEYS = new Set<String>{
    'id',
    'key',
    'experienceId',
    'experienceName',
    'experienceKey',
    'name',
    'description',
    'sortOrder',
    'personaTag'
  };
  public static final Set<String> PROJECT_ASSET_KEYS = new Set<String>{
    'id',
    'key',
    'name',
    'projectId',
    'projectName',
    'projectKey',
    'type',
    'externalUrl',
    'altText',
    'sortOrder'
  };
  public static final Set<String> CERTIFICATION_KEYS = new Set<String>{
    'id',
    'key',
    'name',
    'contactId',
    'contactName',
    'contactKey',
    'issuerId',
    'issuerName',
    'issuerKey',
    'earnedDate'
  };
  public static final Set<String> EDUCATION_KEYS = new Set<String>{
    'id',
    'key',
    'name',
    'contactId',
    'contactName',
    'contactKey',
    'issuerId',
    'issuerName',
    'issuerKey',
    'fieldOfStudy',
    'graduationDate',
    'gpa'
  };
  public static final Set<String> PROJECT_SKILL_KEYS = new Set<String>{
    'id',
    'key',
    'projectId',
    'projectName',
    'projectKey',
    'skillId',
    'skillName',
    'skillKey',
    'skillCategory',
    'skillProficiencyScore'
  };
  public static final Set<String> EXPERIENCE_SKILL_KEYS = new Set<String>{
    'id',
    'key',
    'experienceId',
    'experienceName',
    'experienceKey',
    'skillId',
    'skillName',
    'skillKey',
    'skillCategory',
    'skillProficiencyScore'
  };
  public static final Set<String> CERTIFICATION_SKILL_KEYS = new Set<String>{
    'id',
    'key',
    'certificationId',
    'certificationName',
    'certificationKey',
    'skillId',
    'skillName',
    'skillKey',
    'skillCategory',
    'skillProficiencyScore'
  };
  // No owner email or phone: never returned (owner decision).
  public static final Set<String> PORTFOLIO_CONFIG_KEYS = new Set<String>{
    'linkedInUrl',
    'gitHubProfileUrl',
    'calendlyUrl',
    'trailblazerProfileUrl',
    'personalWebsiteUrl',
    'careerObjective',
    'jiraProjectKey',
    'gitHubRepoPath'
  };

  /**
   * @description Inserts the record graph. Counts the tests rely on:
   *              Accounts 2; Contacts 2 (1 owner); Experience 2; Highlights 3 (2 on
   *              experience one; Architect tagged on 2, Admin or Developer on 2);
   *              Projects 2; Assets 3 (2 on project one); Skills 2; Project skills 3
   *              (2 on project one); Experience skills 3 (2 on experience one);
   *              Certifications 2 (1 owner, 1 per issuer); Certification skills 3
   *              (2 on cert one); Education 2 (1 owner, 1 per issuer).
   */
  public static void createGraph() {
    Account employer = new Account(
      Name = EMPLOYER_NAME,
      Industry = 'Technology',
      Abbreviation__c = 'ACME'
    );
    Account university = new Account(
      Name = UNIVERSITY_NAME,
      Industry = 'Education'
    );
    insert new List<Account>{ employer, university };

    Contact owner = new Contact(
      FirstName = OWNER_FIRST_NAME,
      LastName = OWNER_LAST_NAME,
      Email = 'owner@example.com',
      Phone = '+1 555-0199',
      Title = 'Platform Architect',
      Is_Portfolio_Owner__c = true,
      AccountId = employer.Id
    );
    Contact other = new Contact(
      FirstName = 'Pat',
      LastName = 'Other',
      Is_Portfolio_Owner__c = false
    );
    insert new List<Contact>{ owner, other };

    Experience__c expOne = new Experience__c(
      Name = EXPERIENCE_ONE,
      Employer__c = employer.Id,
      Contact__c = owner.Id,
      Start_Date__c = Date.today().addYears(-1),
      Is_Current_Role__c = true,
      Sort_Order__c = 1
    );
    Experience__c expTwo = new Experience__c(
      Name = EXPERIENCE_TWO,
      Employer__c = employer.Id,
      Contact__c = owner.Id,
      Start_Date__c = Date.today().addYears(-4),
      End_Date__c = Date.today().addYears(-1),
      Is_Current_Role__c = false,
      Sort_Order__c = 2
    );
    insert new List<Experience__c>{ expOne, expTwo };

    insert new List<Experience_Highlight__c>{
      new Experience_Highlight__c(
        Name = 'Release automation',
        Experience__c = expOne.Id,
        Description__c = 'Built the CI pipeline.',
        Persona_Tag__c = 'Admin',
        Sort_Order__c = 1
      ),
      new Experience_Highlight__c(
        Name = 'API layer',
        Experience__c = expOne.Id,
        Description__c = 'Designed the system API.',
        Persona_Tag__c = 'Developer;Architect',
        Sort_Order__c = 2
      ),
      new Experience_Highlight__c(
        Name = 'Data model',
        Experience__c = expTwo.Id,
        Description__c = 'Owned the data model.',
        Persona_Tag__c = 'Architect',
        Sort_Order__c = 1
      )
    };

    Skill__c apex = new Skill__c(
      Name = SKILL_APEX,
      Category__c = 'Backend',
      Proficiency__c = 5,
      Category_Order__c = 10
    );
    Skill__c lwc = new Skill__c(
      Name = SKILL_LWC,
      Category__c = 'Frontend',
      Proficiency__c = 4,
      Category_Order__c = 20
    );
    insert new List<Skill__c>{ apex, lwc };

    Project__c projOne = new Project__c(
      Name = PROJECT_ONE,
      Contact__c = owner.Id,
      Sort_Order__c = 1
    );
    Project__c projTwo = new Project__c(
      Name = PROJECT_TWO,
      Contact__c = owner.Id,
      Sort_Order__c = 2
    );
    insert new List<Project__c>{ projOne, projTwo };

    insert new List<Project_Asset__c>{
      new Project_Asset__c(
        Name = 'Architecture Diagram',
        Project__c = projOne.Id,
        Type__c = 'Image',
        External_URL__c = 'https://example.com/arch.png',
        Alt_Text__c = 'System context diagram',
        Sort_Order__c = 1
      ),
      new Project_Asset__c(
        Name = 'Demo Video',
        Project__c = projOne.Id,
        Type__c = 'Video',
        External_URL__c = 'https://example.com/demo',
        Alt_Text__c = 'Walkthrough video',
        Sort_Order__c = 2
      ),
      new Project_Asset__c(
        Name = 'Repository',
        Project__c = projTwo.Id,
        Type__c = 'Link',
        External_URL__c = 'https://example.com/repo',
        Alt_Text__c = 'Source repository'
      )
    };

    insert new List<Project_Skill__c>{
      new Project_Skill__c(Project__c = projOne.Id, Skill__c = apex.Id),
      new Project_Skill__c(Project__c = projOne.Id, Skill__c = lwc.Id),
      new Project_Skill__c(Project__c = projTwo.Id, Skill__c = apex.Id)
    };

    insert new List<Experience_Skill__c>{
      new Experience_Skill__c(Experience__c = expOne.Id, Skill__c = apex.Id),
      new Experience_Skill__c(Experience__c = expOne.Id, Skill__c = lwc.Id),
      new Experience_Skill__c(Experience__c = expTwo.Id, Skill__c = lwc.Id)
    };

    Certification__c certOne = new Certification__c(
      Name = CERT_ONE,
      Contact__c = owner.Id,
      Issuer__c = employer.Id,
      Earned_Date__c = Date.newInstance(2024, 5, 15)
    );
    Certification__c certTwo = new Certification__c(
      Name = CERT_TWO,
      Contact__c = other.Id,
      Issuer__c = university.Id,
      Earned_Date__c = Date.newInstance(2023, 1, 10)
    );
    insert new List<Certification__c>{ certOne, certTwo };

    insert new List<Certification_Skill__c>{
      new Certification_Skill__c(
        Certification__c = certOne.Id,
        Skill__c = apex.Id
      ),
      new Certification_Skill__c(
        Certification__c = certOne.Id,
        Skill__c = lwc.Id
      ),
      new Certification_Skill__c(
        Certification__c = certTwo.Id,
        Skill__c = apex.Id
      )
    };

    insert new List<Education__c>{
      new Education__c(
        Name = DEGREE_ONE,
        Contact__c = owner.Id,
        Issuer__c = university.Id,
        Field_of_Study__c = 'Computer Science',
        Graduation_Date__c = Date.newInstance(2018, 5, 1),
        GPA__c = 3.8
      ),
      new Education__c(
        Name = DEGREE_TWO,
        Contact__c = other.Id,
        Issuer__c = employer.Id,
        Field_of_Study__c = 'Business',
        Graduation_Date__c = Date.newInstance(2021, 6, 1)
      )
    };
  }

  /**
   * @description Sets up a GET on /services/apexrest/sapi/v1/{resource}/ with valid tracing headers.
   * @param resource Path segment, e.g. "accounts".
   * @param params Query parameters, or null.
   */
  public static void get(String resource, Map<String, String> params) {
    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/' + resource + '/',
      params
    );
  }

  /**
   * @description Response body text, for assertion messages.
   * @return String The body, or an empty string.
   */
  public static String bodyText() {
    RestResponse res = RestContext.response;
    return res?.responseBody == null ? '' : res.responseBody.toString();
  }

  /**
   * @description Parses the current response body as a JSON array of objects.
   * @return List<Map<String, Object>> The rows.
   */
  public static List<Map<String, Object>> bodyAsList() {
    List<Map<String, Object>> rows = new List<Map<String, Object>>();
    for (
      Object row : (List<Object>) JSON.deserializeUntyped(
        RestContext.response.responseBody.toString()
      )
    ) {
      rows.add((Map<String, Object>) row);
    }
    return rows;
  }

  /**
   * @description Asserts every row carries exactly the expected schema keys.
   * @param expected Spec schema keys.
   * @param rows Parsed rows.
   */
  public static void assertRowKeys(
    Set<String> expected,
    List<Map<String, Object>> rows
  ) {
    Assert.isFalse(rows.isEmpty(), 'Expected at least one row to check keys');
    for (Map<String, Object> row : rows) {
      Assert.areEqual(
        expected,
        row.keySet(),
        'Row keys must equal the spec schema keys'
      );
    }
  }

  /**
   * @description Asserts every row has the given value for a key.
   * @param rows Parsed rows.
   * @param key Schema key.
   * @param expected Expected value.
   */
  public static void assertEveryRow(
    List<Map<String, Object>> rows,
    String key,
    Object expected
  ) {
    for (Map<String, Object> row : rows) {
      Assert.areEqual(expected, row.get(key), 'Filter must apply to ' + key);
    }
  }

  /**
   * @description Asserts the current response is the standard Error payload.
   * @param status Expected HTTP status.
   * @param errorCode Expected error code.
   */
  public static void assertError(Integer status, String errorCode) {
    RestResponse res = RestContext.response;
    Assert.areEqual(status, res.statusCode, 'Status. Body: ' + bodyText());
    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.areEqual(errorCode, body.get('errorCode'), 'Error code');
    Assert.areEqual(
      status >= 500,
      body.get('retryable'),
      'retryable is true only for server errors here'
    );
    Assert.isNotNull(body.get('correlationId'), 'correlationId present');
  }

  /**
   * @description Asserts the pagination headers.
   * @param totalCount Expected X-Total-Count.
   * @param hasMore Expected X-Has-More.
   */
  public static void assertPaging(Integer totalCount, Boolean hasMore) {
    RestResponse res = RestContext.response;
    Assert.areEqual(
      String.valueOf(totalCount),
      res.headers.get('X-Total-Count'),
      'X-Total-Count'
    );
    Assert.areEqual(
      String.valueOf(hasMore),
      res.headers.get('X-Has-More'),
      'X-Has-More'
    );
  }

  /**
   * @description Asserts the Cache-Control header.
   * @param expected Expected directive.
   */
  public static void assertCache(String expected) {
    Assert.areEqual(
      expected,
      RestContext.response.headers.get('Cache-Control'),
      'Cache-Control'
    );
  }
}
