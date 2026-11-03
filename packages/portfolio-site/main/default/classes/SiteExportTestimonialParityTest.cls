/**
 * @description       : Parity for the export calls that read in user mode over rows the site guest
 *                      reaches through a guest sharing rule: testimonials, and the live data
 *                      marker counts such as skills. Rows inserted inside a test do not reach the
 *                      guest through those rules, so like TestimonialGuestAccessTest this class
 *                      reads the org's own rows. The build user reads them through the export,
 *                      the guest reads them directly, and the results must match.
 *                      The skills page and the project gallery read through the UI API GraphQL
 *                      endpoint, which a test cannot call. The GraphQL check reads the same
 *                      objects and fields with sharing applied and unreadable fields stripped,
 *                      once as each user, and the two must match.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/02/2026
 * @Test Class        : [SiteExportTestimonialParityTest]
 **/
@isTest(SeeAllData=true)
private class SiteExportTestimonialParityTest {
  /**
   * The rows and fields the skills page and the gallery ask GraphQL for, read with the
   * running user's sharing, then with the fields that user cannot read taken out.
   */
  private with sharing class GraphqlReads {
    private List<SObject> visible(List<SObject> rows) {
      return Security.stripInaccessible(AccessType.READABLE, rows).getRecords();
    }

    private List<Object> all() {
      return new List<Object>{
        visible(
          [
            SELECT
              Id,
              Name,
              Category__c,
              Category_Order__c,
              Display_Name__c,
              Proficiency__c,
              Persona_Tag__c
            FROM Skill__c
            ORDER BY Id
            LIMIT 200
          ]
        ),
        visible(
          [
            SELECT Id, Project__c, Skill__c, Project__r.Name
            FROM Project_Skill__c
            ORDER BY Id
            LIMIT 200
          ]
        ),
        visible(
          [
            SELECT
              Id,
              Experience__c,
              Skill__c,
              Experience__r.Name,
              Experience__r.Start_Date__c,
              Experience__r.End_Date__c,
              Experience__r.Is_Current_Role__c
            FROM Experience_Skill__c
            ORDER BY Id
            LIMIT 200
          ]
        ),
        visible(
          [
            SELECT
              Id,
              Name,
              (
                SELECT
                  Id,
                  Name,
                  Type__c,
                  External_URL__c,
                  Alt_Text__c,
                  Sort_Order__c
                FROM Project_Assets__r
                ORDER BY Sort_Order__c
                LIMIT 50
              )
            FROM Project__c
            WHERE Pillar__c IN ('A', 'B')
            ORDER BY Id
            LIMIT 10
          ]
        )
      };
    }
  }

  private static String graphqlView(User reader) {
    String view;
    System.runAs(reader) {
      view = JSON.serialize(new GraphqlReads().all());
    }
    return view;
  }

  @isTest
  static void graphqlRowsMatchTheGuest() {
    User build = SiteExportTestSupport.createBuildUser();
    User guest = SiteGuestTestSupport.preparedGuest();
    Test.startTest();
    String guestView = graphqlView(guest);
    String buildView = graphqlView(build);
    Test.stopTest();
    Assert.areEqual(
      guestView,
      buildView,
      'The build user reads the same GraphQL rows and fields as the site guest'
    );
    // Two empty reads would match too, so where the org has skills the guest must see some.
    Integer skillsInOrg = [SELECT COUNT() FROM Skill__c WITH SYSTEM_MODE];
    List<Object> reads = (List<Object>) JSON.deserializeUntyped(guestView);
    if (skillsInOrg > 0) {
      Assert.isFalse(
        ((List<Object>) reads[0]).isEmpty(),
        'The guest sees skills when the org has them'
      );
    }
  }

  @isTest
  static void testimonialReadsMatchTheGuest() {
    User build = SiteExportTestSupport.createBuildUser();
    Test.startTest();
    SiteExportTestSupport.assertSameAsGuest(
      build,
      'TestimonialController.getApprovedTestimonials',
      new Map<String, Object>()
    );
    SiteExportTestSupport.assertSameAsGuest(
      build,
      'TestimonialController.getHomeTestimonials',
      new Map<String, Object>()
    );
    Test.stopTest();
  }

  @isTest
  static void countsThatIncludeTestimonialsMatchTheGuest() {
    User build = SiteExportTestSupport.createBuildUser();
    Test.startTest();
    SiteExportTestSupport.assertSameAsGuest(
      build,
      'PortfolioStatsController.getStats',
      new Map<String, Object>()
    );
    SiteExportTestSupport.assertSameAsGuest(
      build,
      'DataSourceController.getSources',
      new Map<String, Object>{
        'names' => new List<Object>{ 'TestimonialController_Approved' }
      }
    );
    SiteExportTestSupport.assertSameAsGuest(
      build,
      'DataSourceController.getObjectSources',
      new Map<String, Object>{ 'objectNames' => new List<Object>{ 'Skill__c' } }
    );
    Test.stopTest();
  }
}
