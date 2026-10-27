/**
 * @description       : The last provider of the content generation dispatch: a cover letter
 *                      put together in Apex with no model. It reads only what the site already
 *                      reads elsewhere: the grounding facts from PortfolioGroundingService (the
 *                      same highlights and projects coverLetterPrompt sends a model), the
 *                      owner's title and name from ResumeController.getHeader, the count of
 *                      current certifications from ResumeController.getTimeline, and the year
 *                      the owner started on Salesforce from the Salesforce_Start_Year setting.
 *                      Every sentence states only what those records hold. Visitor text has
 *                      email and phone shapes removed, and no employer name from a record goes
 *                      into the letter. The page shows the owner's header with its links above
 *                      every letter, so the letter itself carries no contact detail. The last
 *                      line says it is a template letter written without a model. It never throws: a failed read leaves its sentence out, and a
 *                      missing company, title or description gives a shorter letter.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/12/2025
 * @Test Class        : [LocalTemplateServiceTest]
 **/
public with sharing class LocalTemplateService implements IAIGenerationService {
  /** The setting that holds the year the owner started on Salesforce. */
  public static final String START_YEAR_SETTING = 'Salesforce_Start_Year';
  /** Code default of that setting. */
  public static final Integer DEFAULT_START_YEAR = 2017;
  /** Facts the letter quotes at most. */
  public static final Integer MAX_FACTS = 3;
  /** Words kept from one fact. */
  public static final Integer MAX_FACT_WORDS = 40;
  /** The name signed when no owner record names one. */
  public static final String DEFAULT_NAME = 'Ryan Bumstead';
  /** The last line of every letter. */
  public static final String TEMPLATE_NOTE = 'This is a template letter, put together from my portfolio records without an AI model.';

  // Tests name the reads to fail (facts, owner, certifications), to reach the recovery paths.
  @TestVisible
  private static Set<String> failReadsForTest = new Set<String>();

  /**
   * @description What the letter is built from. Every field may be empty.
   */
  @TestVisible
  private class LetterFacts {
    public String company;
    public String role;
    public Boolean hasDescription = false;
    public String ownerName;
    public String ownerTitle;
    public Integer startYear;
    public Integer certificationCount;
    public List<String> facts = new List<String>();
  }

  /**
   * @description Writes the template letter. Never throws.
   * @param prompt The prompt the models were sent. Not read: this provider uses no model.
   * @param context companyName, jobTitle and jobDescription, any of them may be missing.
   * @return String The letter.
   */
  public String generateContent(String prompt, Map<String, Object> context) {
    Map<String, Object> values = context ?? new Map<String, Object>();
    String company = cleanVisitorText(values.get('companyName'));
    String role = cleanVisitorText(values.get('jobTitle'));
    String description = cleanVisitorText(values.get('jobDescription'));
    LetterFacts letterFacts = new LetterFacts();
    letterFacts.company = company;
    letterFacts.role = role;
    letterFacts.hasDescription = description != null;
    try {
      readFacts(letterFacts, description);
    } catch (Exception e) {
      // Recovered on purpose: the template must always answer, with what it has so far.
      PortfolioLog.info(
        'LocalTemplateService facts failed: ' + e.getTypeName()
      );
    }
    return compose(letterFacts);
  }

  /**
   * @description Always true. The template needs nothing outside the org.
   * @return Boolean True.
   */
  public Boolean isAvailable() {
    return true;
  }

  private static void readFacts(LetterFacts letterFacts, String description) {
    failIfAsked('facts');
    letterFacts.startYear = PortfolioSettings.getInteger(
      START_YEAR_SETTING,
      DEFAULT_START_YEAR
    );
    readOwner(letterFacts);
    readCertifications(letterFacts);
    letterFacts.facts = groundingFacts(letterFacts.role, description);
  }

  private static void readOwner(LetterFacts letterFacts) {
    try {
      failIfAsked('owner');
      ResumeController.Header header = ResumeController.getHeader();
      letterFacts.ownerName = cleanRecordText(header?.name);
      letterFacts.ownerTitle = cleanRecordText(header?.title);
    } catch (Exception e) {
      // Recovered on purpose: the letter leaves the owner's title out.
      PortfolioLog.info(
        'LocalTemplateService owner failed: ' + e.getTypeName()
      );
    }
  }

  private static void readCertifications(LetterFacts letterFacts) {
    try {
      failIfAsked('certifications');
      ResumeController.Timeline timeline = ResumeController.getTimeline();
      letterFacts.certificationCount = timeline?.certifications?.size();
    } catch (Exception e) {
      // Recovered on purpose: the letter leaves the certification count out.
      PortfolioLog.info(
        'LocalTemplateService certifications failed: ' + e.getTypeName()
      );
    }
  }

  /**
   * @description Up to MAX_FACTS sentences from the grounding: highlights first, in the
   *              grounding's order, then featured projects. Employers are left out.
   * @param role Job title, or null.
   * @param description Job description, or null.
   * @return List<String> The sentences, empty when there are no records.
   */
  @TestVisible
  private static List<String> groundingFacts(String role, String description) {
    List<String> result = new List<String>();
    String persona = PortfolioGroundingService.inferPersona(role, description);
    String facts = PortfolioGroundingService.build(role, description, persona);
    if (String.isBlank(facts)) {
      return result;
    }
    PortfolioGroundingService.Grounding grounding = (PortfolioGroundingService.Grounding) JSON.deserialize(
      facts,
      PortfolioGroundingService.Grounding.class
    );
    for (
      PortfolioGroundingService.HighlightFact highlight : grounding.highlights
    ) {
      addFact(result, highlight.role, highlight.text);
    }
    for (PortfolioGroundingService.ProjectFact project : grounding.projects) {
      addFact(
        result,
        project.name,
        project.businessValue ?? project.solution ?? project.challenge
      );
    }
    return result;
  }

  private static void addFact(List<String> facts, String label, String text) {
    if (facts.size() >= MAX_FACTS || String.isBlank(text)) {
      return;
    }
    String sentence = sentenceOf(firstWords(text, MAX_FACT_WORDS));
    facts.add(
      String.isBlank(label) ? sentence : 'As ' + label + ': ' + sentence
    );
  }

  /**
   * @description The letter: greeting, the role, the owner's background, the facts, a close,
   *              the name and the template note.
   * @param letterFacts What the letter is built from.
   * @return String The letter.
   */
  @TestVisible
  private static String compose(LetterFacts letterFacts) {
    List<String> paragraphs = new List<String>{
      greeting(letterFacts.company),
      opening(letterFacts)
    };
    String background = background(letterFacts);
    if (background != null) {
      paragraphs.add(background);
    }
    if (!letterFacts.facts.isEmpty()) {
      paragraphs.add(
        (letterFacts.hasDescription
            ? 'From my portfolio records, these are the parts closest to your description:'
            : 'From my portfolio records, these are the parts closest to the role:') +
          '\n- ' +
          String.join(letterFacts.facts, '\n- ')
      );
    }
    paragraphs.add(
      'I would welcome a conversation about the role and where I could help your team. Thank you for reading.'
    );
    paragraphs.add(
      'Sincerely,\n' +
      (String.isBlank(letterFacts.ownerName)
        ? DEFAULT_NAME
        : letterFacts.ownerName)
    );
    paragraphs.add(TEMPLATE_NOTE);
    return String.join(paragraphs, '\n\n');
  }

  private static String greeting(String company) {
    return company == null
      ? 'Dear hiring team,'
      : 'Dear ' + company + ' hiring team,';
  }

  private static String opening(LetterFacts letterFacts) {
    String role = letterFacts.role == null
      ? 'the open role'
      : 'the ' + letterFacts.role + ' role';
    String atCompany = letterFacts.company == null
      ? ''
      : ' at ' + letterFacts.company;
    return 'I would like to be considered for ' +
      role +
      atCompany +
      '. Below is a short account of my background and the work in my portfolio that fits it best.';
  }

  private static String background(LetterFacts letterFacts) {
    List<String> sentences = new List<String>();
    if (letterFacts.ownerTitle != null) {
      sentences.add('My current title is ' + letterFacts.ownerTitle + '.');
    }
    if (letterFacts.startYear != null) {
      sentences.add(
        'I have worked on the Salesforce platform since ' +
          letterFacts.startYear +
          '.'
      );
    }
    Integer certifications = letterFacts.certificationCount;
    if (certifications != null && certifications > 0) {
      sentences.add(
        certifications == 1
          ? 'I hold 1 current certification.'
          : 'I hold ' + certifications + ' current certifications.'
      );
    }
    return sentences.isEmpty() ? null : String.join(sentences, ' ');
  }

  private static String cleanVisitorText(Object value) {
    if (!(value instanceof String) || String.isBlank((String) value)) {
      return null;
    }
    String cleaned = PortfolioGroundingService.removeContactDetails(
      ((String) value).normalizeSpace()
    );
    return String.isBlank(cleaned) ? null : cleaned;
  }

  private static String cleanRecordText(String value) {
    return String.isBlank(value)
      ? null
      : PortfolioGroundingService.removeContactDetails(value.normalizeSpace());
  }

  @TestVisible
  private static String firstWords(String text, Integer maxWords) {
    List<String> words = text.normalizeSpace().split(' ');
    if (words.size() <= maxWords) {
      return String.join(words, ' ');
    }
    List<String> kept = new List<String>();
    for (Integer i = 0; i < maxWords; i++) {
      kept.add(words[i]);
    }
    return String.join(kept, ' ').removeEnd(',') + '...';
  }

  private static void failIfAsked(String read) {
    if (failReadsForTest.contains(read)) {
      throw new QueryException('Forced by a test: ' + read);
    }
  }

  private static String sentenceOf(String text) {
    String trimmed = text.trim();
    Boolean ended =
      trimmed.endsWith('.') ||
      trimmed.endsWith('!') ||
      trimmed.endsWith('?');
    return ended ? trimmed : trimmed + '.';
  }
}
