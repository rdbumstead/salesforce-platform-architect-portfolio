/**
 * @description       : Parity for the export calls that read in user mode over rows the site guest
 *                      reaches through a guest sharing rule: testimonials, and the live data
 *                      marker counts such as skills. Rows inserted inside a test do not reach the
 *                      guest through those rules, so like TestimonialGuestAccessTest this class
 *                      reads the org's own rows. The build user reads them through the export,
 *                      the guest reads them directly, and the results must match.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/02/2026
 * @Test Class        : [SiteExportTestimonialParityTest]
 **/
@isTest(SeeAllData=true)
private class SiteExportTestimonialParityTest {
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
