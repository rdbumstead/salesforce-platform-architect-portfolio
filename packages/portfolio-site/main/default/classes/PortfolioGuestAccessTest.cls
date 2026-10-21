/**
 * @description       : Proves the real Portfolio1 site guest cannot read the objects Round 3
 *                      plan K4 keeps closed: Contact, Account, Certification__c, Education__c,
 *                      Experience_Highlight__c and Testimonial__c. Reads the org's own data
 *                      (SeeAllData), because guest sharing rules never reach records inserted
 *                      inside an Apex test, so test-made rows would prove nothing (log 075).
 *                      The guest parity check on the shared objects is not here: it fails in
 *                      any deploy that adds the guest sharing rules, because the rules only
 *                      take effect after the deploy commits (log 075).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
@isTest(SeeAllData=true)
private class PortfolioGuestAccessTest {
  @isTest
  static void guestCannotReadObjectsOutsideTheGrant() {
    User guest = SiteGuestTestSupport.preparedGuest();
    List<String> closedObjects = new List<String>{
      'Contact',
      'Account',
      'Certification__c',
      'Education__c',
      'Experience_Highlight__c',
      'Testimonial__c'
    };
    Map<String, Integer> visibleByObject = new Map<String, Integer>();

    Test.startTest();
    System.runAs(guest) {
      for (String objectName : closedObjects) {
        visibleByObject.put(objectName, guestCount(objectName));
      }
    }
    Test.stopTest();

    for (String objectName : closedObjects) {
      Assert.areEqual(
        0,
        visibleByObject.get(objectName),
        'A guest reads no ' + objectName
      );
    }
  }

  // A refused query counts as zero rows: the guest reads nothing either way.
  private static Integer guestCount(String objectName) {
    try {
      return Database.countQuery(
        'SELECT COUNT() FROM ' + objectName + ' WITH USER_MODE'
      );
    } catch (QueryException e) {
      return 0;
    } catch (SecurityException e) {
      return 0;
    }
  }
}
