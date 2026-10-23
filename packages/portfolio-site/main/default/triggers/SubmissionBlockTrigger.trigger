/**
 * @description       : Keeps Submission_Block__c values in lower case and fills Unique_Key__c
 *                      (Type:Value), so a block added by hand matches the guard and cannot be
 *                      added twice.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 * @Test Class        : [SubmissionGuardTest]
 **/
trigger SubmissionBlockTrigger on Submission_Block__c(
  before insert,
  before update
) {
  SubmissionGuard.normalize(Trigger.new);
}
