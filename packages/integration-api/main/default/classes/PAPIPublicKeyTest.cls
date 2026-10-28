/**
 * @description       : Tests that the PAPI responses carry the public key beside the Id on the
 *                      contact, experience, skill, project, certification, education and
 *                      testimonial objects (ADR-038).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/28/2026
 **/
@IsTest
private class PAPIPublicKeyTest {
  private static final String KEY_FORMAT = '^[a-z]{3}_[a-km-np-z2-9]{10}$';

  @TestSetup
  static void setup() {
    Contact owner = new Contact(
      FirstName = 'Key',
      LastName = 'Owner',
      Is_Portfolio_Owner__c = true
    );
    insert owner;
    Account employer = new Account(Name = 'Key Employer');
    insert employer;
    insert new Experience__c(
      Employer__c = employer.Id,
      Name = 'Key Architect',
      Start_Date__c = Date.today().addYears(-2),
      Sort_Order__c = 1,
      Is_Current_Role__c = true,
      Contact__c = owner.Id
    );
    insert new Skill__c(
      Name = 'Key Apex',
      Category__c = 'Backend',
      Proficiency__c = 5
    );
    insert new Project__c(
      Name = 'Key Project',
      Status__c = 'Live – In Production',
      Is_Featured__c = true,
      Sort_Order__c = 1
    );
    insert new Certification__c(
      Name = 'Key Certification',
      Contact__c = owner.Id,
      Issuer__c = employer.Id,
      Earned_Date__c = Date.today().addYears(-1)
    );
    insert new Education__c(
      Name = 'Key Degree',
      Contact__c = owner.Id,
      Issuer__c = employer.Id,
      Field_of_Study__c = 'Computer Science',
      Graduation_Date__c = Date.today().addYears(-5)
    );
    insert new Testimonial__c(
      Author_Name__c = 'Key Author',
      Approved__c = true,
      Relationship_Type__c = 'Manager',
      Vibe_Mode__c = 'Professional',
      Sort_Order__c = 1
    );
  }

  private static void assertKey(Object row, String prefix, String label) {
    Map<String, Object> item = (Map<String, Object>) row;
    String key = (String) item.get('key');
    Assert.isNotNull(key, label + ' carries a key');
    Assert.isTrue(Pattern.matches(KEY_FORMAT, key), label + ' format: ' + key);
    Assert.isTrue(key.startsWith(prefix + '_'), label + ' prefix: ' + key);
    Assert.isNotNull(item.get('id'), label + ' still carries id');
  }

  @IsTest
  static void shouldCarryKeys_WhenFullProfile() {
    RestTestUtil.initGet('/services/apexrest/papi/v1/profile/full');

    Test.startTest();
    PAPIProfile.getProfile();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    Assert.areEqual(200, res.statusCode, res.responseBody.toString());
    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    assertKey(body.get('contactInfo'), 'con', 'contactInfo');
    assertKey(((List<Object>) body.get('experience'))[0], 'exp', 'experience');
    assertKey(((List<Object>) body.get('skills'))[0], 'skl', 'skills');
    assertKey(((List<Object>) body.get('projects'))[0], 'prj', 'projects');
    assertKey(
      ((List<Object>) body.get('certifications'))[0],
      'crt',
      'certifications'
    );
    assertKey(((List<Object>) body.get('education'))[0], 'edu', 'education');
    assertKey(
      ((List<Object>) body.get('testimonials'))[0],
      'tst',
      'testimonials'
    );
  }

  @IsTest
  static void shouldCarryKey_WhenFeaturedProjects() {
    RestTestUtil.initGet('/services/apexrest/papi/v1/projects/featured');

    Test.startTest();
    PAPIProjects.getProjects();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    Assert.areEqual(200, res.statusCode, res.responseBody.toString());
    List<Object> projects = (List<Object>) JSON.deserializeUntyped(
      res.responseBody.toString()
    );
    Assert.areEqual(1, projects.size(), 'One featured project');
    assertKey(projects[0], 'prj', 'featured project');
  }

  @IsTest
  static void shouldCarryKey_WhenTestimonialFeed() {
    RestTestUtil.initGet('/services/apexrest/papi/v1/testimonials/feed');

    Test.startTest();
    PAPITestimonialFeed.getFeed();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    Assert.areEqual(200, res.statusCode, res.responseBody.toString());
    List<Object> feed = (List<Object>) JSON.deserializeUntyped(
      res.responseBody.toString()
    );
    Assert.isFalse(feed.isEmpty(), 'The feed has the testimonial');
    assertKey(feed[0], 'tst', 'feed item');
  }
}
