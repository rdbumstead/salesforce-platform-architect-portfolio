/**
 * @description       : Subscriber for Testimonial_Submission__e. Runs as the Automated Process
 *                      user and hands each delivered batch to TestimonialApprovalSubmitter, which
 *                      submits each new testimonial to the Testimonial Approval process on its
 *                      owner's behalf.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/24/2026
 * @Test Class        : [TestimonialApprovalSubmitterTest]
 **/
trigger TestimonialSubmissionTrigger on Testimonial_Submission__e(
  after insert
) {
  TestimonialApprovalSubmitter.submit(Trigger.new);
}
