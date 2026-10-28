/**
 * @description       : Submits each new site testimonial to the Testimonial Approval process.
 *                      Called by TestimonialSubmissionTrigger, which runs as the Automated
 *                      Process user, because the site guest who saves a testimonial cannot
 *                      submit it for approval. Each record is submitted on its owner's behalf
 *                      (the site's default owner for guest records), so the process allows only
 *                      the record owner as submitter and assigns the record owner as approver,
 *                      and no user is named in metadata. A record that is already approved,
 *                      already waiting, or deleted is skipped. A record that cannot be submitted
 *                      stays saved and unapproved, so nothing a visitor wrote is lost and the
 *                      visitor never sees an error from this step.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/24/2026
 * @Test Class        : [TestimonialApprovalSubmitterTest]
 **/
public with sharing class TestimonialApprovalSubmitter {
  @TestVisible
  private static final String PROCESS_NAME = 'Testimonial_Approval';
  @TestVisible
  private static final Integer MAX_RETRIES = 3;
  @TestVisible
  private static Boolean forceFailure = false;
  @TestVisible
  private static List<Approval.ProcessResult> lastResults = new List<Approval.ProcessResult>();

  /**
   * @description Submits the testimonials the events name. Unexpected errors are retried by
   *              the event bus up to three times. After that the testimonials stay saved and
   *              unapproved, for the owner to submit from the record.
   * @param submissions The delivered events.
   * @throws EventBus.RetryableException When the submit fails and retries are left.
   */
  public static void submit(List<Testimonial_Submission__e> submissions) {
    Set<Id> testimonialIds = idsOf(submissions);
    if (testimonialIds.isEmpty()) {
      return;
    }
    try {
      if (forceFailure) {
        throw new DmlException('Forced submit failure for tests.');
      }
      List<Approval.ProcessSubmitRequest> requests = requestsFor(
        waitingTestimonials(testimonialIds)
      );
      if (requests.isEmpty()) {
        return;
      }
      // Partial success, so one record that cannot be submitted never stops the others.
      lastResults = Approval.process(requests, false);
    } catch (Exception e) {
      if (retries() < MAX_RETRIES) {
        throw new EventBus.RetryableException(e.getMessage());
      }
      // Out of retries: the testimonials stay saved and unapproved, and the owner submits
      // them from the record.
    }
  }

  private static Set<Id> idsOf(List<Testimonial_Submission__e> submissions) {
    Set<Id> testimonialIds = new Set<Id>();
    if (submissions == null) {
      return testimonialIds;
    }
    for (Testimonial_Submission__e submission : submissions) {
      Id testimonialId = asTestimonialId(submission.Testimonial_Id__c);
      if (testimonialId != null) {
        testimonialIds.add(testimonialId);
      }
    }
    return testimonialIds;
  }

  private static Id asTestimonialId(String value) {
    if (String.isBlank(value)) {
      return null;
    }
    try {
      Id candidate = Id.valueOf(value);
      return candidate.getSobjectType() == Testimonial__c.SObjectType
        ? candidate
        : null;
    } catch (StringException e) {
      // Not an Id at all, so there is nothing to submit.
      return null;
    }
  }

  // Unapproved testimonials with no approval already pending. Read in system mode because the
  // Automated Process user holds no permission set, and only Ids and owners are read.
  private static List<Testimonial__c> waitingTestimonials(
    Set<Id> testimonialIds
  ) {
    Set<Id> pending = new Set<Id>();
    for (ProcessInstance instance : [
      SELECT TargetObjectId
      FROM ProcessInstance
      WHERE TargetObjectId IN :testimonialIds AND Status = 'Pending'
      WITH SYSTEM_MODE
    ]) {
      pending.add(instance.TargetObjectId);
    }
    List<Testimonial__c> waiting = new List<Testimonial__c>();
    for (Testimonial__c testimonial : [
      SELECT Id, OwnerId
      FROM Testimonial__c
      WHERE Id IN :testimonialIds AND Approved__c = FALSE
      WITH SYSTEM_MODE
    ]) {
      if (!pending.contains(testimonial.Id)) {
        waiting.add(testimonial);
      }
    }
    return waiting;
  }

  private static List<Approval.ProcessSubmitRequest> requestsFor(
    List<Testimonial__c> testimonials
  ) {
    List<Approval.ProcessSubmitRequest> requests = new List<Approval.ProcessSubmitRequest>();
    for (Testimonial__c testimonial : testimonials) {
      Approval.ProcessSubmitRequest request = new Approval.ProcessSubmitRequest();
      request.setObjectId(testimonial.Id);
      request.setSubmitterId(testimonial.OwnerId);
      request.setProcessDefinitionNameOrId(PROCESS_NAME);
      request.setComments('Left on the portfolio site.');
      requests.add(request);
    }
    return requests;
  }

  private static Integer retries() {
    return EventBus.TriggerContext.currentContext()?.retries ?? 0;
  }
}
