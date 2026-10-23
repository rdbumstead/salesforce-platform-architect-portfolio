/**
 * @description       : The work behind the "Block sender" quick action on Lead.
 *                      It adds the Lead's email or its domain to
 *                      Submission_Block__c, turns an existing block back on, and marks the Lead
 *                      as spam so its reply reminders stop. Called from the Lead_Block_Sender
 *                      screen flow, which works in the Salesforce mobile app.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 * @Test Class        : [SubmissionBlockActionTest]
 **/
public with sharing class SubmissionBlockAction {
  /**
   * @description One block request from the flow.
   */
  public class Request {
    @InvocableVariable(label='Lead Id' required=true)
    public Id leadId;
    @InvocableVariable(
      label='Block type'
      description='Email blocks the whole address. Domain blocks everything after the @.'
      required=true
    )
    public String blockType;
    @InvocableVariable(label='Reason' required=false)
    public String reason;
  }

  /**
   * @description The outcome for one request.
   */
  public class Response {
    @InvocableVariable(label='Success')
    public Boolean isSuccess = false;
    @InvocableVariable(label='Blocked value')
    public String blockedValue;
    @InvocableVariable(label='Error message')
    public String errorMessage;
    @InvocableVariable(label='Error type')
    public String errorType;
  }

  /**
   * @description Blocks each Lead's email or domain and marks the Lead as spam.
   * @param requests One per Lead.
   * @return List<Response> In the same order as the requests.
   */
  @InvocableMethod(
    label='Block sender'
    description='Adds the Lead email or domain to the submission blocklist and marks the Lead as spam.'
    category='Portfolio'
  )
  public static List<Response> blockSenders(List<Request> requests) {
    List<Response> responses = new List<Response>();
    if (requests == null || requests.isEmpty()) {
      return responses;
    }
    Set<Id> leadIds = new Set<Id>();
    for (Request request : requests) {
      leadIds.add(request.leadId);
    }
    Map<Id, Lead> leadsById = new Map<Id, Lead>(
      [SELECT Id, Email FROM Lead WHERE Id IN :leadIds WITH USER_MODE]
    );

    Map<String, Submission_Block__c> blocksByKey = new Map<String, Submission_Block__c>();
    Map<Id, Lead> spamById = new Map<Id, Lead>();
    for (Request request : requests) {
      Response response = new Response();
      responses.add(response);
      Lead lead = leadsById.get(request.leadId);
      String value = blockValue(lead, request.blockType);
      if (value == null) {
        response.errorMessage = 'Nothing to block. Choose Email or Domain, and check the Lead has an email address.';
        response.errorType = 'NothingToBlock';
        continue;
      }
      Submission_Block__c block = new Submission_Block__c(
        Type__c = request.blockType,
        Value__c = value,
        Active__c = true,
        Reason__c = String.isBlank(request.reason)
          ? 'Blocked from a Lead'
          : request.reason.left(255)
      );
      SubmissionGuard.normalize(new List<Submission_Block__c>{ block });
      blocksByKey.put(block.Unique_Key__c, block);
      spamById.put(lead.Id, new Lead(Id = lead.Id, Spam__c = true));
      response.blockedValue = block.Value__c;
    }

    Savepoint beforeSave = Database.setSavepoint();
    try {
      Database.upsert(
        blocksByKey.values(),
        Submission_Block__c.Unique_Key__c,
        true,
        AccessLevel.USER_MODE
      );
      Database.update(spamById.values(), true, AccessLevel.USER_MODE);
    } catch (DmlException e) {
      // Nothing half done: the blocks and the spam marks are saved together or not at all.
      Database.rollback(beforeSave);
      for (Response response : responses) {
        if (response.errorType == null) {
          response.errorMessage = e.getMessage();
          response.errorType = e.getTypeName();
        }
      }
      return responses;
    }
    for (Response response : responses) {
      response.isSuccess = response.errorType == null;
    }
    return responses;
  }

  private static String blockValue(Lead lead, String blockType) {
    if (lead == null || String.isBlank(lead.Email)) {
      return null;
    }
    if (blockType == SubmissionGuard.TYPE_DOMAIN) {
      return SubmissionGuard.domainOf(lead.Email);
    }
    if (blockType == SubmissionGuard.TYPE_EMAIL) {
      return lead.Email.trim().toLowerCase();
    }
    return null;
  }
}
