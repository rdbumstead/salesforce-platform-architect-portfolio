/**
 * @description       : Unit tests for PAPITestimonialFeed REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 **/
@IsTest
private class PAPITestimonialFeedTest {
  private static final String URI = '/services/apexrest/papi/v1/testimonials/feed';

  @TestSetup
  static void setup() {
    insert new List<Testimonial__c>{
      testimonial('Approved Manager', true, 'Manager', 'Professional', 1),
      testimonial('Approved Client', true, 'Client', 'Professional', 2),
      testimonial('Approved Fan', true, 'Fan', 'Casual', 3),
      testimonial('Approved Casual Peer', true, 'Peer', 'Casual', 4),
      testimonial('Approved Recruiter', true, 'Recruiter', 'Professional', 5),
      testimonial('Unapproved Manager', false, 'Manager', 'Professional', 6),
      testimonial('Unapproved Fan', false, 'Fan', 'Casual', 7)
    };
  }

  private static Testimonial__c testimonial(
    String author,
    Boolean approved,
    String relationship,
    String vibe,
    Integer sortOrder
  ) {
    return new Testimonial__c(
      Author_Name__c = author,
      Author_Title__c = 'Title of ' + author,
      Approved__c = approved,
      Relationship_Type__c = relationship,
      Vibe_Mode__c = vibe,
      Context__c = 'Quote from ' + author,
      Sort_Order__c = sortOrder
    );
  }

  private static List<String> callFeed(Map<String, String> params) {
    RestTestUtil.initGet(URI, params);
    Test.startTest();
    PAPITestimonialFeed.getFeed();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    Assert.areEqual(200, res.statusCode, res.responseBody.toString());
    List<String> authors = new List<String>();
    for (
      Object item : (List<Object>) JSON.deserializeUntyped(
        res.responseBody.toString()
      )
    ) {
      authors.add((String) ((Map<String, Object>) item).get('author'));
    }
    return authors;
  }

  @IsTest
  static void defaultModeIsProfessional() {
    List<String> authors = callFeed(null);

    Assert.areEqual(
      new List<String>{ 'Approved Manager', 'Approved Client' },
      authors,
      'Approved, Professional vibe, Manager/Client/Peer only, in sort order'
    );
  }

  @IsTest
  static void professionalModeExcludesCasualAndRecruiter() {
    List<String> authors = callFeed(
      new Map<String, String>{ 'mode' => 'professional' }
    );

    Assert.areEqual(
      new List<String>{ 'Approved Manager', 'Approved Client' },
      authors,
      'Casual vibe and Recruiter/Fan relationships are filtered out'
    );
  }

  @IsTest
  static void casualModeReturnsEveryApprovedTestimonialOnly() {
    List<String> authors = callFeed(
      new Map<String, String>{ 'mode' => 'casual' }
    );

    Assert.areEqual(
      new List<String>{
        'Approved Manager',
        'Approved Client',
        'Approved Fan',
        'Approved Casual Peer',
        'Approved Recruiter'
      },
      authors,
      'All approved testimonials, and no unapproved ones'
    );
  }

  @IsTest
  static void modeMatchesVibeModeValuesCaseInsensitively() {
    List<String> authors = callFeed(
      new Map<String, String>{ 'mode' => 'Casual' }
    );

    Assert.areEqual(5, authors.size(), 'VibeMode spelling is accepted');
  }

  @IsTest
  static void responseHeadersAndShape() {
    RestTestUtil.initGet(URI);
    Test.startTest();
    PAPITestimonialFeed.getFeed();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    Assert.areEqual(
      'max-age=60, private',
      res.headers.get('Cache-Control'),
      'Feed is cached privately for 60 seconds'
    );
    Assert.areEqual('2', res.headers.get('X-Total-Count'), 'Two returned');
    Map<String, Object> first = (Map<String, Object>) ((List<Object>) JSON.deserializeUntyped(
      res.responseBody.toString()
    ))[0];
    Assert.areEqual(
      new Set<String>{
        'id',
        'author',
        'title',
        'relationship',
        'quote',
        'vibe',
        'avatarUrl'
      },
      first.keySet(),
      'EnrichedTestimonial keys'
    );
    Assert.areEqual(
      'Quote from Approved Manager',
      first.get('quote'),
      'Quote maps from Context__c'
    );
  }

  @IsTest
  static void unknownModeIsRejected() {
    RestTestUtil.initGet(URI, new Map<String, String>{ 'mode' => 'loud' });
    Test.startTest();
    PAPITestimonialFeed.getFeed();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    Assert.areEqual(400, res.statusCode, 'Mode outside the enum is a 400');
    Assert.areEqual(
      'BAD_REQUEST',
      RestTestUtil.getBodyAsMap().get('errorCode'),
      'Standard error payload'
    );
  }

  @IsTest
  static void internalErrorReturns500() {
    PAPITestimonialFeed.throwException = true;
    RestTestUtil.initGet(URI);
    Test.startTest();
    PAPITestimonialFeed.getFeed();
    Test.stopTest();

    Assert.areEqual(
      500,
      RestTestUtil.getResponse().statusCode,
      'Unexpected failures are a 500'
    );
  }
}
