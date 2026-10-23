/**
 * @description       : Subscriber for Contact_Form_Submission__e. Runs as the Automated Process
 *                      user and hands each delivered batch to ContactFormLeadWriter, which saves
 *                      the Leads so the assignment and auto-response rules run (ADR-031).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 * @Test Class        : [ContactFormControllerTest]
 **/
trigger ContactFormSubmissionTrigger on Contact_Form_Submission__e(
  after insert
) {
  ContactFormLeadWriter.insertLeads(Trigger.new);
}
