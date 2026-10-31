/**
 * @description       : Unit tests for SAPITestimonial REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 01/02/2026
 **/
@IsTest
private class SAPITestimonialTest {
  @TestSetup
  static void setup() {
    Testimonial__c t = new Testimonial__c(
      Author_Name__c = 'Jane Doe',
      Approved__c = true,
      Relationship_Type__c = 'Manager',
      Vibe_Mode__c = 'Professional',
      Sort_Order__c = 1
    );
    insert t;
  }

  @IsTest
  static void testGetTestimonialsSuccess() {
    RestTestUtil.initGet('/services/apexrest/sapi/v1/testimonials/');
    RestResponse res = RestTestUtil.getResponse();

    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.startTest();
      SAPITestimonial.getTestimonials();
      Test.stopTest();

      if (res.statusCode != 200) {
        System.assert(false, 'ERR:' + res.responseBody.toString());
      }
      System.assertEquals(200, res.statusCode, 'Should return 200 OK');
      System.assertNotEquals(
        null,
        res.responseBody,
        'Response body should not be null'
      );

      String responseJson = res.responseBody.toString();
      System.assert(
        responseJson.contains('Jane Doe'),
        'Response should contain author name'
      );
      System.assertEquals(
        'no-store, no-cache',
        res.headers.get('Cache-Control'),
        'Testimonials are no-store per the spec header reference'
      );
    }
  }

  @IsTest
  static void testGetTestimonialsWithFilter() {
    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/testimonials/',
      new Map<String, String>{ 'vibeMode' => 'Professional' }
    );
    RestResponse res = RestTestUtil.getResponse();

    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.startTest();
      SAPITestimonial.getTestimonials();
      Test.stopTest();

      System.assertEquals(200, res.statusCode, 'Should return 200 OK');
    }
  }

  @IsTest
  static void testGetTestimonialsInvalidLimit() {
    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/testimonials/',
      new Map<String, String>{ 'limit' => '0' }
    );
    RestResponse res = RestTestUtil.getResponse();

    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.startTest();
      SAPITestimonial.getTestimonials();
      Test.stopTest();

      System.assertEquals(400, res.statusCode, 'Should return 400 Bad Request');
    }
  }
  @IsTest
  static void testGetTestimonialsInternalError() {
    RestTestUtil.initGet('/services/apexrest/sapi/v1/testimonials/');
    RestResponse res = RestTestUtil.getResponse();

    SAPITestimonial.throwException = true;

    Test.startTest();
    SAPITestimonial.getTestimonials();
    Test.stopTest();

    System.assertEquals(
      500,
      res.statusCode,
      'Should return 500 on internal error'
    );
    RestTestUtil.assertServerError();
  }

  @IsTest
  static void filteredTotalCountsTheFilteredRowsNotThePage() {
    List<Testimonial__c> more = new List<Testimonial__c>();
    for (Integer i = 0; i < 2; i++) {
      more.add(newTestimonial('Professional', true, 2 + i));
    }
    more.add(newTestimonial('Casual', true, 5));
    more.add(newTestimonial('Professional', false, 6));
    insert more;

    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/testimonials/',
      new Map<String, String>{ 'vibeMode' => 'Professional', 'limit' => '1' }
    );
    Test.startTest();
    SAPITestimonial.getTestimonials();
    Test.stopTest();
    RestResponse filtered = RestTestUtil.getResponse();
    Assert.areEqual(200, filtered.statusCode, 'Filtered request is OK');
    Assert.areEqual(
      '3',
      filtered.headers.get('X-Total-Count'),
      'Three approved Professional rows, not the unapproved one'
    );
    Assert.areEqual(
      'true',
      filtered.headers.get('X-Has-More'),
      'More rows follow'
    );
  }

  @IsTest
  static void unfilteredTotalCountsEveryApprovedTestimonial() {
    insert new List<Testimonial__c>{
      newTestimonial('Casual', true, 2),
      newTestimonial('Professional', false, 3)
    };

    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/testimonials/',
      new Map<String, String>{ 'limit' => '1' }
    );
    Test.startTest();
    SAPITestimonial.getTestimonials();
    Test.stopTest();
    Assert.areEqual(
      '2',
      RestTestUtil.getResponse().headers.get('X-Total-Count'),
      'Every approved testimonial'
    );
  }

  private static Testimonial__c newTestimonial(
    String vibe,
    Boolean approved,
    Integer sortOrder
  ) {
    return new Testimonial__c(
      Author_Name__c = 'Author ' + sortOrder,
      Approved__c = approved,
      Relationship_Type__c = 'Manager',
      Vibe_Mode__c = vibe,
      Sort_Order__c = sortOrder
    );
  }
}
