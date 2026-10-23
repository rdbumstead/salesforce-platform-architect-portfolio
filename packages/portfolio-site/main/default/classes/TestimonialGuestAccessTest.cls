/**
 * @description       : Proves ADR-012's restriction rule on the org's own testimonials (Round 7
 *                      B2). The Guest_Read_Testimonials sharing rule shares every row with the
 *                      site guest, so the Block_Unapproved_Testimonials restriction rule is the
 *                      only thing between the guest and an unapproved row. Reads the org's data
 *                      (SeeAllData), because guest sharing rules never reach records inserted
 *                      inside an Apex test (log 075). In an org with no testimonials the checks
 *                      hold trivially. The scratch seed data/site/Testimonial__c.json gives it
 *                      three approved rows and one pending row to prove against.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 **/
@isTest(SeeAllData=true)
private class TestimonialGuestAccessTest {
  @isTest
  static void theGuestNeverReadsAnUnapprovedTestimonial() {
    Integer approvedInOrg = [
      SELECT COUNT()
      FROM Testimonial__c
      WHERE Approved__c = TRUE
      WITH SYSTEM_MODE
    ];
    User guest = SiteGuestTestSupport.preparedGuest();
    List<Testimonial__c> visible;

    Test.startTest();
    System.runAs(guest) {
      // No approval filter here on purpose.
      visible = [SELECT Id, Approved__c FROM Testimonial__c WITH USER_MODE];
    }
    Test.stopTest();

    for (Testimonial__c row : visible) {
      Assert.isTrue(row.Approved__c, 'The guest reads approved rows only');
    }
    Assert.areEqual(
      approvedInOrg,
      visible.size(),
      'The guest reads every approved row and nothing else'
    );
  }

  @isTest
  static void theWallReturnsOnlyApprovedTestimonials() {
    Integer approvedInOrg = [
      SELECT COUNT()
      FROM Testimonial__c
      WHERE Approved__c = TRUE
      WITH SYSTEM_MODE
    ];
    User guest = SiteGuestTestSupport.preparedGuest();
    List<TestimonialController.WallItem> wall;

    Test.startTest();
    System.runAs(guest) {
      wall = TestimonialController.getApprovedTestimonials();
    }
    Test.stopTest();

    Assert.areEqual(
      Math.min(approvedInOrg, 200),
      wall.size(),
      'The wall shows the approved rows'
    );
  }
}
