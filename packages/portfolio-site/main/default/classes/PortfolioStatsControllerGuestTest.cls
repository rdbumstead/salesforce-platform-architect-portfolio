/**
 * @description       : Proves the numbers panel on the org's own testimonials, as the real
 *                      Portfolio1 site guest. The guest reads approved rows through the
 *                      Guest_Read_Testimonials sharing rule, and the Block_Unapproved_Testimonials
 *                      restriction rule hides every waiting row from it, so the approved count
 *                      must equal the count an admin sees, and no waiting count is returned. Reads the
 *                      org's data (SeeAllData), because guest sharing rules never reach records
 *                      inserted inside an Apex test. In an org with no testimonials the checks
 *                      hold trivially.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/24/2026
 **/
@isTest(SeeAllData=true)
private class PortfolioStatsControllerGuestTest {
  @isTest
  static void theGuestSeesTheSameTestimonialCountsAsAnAdmin() {
    Integer approvedInOrg = [
      SELECT COUNT()
      FROM Testimonial__c
      WHERE Approved__c = TRUE
      WITH SYSTEM_MODE
    ];
    User guest = SiteGuestTestSupport.preparedGuest();
    PortfolioStatsController.Stats stats;

    Test.startTest();
    System.runAs(guest) {
      stats = PortfolioStatsController.getStats();
    }
    Test.stopTest();

    Assert.areEqual(approvedInOrg, stats.testimonialsApproved, 'Approved');
    Assert.isFalse(
      JSON.serialize(stats).containsIgnoreCase('waiting'),
      'The waiting count is not part of the guest\'s answer'
    );
  }

  @isTest
  static void theGuestStillCannotReadAWaitingRowItself() {
    User guest = SiteGuestTestSupport.preparedGuest();
    Integer waitingVisible;

    Test.startTest();
    System.runAs(guest) {
      waitingVisible = [
        SELECT COUNT()
        FROM Testimonial__c
        WHERE Approved__c = FALSE
        WITH USER_MODE
      ];
    }
    Test.stopTest();

    Assert.areEqual(0, waitingVisible, 'The restriction rule still holds');
  }
}
