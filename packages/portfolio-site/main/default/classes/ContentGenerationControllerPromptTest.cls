/**
 * @description       : Unit tests for ContentGenerationController.coverLetterPrompt, the one
 *                      cover letter prompt builder: the word range from the settings, the
 *                      instruction from the Cover_Letter record or the code fallback, the
 *                      persona line, the grounding facts and no email or phone. Model output
 *                      is not unit testable, so these tests assert the prompt's parts. Builds
 *                      its own records.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/24/2026
 **/
@IsTest
private class ContentGenerationControllerPromptTest {
  private static final Pattern PHONE_SHAPE = Pattern.compile(
    '\\(?\\d{3}\\)?[\\s.-]?\\d{3}[\\s.-]?\\d{4}'
  );

  private static void useFallbackInstruction() {
    ContentGenerationController.promptOverride = new List<AI_Prompt__mdt>();
  }

  private static void useInstruction(String text) {
    ContentGenerationController.promptOverride = new List<AI_Prompt__mdt>{
      new AI_Prompt__mdt(
        DeveloperName = ContentGenerationController.COVER_LETTER_PROMPT_NAME,
        Instruction__c = text
      )
    };
  }

  private static String promptFor(
    String company,
    String title,
    String description
  ) {
    Test.startTest();
    String prompt = ContentGenerationController.coverLetterPrompt(
      company,
      title,
      description
    );
    Test.stopTest();
    return prompt;
  }

  @IsTest
  static void wordRangeComesFromTheSettings() {
    useFallbackInstruction();
    PortfolioSettings.overrideNumber('Cover_Letter_Min_Words', 300);
    PortfolioSettings.overrideNumber('Cover_Letter_Max_Words', 400);

    String prompt = promptFor('Acme', 'Architect', null);

    Assert.isTrue(
      prompt.contains('\nWord limit: 300 to 400 words, never more than 400. '),
      'The range the settings hold, the maximum as the limit'
    );
    Assert.isFalse(
      prompt.contains('\nLength: '),
      'No Length line, so the template adds no length push of its own'
    );
  }

  @IsTest
  static void lengthLineSetsTheShapeThatKeepsALetterUnderTheMaximum() {
    String line = ContentGenerationController.coverLetterLengthLine(
      new List<Integer>{ 250, 350 }
    );

    Assert.isTrue(line.startsWith('Word limit: 250 to 350 words'), line);
    Assert.isTrue(line.contains('never more than 350.'), line);
    Assert.isTrue(
      line.contains('three body paragraphs of three sentences each'),
      line
    );
    Assert.isFalse(line.contains('\n'), 'One line');
  }

  @IsTest
  static void missingSettingsGiveTheCodeRange() {
    useFallbackInstruction();
    PortfolioSettings.overrides.put('Cover_Letter_Min_Words', null);
    PortfolioSettings.overrides.put('Cover_Letter_Max_Words', null);

    String prompt = promptFor('Acme', 'Architect', null);

    Assert.isTrue(
      prompt.contains(
        ContentGenerationController.WORD_LIMIT_PREFIX +
          ContentGenerationController.COVER_LETTER_MIN_WORDS +
          ' to ' +
          ContentGenerationController.COVER_LETTER_MAX_WORDS +
          ' words, never more than ' +
          ContentGenerationController.COVER_LETTER_MAX_WORDS +
          '.'
      ),
      prompt
    );
    Assert.areEqual(
      250,
      ContentGenerationController.COVER_LETTER_MIN_WORDS,
      'Min'
    );
    Assert.areEqual(
      350,
      ContentGenerationController.COVER_LETTER_MAX_WORDS,
      'Max'
    );
  }

  @IsTest
  static void invertedSettingsGiveTheCodeRange() {
    PortfolioSettings.overrideNumber('Cover_Letter_Min_Words', 500);
    PortfolioSettings.overrideNumber('Cover_Letter_Max_Words', 200);

    Test.startTest();
    List<Integer> range = ContentGenerationController.coverLetterWordRange();
    Test.stopTest();

    Assert.areEqual(250, range[0], 'Code minimum');
    Assert.areEqual(350, range[1], 'Code maximum');
  }

  @IsTest
  static void missingRecordGivesTheFallbackInstructionWithItsStructure() {
    useFallbackInstruction();

    String prompt = promptFor('Acme', 'Architect', null);

    Assert.isTrue(
      prompt.startsWith(ContentGenerationController.COVER_LETTER_INSTRUCTION),
      'The fallback comes first'
    );
    List<String> expectedParts = new List<String>{
      'in his own voice',
      'one professional tone',
      'why this role at this company',
      'Two or three body paragraphs',
      'ties it to one specific fact',
      'A short close',
      'Do not invent',
      'No clichés',
      'Do not write an email address, a phone number'
    };
    for (String part : expectedParts) {
      Assert.isTrue(prompt.contains(part), 'Instruction holds: ' + part);
    }
  }

  @IsTest
  static void blankRecordGivesTheFallbackInstruction() {
    useInstruction('   ');

    String prompt = promptFor('Acme', 'Architect', null);

    Assert.isTrue(
      prompt.startsWith(ContentGenerationController.COVER_LETTER_INSTRUCTION),
      'Blank reads as missing'
    );
  }

  @IsTest
  static void recordInstructionReplacesTheFallback() {
    useInstruction('Write a short letter.\r\nKeep it plain.');

    String prompt = promptFor('Acme', 'Architect', null);

    List<String> lines = prompt.split('\n');
    Assert.areEqual('Write a short letter.', lines[0], 'The record first');
    Assert.areEqual('Keep it plain.', lines[1], 'Line breaks kept');
    Assert.isFalse(
      prompt.contains('Two or three body paragraphs'),
      'The fallback is not added'
    );
    Assert.isTrue(
      prompt.contains('\n' + ContentGenerationController.WORD_LIMIT_PREFIX),
      'The range is still added'
    );
  }

  @IsTest
  static void shippedRecordMatchesTheFallback() {
    // No override, so this reads the deployed Cover_Letter record.
    Test.startTest();
    String instruction = ContentGenerationController.coverLetterInstruction();
    Test.stopTest();

    Assert.areEqual(
      ContentGenerationController.COVER_LETTER_INSTRUCTION,
      instruction,
      'The record ships equal to the code text'
    );
  }

  @IsTest
  static void jobLinesFollowTheRangeInOrder() {
    useFallbackInstruction();

    String prompt = promptFor(' Acme ', 'Platform Lead', 'Lead the roadmap');

    Assert.isTrue(
      prompt.contains(
        ' words.\ncompanyName: Acme\nrole: Platform Lead\njobDescription: Lead the roadmap'
      ),
      prompt
    );
  }

  @IsTest
  static void blankDescriptionAddsNoDescriptionLine() {
    useFallbackInstruction();

    String prompt = promptFor('Acme', 'Platform Lead', '  ');

    Assert.isFalse(prompt.contains('jobDescription:'), 'No empty line');
  }

  @IsTest
  static void personaFromTheTitleIsPassed() {
    useFallbackInstruction();

    String prompt = promptFor('Acme', 'Senior Salesforce Developer', null);

    Assert.isTrue(prompt.contains('\npersona: Developer'), prompt);
  }

  @IsTest
  static void noPersonaLineWhenTheJobPointsAtNone() {
    useFallbackInstruction();

    String prompt = promptFor('Acme', 'Operations Lead', null);

    Assert.isFalse(prompt.contains('persona:'), 'No persona to pass');
  }

  @IsTest
  static void groundingFactsAreIncluded() {
    useFallbackInstruction();
    insert new Project__c(
      Name = 'Integration Hub',
      Sort_Order__c = 1,
      Is_Featured__c = true,
      Status__c = 'Active Development',
      Challenge__c = 'Integrations were brittle'
    );

    String prompt = promptFor('Acme', 'Integration Architect', null);

    Assert.isTrue(prompt.contains('Integration Hub'), 'The fact is in');
    Assert.isTrue(
      prompt.contains('Use only these facts'),
      'The grounding line is in'
    );
    Assert.isTrue(
      prompt.indexOf('persona: Architect') < prompt.indexOf('Integration Hub'),
      'The persona comes before the facts'
    );
  }

  @IsTest
  static void noEmailOrPhoneFromTheVisitorReachesThePrompt() {
    useFallbackInstruction();

    String prompt = promptFor(
      'Acme',
      'Architect',
      'Send your resume to hiring@acme.example or call (555) 014-2424 today'
    );

    Assert.isFalse(prompt.contains('@'), 'No email');
    Assert.isFalse(PHONE_SHAPE.matcher(prompt).find(), 'No phone');
    Assert.isTrue(
      prompt.contains(
        'jobDescription: Send your resume to [removed] or call [removed] today'
      ),
      prompt
    );
  }
}
