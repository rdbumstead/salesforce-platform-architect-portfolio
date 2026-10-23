/**
 * @description       : Tests for SubmissionGuard and SubmissionBlockTrigger.
 *                      Blocks are built here, because TestFactory is shared and stays
 *                      unchanged.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 **/
@isTest
private class SubmissionGuardTest {
  private static final Integer HUMAN_MS = 9000;

  private static SubmissionGuard.Request request(
    String formKey,
    String email,
    String message
  ) {
    SubmissionGuard.Request req = new SubmissionGuard.Request();
    req.formKey = formKey;
    req.email = email;
    req.message = message;
    req.elapsedMs = HUMAN_MS;
    return req;
  }

  private static Submission_Block__c block(String type, String value) {
    return new Submission_Block__c(Type__c = type, Value__c = value);
  }

  @isTest
  static void acceptsAnOrdinarySubmission() {
    Test.startTest();
    SubmissionGuard.Decision decision = SubmissionGuard.check(
      request(SubmissionGuard.FORM_CONTACT, 'ada@example.com', 'Hello')
    );
    Test.stopTest();

    Assert.isTrue(decision.accept, 'Nothing blocks this submission');
    Assert.isFalse(decision.silentDrop, 'Not dropped');
    Assert.isFalse(decision.rateLimited, 'Not rate limited');
  }

  @isTest
  static void dropsWhenTheHoneypotIsFilled() {
    SubmissionGuard.Request req = request(
      SubmissionGuard.FORM_CONTACT,
      'ada@example.com',
      'Hello'
    );
    req.honeypot = 'https://spam.example';

    SubmissionGuard.Decision decision = SubmissionGuard.check(req);

    Assert.isTrue(decision.silentDrop, 'A filled honeypot drops silently');
    Assert.areEqual(SubmissionGuard.REASON_HONEYPOT, decision.reason, 'Reason');
    Assert.isFalse(decision.accept, 'Not accepted');
  }

  @isTest
  static void dropsWhenSentFasterThanAPerson() {
    SubmissionGuard.Request req = request(
      SubmissionGuard.FORM_CONTACT,
      'ada@example.com',
      'Hello'
    );
    req.elapsedMs = SubmissionGuard.MIN_ELAPSED_MS - 1;

    SubmissionGuard.Decision decision = SubmissionGuard.check(req);

    Assert.isTrue(decision.silentDrop, 'Too fast drops silently');
    Assert.areEqual(SubmissionGuard.REASON_TOO_FAST, decision.reason, 'Reason');
  }

  @isTest
  static void dropsWhenNoTimeIsSent() {
    SubmissionGuard.Request req = request(
      SubmissionGuard.FORM_CONTACT,
      'ada@example.com',
      'Hello'
    );
    req.elapsedMs = null;

    Assert.isTrue(
      SubmissionGuard.check(req).silentDrop,
      'A missing time counts as too fast'
    );
  }

  @isTest
  static void dropsABlockedEmailAndCountsTheHit() {
    Submission_Block__c blocked = block('Email', ' Spammer@Example.com ');
    insert blocked;

    Test.startTest();
    SubmissionGuard.Decision decision = SubmissionGuard.check(
      request(SubmissionGuard.FORM_CONTACT, 'SPAMMER@example.com', 'Hi')
    );
    Test.stopTest();

    Assert.isTrue(decision.silentDrop, 'A blocked email drops silently');
    Assert.areEqual(SubmissionGuard.REASON_BLOCKED, decision.reason, 'Reason');
    Submission_Block__c after = [
      SELECT Hit_Count__c, Last_Hit__c
      FROM Submission_Block__c
      WHERE Id = :blocked.Id
    ];
    Assert.areEqual(1, after.Hit_Count__c, 'The hit is counted');
    Assert.isNotNull(after.Last_Hit__c, 'The hit time is stored');
  }

  @isTest
  static void dropsABlockedDomainAndItsSubdomains() {
    insert block('Domain', 'mailinator.com');

    Assert.isTrue(
      SubmissionGuard.check(
          request(SubmissionGuard.FORM_CONTACT, 'x@mailinator.com', 'Hi')
        )
        .silentDrop,
      'The domain itself is blocked'
    );
    Assert.isTrue(
      SubmissionGuard.check(
          request(SubmissionGuard.FORM_CONTACT, 'x@eu.mailinator.com', 'Hi')
        )
        .silentDrop,
      'A subdomain of a blocked domain is blocked'
    );
    Assert.isTrue(
      SubmissionGuard.check(
          request(SubmissionGuard.FORM_CONTACT, 'x@notmailinator.com', 'Hi')
        )
        .accept,
      'A domain that only ends with the same letters is not blocked'
    );
  }

  @isTest
  static void dropsAMessageWithABlockedKeyword() {
    insert block('Keyword', 'Cheap Backlinks');

    SubmissionGuard.Decision decision = SubmissionGuard.check(
      request(
        SubmissionGuard.FORM_TESTIMONIAL,
        null,
        'We sell CHEAP backlinks today'
      )
    );

    Assert.isTrue(decision.silentDrop, 'A keyword anywhere drops silently');
  }

  @isTest
  static void ignoresAnInactiveBlock() {
    Submission_Block__c lifted = block('Email', 'ada@example.com');
    lifted.Active__c = false;
    insert lifted;

    Assert.isTrue(
      SubmissionGuard.check(
          request(SubmissionGuard.FORM_CONTACT, 'ada@example.com', 'Hi')
        )
        .accept,
      'An inactive block does nothing'
    );
  }

  @isTest
  static void limitsTheContactFormToItsDailyCap() {
    List<Lead> today = new List<Lead>();
    for (Integer i = 0; i < SubmissionGuard.CONTACT_DAILY_CAP; i++) {
      today.add(
        new Lead(
          LastName = 'Cap ' + i,
          Company = 'Cap',
          LeadSource = SubmissionGuard.LEAD_SOURCE
        )
      );
    }
    insert today;

    SubmissionGuard.Decision decision = SubmissionGuard.check(
      request(SubmissionGuard.FORM_CONTACT, 'late@example.com', 'Hi')
    );

    Assert.isTrue(decision.rateLimited, 'The cap is reached');
    Assert.isFalse(decision.accept, 'Not accepted over the cap');
    Assert.isFalse(decision.silentDrop, 'A real visitor is told, not dropped');
  }

  @isTest
  static void leadsFromOtherSourcesDoNotCountTowardTheCap() {
    List<Lead> other = new List<Lead>();
    for (Integer i = 0; i < SubmissionGuard.CONTACT_DAILY_CAP; i++) {
      other.add(
        new Lead(LastName = 'Web ' + i, Company = 'Web', LeadSource = 'Web')
      );
    }
    insert other;

    Assert.isTrue(
      SubmissionGuard.check(
          request(SubmissionGuard.FORM_CONTACT, 'ok@example.com', 'Hi')
        )
        .accept,
      'Only contact form Leads count'
    );
  }

  @isTest
  static void limitsTheTestimonialFormPerMinute() {
    RateWindowLimiter.nowOverride = Datetime.newInstanceGmt(
      2026,
      10,
      23,
      9,
      0,
      5
    );
    SubmissionGuard.Decision last;
    for (Integer i = 0; i <= SubmissionGuard.TESTIMONIAL_RATE_PER_MINUTE; i++) {
      last = SubmissionGuard.check(
        request(SubmissionGuard.FORM_TESTIMONIAL, null, 'Great work')
      );
    }
    Assert.isTrue(
      last.rateLimited,
      'The sixth testimonial in a minute is limited'
    );
  }

  @isTest
  static void anUnknownFormHasNoRateLimit() {
    Assert.isTrue(
      SubmissionGuard.check(request('other', null, 'Hi')).accept,
      'Only the two known forms are limited'
    );
  }

  @isTest
  static void refusesARequestWithoutAFormKey() {
    try {
      SubmissionGuard.check(request(null, null, null));
      Assert.fail('A form key is required');
    } catch (IllegalArgumentException e) {
      Assert.isTrue(
        e.getMessage().contains('form key'),
        'Message names the key'
      );
    }
  }

  @isTest
  static void triggerNormalisesValueAndKey() {
    Submission_Block__c saved = block('Domain', '  Spam.Example ');
    insert saved;

    saved = [
      SELECT Value__c, Unique_Key__c, Active__c
      FROM Submission_Block__c
      WHERE Id = :saved.Id
    ];
    Assert.areEqual('spam.example', saved.Value__c, 'Lower case and trimmed');
    Assert.areEqual('Domain:spam.example', saved.Unique_Key__c, 'Type:Value');
    Assert.isTrue(saved.Active__c, 'Active by default');
  }

  @isTest
  static void triggerRefusesADuplicateBlock() {
    insert block('Email', 'dup@example.com');
    Database.SaveResult result = Database.insert(
      block('Email', 'DUP@example.com'),
      false
    );
    Assert.isFalse(result.isSuccess(), 'The same block cannot be added twice');
  }

  @isTest
  static void domainOfHandlesMissingInput() {
    Assert.isNull(SubmissionGuard.domainOf(null), 'Null in, null out');
    Assert.isNull(SubmissionGuard.domainOf('no-at-sign'), 'No @, no domain');
    Assert.areEqual(
      'example.com',
      SubmissionGuard.domainOf('A@B@Example.COM'),
      'The part after the last @, lower case'
    );
  }

  @isTest
  static void minElapsedSettingDropsASubmissionUnderIt() {
    PortfolioSettings.overrideNumber('Contact_Min_Elapsed_Ms', HUMAN_MS + 1);

    SubmissionGuard.Decision decision = SubmissionGuard.check(
      request(SubmissionGuard.FORM_CONTACT, 'ada@example.com', 'Hello')
    );

    Assert.isTrue(decision.silentDrop, 'Under the set minimum drops silently');
    Assert.areEqual(SubmissionGuard.REASON_TOO_FAST, decision.reason, 'Reason');
  }

  @isTest
  static void minElapsedSettingAcceptsASubmissionOverIt() {
    PortfolioSettings.overrideNumber('Contact_Min_Elapsed_Ms', 1000);
    SubmissionGuard.Request req = request(
      SubmissionGuard.FORM_CONTACT,
      'ada@example.com',
      'Hello'
    );
    req.elapsedMs = 2000;

    Assert.isTrue(
      SubmissionGuard.check(req).accept,
      'Over the set minimum is accepted, though under the code default'
    );
  }

  @isTest
  static void contactCapSettingLimitsTheForm() {
    PortfolioSettings.overrideNumber('Contact_Daily_Cap', 2);
    insert new List<Lead>{
      new Lead(
        LastName = 'Cap 1',
        Company = 'Cap',
        LeadSource = SubmissionGuard.LEAD_SOURCE
      ),
      new Lead(
        LastName = 'Cap 2',
        Company = 'Cap',
        LeadSource = SubmissionGuard.LEAD_SOURCE
      )
    };

    SubmissionGuard.Decision decision = SubmissionGuard.check(
      request(SubmissionGuard.FORM_CONTACT, 'late@example.com', 'Hi')
    );

    Assert.isTrue(decision.rateLimited, 'Two Leads reach a cap of two');
  }

  @isTest
  static void testimonialRateSettingLimitsTheThirdInAMinute() {
    PortfolioSettings.overrideNumber('Testimonial_Rate_Per_Minute', 2);
    RateWindowLimiter.nowOverride = Datetime.newInstanceGmt(
      2026,
      10,
      23,
      9,
      0,
      5
    );
    List<Boolean> limited = new List<Boolean>();
    for (Integer i = 0; i < 3; i++) {
      limited.add(
        SubmissionGuard.check(
            request(SubmissionGuard.FORM_TESTIMONIAL, null, 'Great work')
          )
          .rateLimited
      );
    }

    Assert.areEqual(
      new List<Boolean>{ false, false, true },
      limited,
      'The third testimonial in a minute is limited'
    );
  }
}
