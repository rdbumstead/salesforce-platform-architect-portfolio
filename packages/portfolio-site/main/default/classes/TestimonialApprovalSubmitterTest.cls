/**
 * @description       : Tests for TestimonialApprovalSubmitter, TestimonialSubmissionTrigger, the
 *                      Testimonial Approval process and the hand off in
 *                      TestimonialController.submitTestimonial. The testimonial is saved by the
 *                      real Portfolio1 site guest, then the event is delivered so the trigger
 *                      submits it as it does in the org.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/24/2026
 **/
@isTest
private class TestimonialApprovalSubmitterTest {
  private static final Integer HUMAN_MS = 9000;
  private static final String STRENGTH = 'Professional_Strength_01';
  private static final String OUTCOME = 'Professional_Outcome_01';

  private static Id saveAsGuest(User guest) {
    Id saved;
    System.runAs(guest) {
      saved = TestimonialController.submitTestimonial(
        'Ada Lovelace',
        'Engineer',
        'Peer',
        'Professional',
        STRENGTH,
        OUTCOME,
        'A short note',
        null,
        HUMAN_MS
      );
    }
    return saved;
  }

  private static Id savedAndSubmitted() {
    User guest = SiteGuestTestSupport.preparedGuest();
    Test.startTest();
    Id saved = saveAsGuest(guest);
    Test.getEventBus().deliver();
    Test.stopTest();
    return saved;
  }

  private static Testimonial__c reload(Id testimonialId) {
    return [
      SELECT Id, OwnerId, Approved__c
      FROM Testimonial__c
      WHERE Id = :testimonialId
    ];
  }

  private static List<ProcessInstance> instancesFor(Id testimonialId) {
    return [
      SELECT Id, Status, SubmittedById, ProcessDefinition.DeveloperName
      FROM ProcessInstance
      WHERE TargetObjectId = :testimonialId
      ORDER BY CreatedDate
    ];
  }

  private static Approval.ProcessResult decide(
    Id testimonialId,
    String action
  ) {
    ProcessInstanceWorkitem item = [
      SELECT Id
      FROM ProcessInstanceWorkitem
      WHERE ProcessInstance.TargetObjectId = :testimonialId
      LIMIT 1
    ];
    Approval.ProcessWorkitemRequest request = new Approval.ProcessWorkitemRequest();
    request.setWorkitemId(item.Id);
    request.setAction(action);
    request.setComments(action + ' in a test');
    return Approval.process(request);
  }

  @isTest
  static void aGuestTestimonialWaitsForItsOwnersApproval() {
    Id saved = savedAndSubmitted();

    Testimonial__c testimonial = reload(saved);
    Site site = [
      SELECT GuestRecordDefaultOwnerId
      FROM Site
      WHERE Name = :SiteGuestTestSupport.SITE_NAME
      LIMIT 1
    ];
    Assert.areEqual(
      site.GuestRecordDefaultOwnerId,
      testimonial.OwnerId,
      'The site default owner owns a guest testimonial'
    );
    Assert.isFalse(testimonial.Approved__c, 'Not approved yet');
    List<ProcessInstance> instances = instancesFor(saved);
    Assert.areEqual(1, instances.size(), 'Submitted once');
    Assert.areEqual('Pending', instances[0].Status, 'Waiting for approval');
    Assert.areEqual(
      TestimonialApprovalSubmitter.PROCESS_NAME,
      instances[0].ProcessDefinition.DeveloperName,
      'The Testimonial Approval process'
    );
    Assert.areEqual(
      testimonial.OwnerId,
      instances[0].SubmittedById,
      'Submitted on the owner\'s behalf'
    );
    ProcessInstanceWorkitem item = [
      SELECT ActorId
      FROM ProcessInstanceWorkitem
      WHERE ProcessInstanceId = :instances[0].Id
    ];
    Assert.areEqual(
      testimonial.OwnerId,
      item.ActorId,
      'The owner is asked to approve'
    );
  }

  @isTest
  static void approvingSetsApproved() {
    Id saved = savedAndSubmitted();

    Approval.ProcessResult result = decide(saved, 'Approve');

    Assert.isTrue(result.isSuccess(), 'Approved');
    Assert.isTrue(reload(saved).Approved__c, 'Approval sets Approved');
    Assert.areEqual('Approved', instancesFor(saved)[0].Status, 'Closed');
  }

  @isTest
  static void rejectingLeavesItUnapproved() {
    Id saved = savedAndSubmitted();

    Approval.ProcessResult result = decide(saved, 'Reject');

    Assert.isTrue(result.isSuccess(), 'Rejected');
    Assert.isFalse(reload(saved).Approved__c, 'Rejection leaves it unapproved');
    Assert.areEqual('Rejected', instancesFor(saved)[0].Status, 'Closed');
  }

  @isTest
  static void aSubmitThatKeepsFailingKeepsTheTestimonial() {
    User guest = SiteGuestTestSupport.preparedGuest();
    TestimonialApprovalSubmitter.forceFailure = true;
    Id saved = saveAsGuest(guest);
    Integer deliveries = 0;
    for (Integer i = 0; i <= TestimonialApprovalSubmitter.MAX_RETRIES; i++) {
      Test.getEventBus().deliver();
      deliveries++;
    }

    Assert.areEqual(
      TestimonialApprovalSubmitter.MAX_RETRIES + 1,
      deliveries,
      'Delivered once and retried three times'
    );
    Assert.isNotNull(saved, 'The visitor got an Id back, not an error');
    Assert.isFalse(reload(saved).Approved__c, 'Kept and unapproved');
    Assert.areEqual(0, instancesFor(saved).size(), 'Not submitted');
  }

  @isTest
  static void aFailedPublishStillThanksTheVisitor() {
    User guest = SiteGuestTestSupport.preparedGuest();
    TestimonialController.forcePublishFailure = true;

    Test.startTest();
    Id saved = saveAsGuest(guest);
    Test.getEventBus().deliver();
    Test.stopTest();

    Assert.isNotNull(saved, 'Saved with no error for the visitor');
    Assert.isTrue(TestimonialController.publishFailed, 'The failure is noted');
    Assert.isFalse(reload(saved).Approved__c, 'Kept and unapproved');
    Assert.areEqual(0, instancesFor(saved).size(), 'Nothing submitted');
  }

  @isTest
  static void aTestimonialIsSubmittedOnlyOnce() {
    Id saved = savedAndSubmitted();

    TestimonialApprovalSubmitter.submit(
      new List<Testimonial_Submission__e>{
        new Testimonial_Submission__e(Testimonial_Id__c = saved)
      }
    );

    Assert.areEqual(1, instancesFor(saved).size(), 'A pending one is skipped');
  }

  @isTest
  static void anApprovedTestimonialIsNotSubmitted() {
    Testimonial__c approved = new Testimonial__c(
      Author_Name__c = 'Grace Hopper',
      Relationship_Type__c = 'Manager',
      Vibe_Mode__c = 'Professional',
      Context__c = 'Already approved',
      Approved__c = true
    );
    insert approved;

    TestimonialApprovalSubmitter.submit(
      new List<Testimonial_Submission__e>{
        new Testimonial_Submission__e(Testimonial_Id__c = approved.Id)
      }
    );

    Assert.areEqual(0, instancesFor(approved.Id).size(), 'Skipped');
    Assert.areEqual(
      0,
      TestimonialApprovalSubmitter.lastResults.size(),
      'Nothing sent to the process'
    );
  }

  @isTest
  static void eventsWithoutATestimonialIdAreIgnored() {
    TestimonialApprovalSubmitter.submit(null);
    TestimonialApprovalSubmitter.submit(
      new List<Testimonial_Submission__e>{
        new Testimonial_Submission__e(),
        new Testimonial_Submission__e(Testimonial_Id__c = 'not an id'),
        new Testimonial_Submission__e(Testimonial_Id__c = UserInfo.getUserId())
      }
    );

    Assert.areEqual(
      0,
      TestimonialApprovalSubmitter.lastResults.size(),
      'Nothing sent to the process'
    );
    Assert.areEqual(0, [SELECT COUNT() FROM ProcessInstance], 'No approvals');
  }
}
