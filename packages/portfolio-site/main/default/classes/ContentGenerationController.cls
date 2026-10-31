/**
 * @description       : Content generation. dispatch() is the one provider chain: Agentforce,
 *                      then Gemini, then the local template. Agentforce
 *                      is consulted only when AgentforceService.isAvailable() says its switch is
 *                      on and the caller is not a site guest. A request can ask for Agentforce
 *                      only (agentforceOnly, used by the API's provider Agentforce) or start at
 *                      Gemini because the caller already tried Agentforce (skipAgentforce, used
 *                      by ApiLabController). No result names Agentforce unless a real Agentforce
 *                      call produced the content (3.1). Agentforce is held to its record's
 *                      Hourly_Budget__c per clock hour (AgentforceServiceBudget). Past it the
 *                      attempt is budget_exhausted and the chain moves on.
 *                      Every attempt is recorded with its outcome and elapsed time.
 *                      PAPIAiGenerate (POST /papi/ai/generate) and generateCoverLetter both
 *                      call it. The site page reaches it in process through
 *                      ApiLabController.generateCoverLetter. providerStatus() is the read-only provider view for the
 *                      footer. The agentforce and gemini providers each have a circuit
 *                      breaker. An open circuit records the attempt as
 *                      skipped_open_circuit and moves on. Breaker results are written once
 *                      every provider has been tried, after the last callout.
 *                      coverLetterPrompt() is the one cover letter prompt builder, used by
 *                      generateCoverLetter and by ApiLabController.generateCoverLetter. Its
 *                      instruction comes from the AI_Prompt__mdt record Cover_Letter, with
 *                      COVER_LETTER_INSTRUCTION as the fallback, and its word limit from the
 *                      Cover_Letter_Min_Words and Cover_Letter_Max_Words settings, with the
 *                      paragraph and sentence shape that keeps a letter under the maximum.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 12/19/2025
 * @Test Class        : [ContentGenerationControllerTest]
 **/
public with sharing class ContentGenerationController {
  /**
   * @description Thrown when no provider produced usable content.
   */
  public class ContentGenerationException extends Exception {
    /** Every attempt of the dispatch that threw, when the dispatch threw it. */
    public List<Attempt> attempts = new List<Attempt>();
  }

  public static final String PROVIDER_AGENTFORCE = 'Agentforce';
  public static final String PROVIDER_GEMINI = 'Gemini';
  public static final String PROVIDER_LOCAL = 'Local';
  /** Default Gemini model. The model reported is GeminiService.model(), read from its record. */
  public static final String MODEL_GEMINI = GeminiService.MODEL;
  public static final String MODEL_LOCAL = 'local-template';

  /** Attempt outcomes. */
  public static final String OUTCOME_SERVED = 'served';
  public static final String OUTCOME_SKIPPED_OFF = 'skipped_off';
  public static final String OUTCOME_SKIPPED_OPEN_CIRCUIT = 'skipped_open_circuit';
  public static final String OUTCOME_FAILED = 'failed';
  /** Agentforce has used its Hourly_Budget__c for this clock hour. */
  public static final String OUTCOME_BUDGET_EXHAUSTED = 'budget_exhausted';

  private static final String DETAIL_NO_CONTENT = 'No usable content';
  private static final Integer DETAIL_MAX_LENGTH = 120;

  /** Provider states reported by providerStatus(). */
  public static final String STATE_ON = 'on';
  public static final String STATE_OFF = 'off';
  public static final String STATE_NOT_BUILT = 'not built';

  /** DeveloperName of the cover letter's AI_Prompt__mdt record. */
  public static final String COVER_LETTER_PROMPT_NAME = 'Cover_Letter';
  /** Code defaults of the word range settings. */
  public static final Integer COVER_LETTER_MIN_WORDS = 250;
  public static final Integer COVER_LETTER_MAX_WORDS = 350;
  public static final String MIN_WORDS_SETTING = 'Cover_Letter_Min_Words';
  public static final String MAX_WORDS_SETTING = 'Cover_Letter_Max_Words';
  /**
   * The length line starts with this, not with "Length", so the Portfolio_Cover_Letter
   * template's own sentence for a Length line (write toward the upper number, in three body
   * paragraphs of five sentences) does not apply. That sentence pushed letters past the
   * maximum. The line sets the paragraph and sentence shape itself, which the model keeps to
   * more closely than a word count.
   */
  public static final String WORD_LIMIT_PREFIX = 'Word limit: ';

  /**
   * The cover letter instruction used when the Cover_Letter record is missing or blank. The
   * record ships with the same text.
   */
  public static final String COVER_LETTER_INSTRUCTION = String.join(
    new List<String>{
      'Write a cover letter from Ryan Bumstead for the job below, in his own voice, in the first person, in one professional tone.',
      'Shape:',
      '1. Greet the hiring team at the company by name. Then one short paragraph on why this role at this company, drawn from the role and the job description. Do not open with "I am writing to apply".',
      '2. Two or three body paragraphs. Each one names one requirement from the job and ties it to one specific fact from the facts below, such as a project, a highlight or a number the facts state. Say which project or role the fact comes from.',
      '3. A short close of one or two sentences that asks for a conversation. Then sign off with the name Ryan Bumstead.',
      'Rules:',
      '- Use only the facts below. Do not invent employers, projects, clients, dates, certifications or numbers. When the job asks for something the facts do not show, leave it out rather than claim it.',
      '- When there is no job description, work from the role title and the company name, and choose the facts that fit the role best.',
      '- When a persona is given, lead with the facts that show that kind of work.',
      '- No clichés, such as "passionate", "team player", "hit the ground running", "perfect fit" or "great asset".',
      '- Do not write an email address, a phone number, a street address or a placeholder in square brackets.',
      '- Plain text only, with no markdown, headings or bullet points.',
      '- Return only the letter.'
    },
    '\n'
  );

  // Tests set this to stand in for the Cover_Letter record. An empty list reads as missing.
  @TestVisible
  private static List<AI_Prompt__mdt> promptOverride;

  // GeminiService.generateContent reports failure by returning text with these prefixes
  // instead of throwing, so the dispatch treats such text as a failed attempt.
  private static final List<String> GEMINI_FAILURE_PREFIXES = new List<String>{
    'Error: Unable to generate content.',
    'Exception: '
  };

  @TestVisible
  private static IAIGenerationService mockAgentforceService;
  @TestVisible
  private static IAIGenerationService mockGeminiService;
  @TestVisible
  private static IAIGenerationService mockLocalService;

  /**
   * @description Input to dispatch().
   */
  public class GenerationRequest {
    public String prompt;
    public Map<String, Object> context;
    public Boolean localAllowed;
    /**
     * True when only Agentforce may serve: no Gemini, no local template, and a failure throws.
     * POST /papi/ai/generate sets it for provider Agentforce.
     */
    public Boolean agentforceOnly = false;
    /**
     * True when the caller has already tried Agentforce another way and records that attempt
     * itself, so the chain starts at Gemini. ApiLabController sets it after its call to the API.
     */
    public Boolean skipAgentforce = false;

    /**
     * @description Creates a request.
     * @param prompt Prompt text for the model.
     * @param context Values for the providers (companyName, jobTitle, jobDescription, ...).
     * @param localAllowed True when the local template can serve this request type.
     */
    public GenerationRequest(
      String prompt,
      Map<String, Object> context,
      Boolean localAllowed
    ) {
      this.prompt = prompt;
      this.context = context;
      this.localAllowed = localAllowed;
    }
  }

  /**
   * @description One provider attempt inside a dispatch.
   */
  public class Attempt {
    @AuraEnabled
    public String provider;
    @AuraEnabled
    public String outcome;
    @AuraEnabled
    public Long ms;
    /**
     * Why a failed attempt failed: "HTTP 503", or the exception type and a short message.
     * Never a key, never a URL. Null when the attempt served or was skipped.
     */
    @AuraEnabled
    public String detail;

    /**
     * @description Creates an attempt record.
     * @param provider Provider name.
     * @param outcome One of the OUTCOME_ constants.
     * @param ms Elapsed milliseconds.
     */
    public Attempt(String provider, String outcome, Long ms) {
      this(provider, outcome, ms, null);
    }

    /**
     * @description Creates an attempt record with a failure detail.
     * @param provider Provider name.
     * @param outcome One of the OUTCOME_ constants.
     * @param ms Elapsed milliseconds.
     * @param detail Short, key-free reason for a failure, or null.
     */
    public Attempt(String provider, String outcome, Long ms, String detail) {
      this.provider = provider;
      this.outcome = outcome;
      this.ms = ms;
      this.detail = detail;
    }
  }

  /**
   * @description Outcome of a dispatch: the text, who served it and how.
   */
  public class GenerationResult {
    @AuraEnabled
    public String content;
    /** Agentforce, Gemini or Local. Agentforce only when a real Agentforce call served. */
    @AuraEnabled
    public String provider;
    @AuraEnabled
    public String model;
    /** True when the local template served or an earlier provider failed. */
    @AuraEnabled
    public Boolean fallbackOccurred;
    /** Total dispatch time in milliseconds. */
    @AuraEnabled
    public Long latencyMs;
    @AuraEnabled
    public List<Attempt> attempts;
    /** The prompt sent to the serving provider, null when the local template served. */
    @AuraEnabled
    public String promptShown;
  }

  /**
   * @description One provider row for the footer.
   */
  public class ProviderStatus {
    @AuraEnabled
    public String provider;
    @AuraEnabled
    public String model;
    @AuraEnabled
    public Boolean enabled;
    /** on, off or not built. */
    @AuraEnabled
    public String state;
    @AuraEnabled
    public Integer sortOrder;
    /** When this provider's open circuit closes. Null when the circuit is closed. */
    @AuraEnabled
    public Datetime circuitOpenUntil;
  }

  /**
   * @description The one provider chain: Agentforce when its switch is on, then Gemini, then
   *              the local template when the request allows it. Its only DML is the
   *              circuit breaker writes, made after the last provider call.
   * @param request Prompt, provider context and whether Local may serve.
   * @return GenerationResult The content, the serving provider and every attempt.
   * @throws ContentGenerationException When the prompt is blank or no provider served.
   * @example
   * GenerationResult result = ContentGenerationController.dispatch(
   *   new ContentGenerationController.GenerationRequest(prompt, context, true)
   * );
   */
  public static GenerationResult dispatch(GenerationRequest request) {
    if (request == null || String.isBlank(request.prompt)) {
      throw new ContentGenerationException('A prompt is required.');
    }
    Map<String, Object> context = request.context ?? new Map<String, Object>();
    Long started = System.currentTimeMillis();
    List<Attempt> attempts = new List<Attempt>();
    List<String> errors = new List<String>();
    pendingBreakerResults = new Map<String, Boolean>();

    String text;
    if (request.skipAgentforce != true) {
      IAIGenerationService agentforce = (mockAgentforceService != null)
        ? mockAgentforceService
        : new AgentforceService();
      text = tryProvider(
        PROVIDER_AGENTFORCE,
        agentforce,
        request.prompt,
        context,
        attempts,
        errors
      );
      if (text != null) {
        return result(
          text,
          PROVIDER_AGENTFORCE,
          AgentforceService.model(),
          request.prompt,
          attempts,
          started
        );
      }
    }
    if (request.agentforceOnly == true) {
      recordBreakerResults();
      ContentGenerationException failure = new ContentGenerationException(
        'Agentforce did not serve. Errors: ' + String.join(errors, '; ')
      );
      failure.attempts = attempts;
      throw failure;
    }

    IAIGenerationService gemini = (mockGeminiService != null)
      ? mockGeminiService
      : new GeminiService();
    text = tryProvider(
      PROVIDER_GEMINI,
      gemini,
      request.prompt,
      context,
      attempts,
      errors
    );
    if (text != null) {
      return result(
        text,
        PROVIDER_GEMINI,
        GeminiService.model(),
        request.prompt,
        attempts,
        started
      );
    }

    if (request.localAllowed == true) {
      IAIGenerationService local = (mockLocalService != null)
        ? mockLocalService
        : new LocalTemplateService();
      text = tryProvider(
        PROVIDER_LOCAL,
        local,
        request.prompt,
        context,
        attempts,
        errors
      );
      if (text != null) {
        // The local template ignores the prompt, so there is no prompt to show.
        return result(
          text,
          PROVIDER_LOCAL,
          MODEL_LOCAL,
          null,
          attempts,
          started
        );
      }
    }

    recordBreakerResults();
    ContentGenerationException failure = new ContentGenerationException(
      'Content generation failed. Errors: ' + String.join(errors, '; ')
    );
    failure.attempts = attempts;
    throw failure;
  }
  /**
   * @description Generates a cover letter through dispatch(), grounded on portfolio records.
   *              The site page does not call this method. It reaches the same dispatch
   *              in process through ApiLabController.generateCoverLetter.
   * @param companyName Name of the target company.
   * @param jobTitle Title of the job.
   * @param jobDescription Description of the job, may be blank.
   * @return GenerationResult The letter, the serving provider and every attempt.
   * @throws AuraHandledException When an input is missing or every provider fails.
   */
  @AuraEnabled
  public static GenerationResult generateCoverLetter(
    String companyName,
    String jobTitle,
    String jobDescription
  ) {
    if (String.isBlank(companyName)) {
      throw auraError('Company name is required.');
    }
    if (String.isBlank(jobTitle)) {
      throw auraError('Job title is required.');
    }

    Map<String, Object> context = new Map<String, Object>{
      'companyName' => companyName,
      'jobTitle' => jobTitle,
      'jobDescription' => jobDescription
    };
    try {
      return dispatch(
        new GenerationRequest(
          coverLetterPrompt(companyName, jobTitle, jobDescription),
          context,
          true
        )
      );
    } catch (ContentGenerationException e) {
      throw auraError(
        'No AI provider could write the letter. Try again later.'
      );
    }
  }

  /**
   * @description The grounding block for a cover letter prompt. A grounding
   *              failure never blocks the letter: the prompt then goes without facts.
   * @param jobTitle Job title the letter is for.
   * @param jobDescription Job description, may be blank.
   * @return String Instruction line plus facts JSON, or null when there are no facts.
   */
  public static String groundingSection(
    String jobTitle,
    String jobDescription
  ) {
    return groundingSection(jobTitle, jobDescription, null);
  }

  /**
   * @description The grounding block, with the highlights of the persona ranked first.
   * @param jobTitle Job title the letter is for.
   * @param jobDescription Job description, may be blank.
   * @param persona Architect, Developer or Admin, or null.
   * @return String Instruction line plus facts JSON, or null when there are no facts.
   */
  public static String groundingSection(
    String jobTitle,
    String jobDescription,
    String persona
  ) {
    String facts;
    try {
      facts = PortfolioGroundingService.build(
        jobTitle,
        jobDescription,
        persona
      );
    } catch (QueryException e) {
      facts = null;
    }
    if (String.isBlank(facts)) {
      return null;
    }
    return 'Facts about Ryan Bumstead\'s work, as JSON. Use only these facts and do not invent projects, employers or numbers:\n' +
      facts;
  }

  /**
   * @description The cover letter prompt, built in one place for every cover letter path.
   *              Lines, in order: the instruction (the Cover_Letter record, else
   *              COVER_LETTER_INSTRUCTION), the word limit line (coverLetterLengthLine), the company,
   *              the role, the job description when given, the persona when the job points
   *              at one, and the grounding facts when there are any. Email and phone shapes
   *              are removed from the visitor's text. A grounding failure leaves the facts
   *              out and never blocks the letter.
   * @param companyName Company the letter is for.
   * @param jobTitle Job title.
   * @param jobDescription Job description, may be blank.
   * @return String The prompt.
   * @example
   * String prompt = ContentGenerationController.coverLetterPrompt('Acme', 'Architect', null);
   */
  public static String coverLetterPrompt(
    String companyName,
    String jobTitle,
    String jobDescription
  ) {
    String company = PortfolioGroundingService.removeContactDetails(
      companyName
    );
    String title = PortfolioGroundingService.removeContactDetails(jobTitle);
    String description = PortfolioGroundingService.removeContactDetails(
      jobDescription
    );
    List<Integer> range = coverLetterWordRange();
    List<String> lines = new List<String>{
      coverLetterInstruction(),
      coverLetterLengthLine(range),
      'companyName: ' + company,
      'role: ' + title
    };
    if (description != null) {
      lines.add('jobDescription: ' + description);
    }
    String persona = PortfolioGroundingService.inferPersona(title, description);
    if (persona != null) {
      lines.add('persona: ' + persona);
    }
    String grounding = groundingSection(title, description, persona);
    if (grounding != null) {
      lines.add(grounding);
    }
    return String.join(lines, '\n');
  }

  /**
   * @description The cover letter instruction: Instruction__c of the Cover_Letter record,
   *              read with SOQL because getInstance returns only the first 255 characters of
   *              a long text field. A missing or blank record gives COVER_LETTER_INSTRUCTION.
   * @return String The instruction.
   */
  public static String coverLetterInstruction() {
    List<AI_Prompt__mdt> rows = promptOverride != null
      ? promptOverride
      : [
          SELECT Instruction__c
          FROM AI_Prompt__mdt
          WHERE DeveloperName = :COVER_LETTER_PROMPT_NAME
          WITH SYSTEM_MODE
          LIMIT 1
        ];
    String instruction = rows.isEmpty() ? null : rows[0].Instruction__c;
    return String.isBlank(instruction)
      ? COVER_LETTER_INSTRUCTION
      : instruction.replace('\r\n', '\n').trim();
  }

  /**
   * @description The prompt's length line: the word range from the settings, the maximum
   *              as a hard limit, and the paragraph and sentence shape that keeps a letter
   *              inside it.
   * @param range The minimum and the maximum, from coverLetterWordRange.
   * @return String The line.
   * @example
   * String line = ContentGenerationController.coverLetterLengthLine(
   *   ContentGenerationController.coverLetterWordRange()
   * );
   */
  public static String coverLetterLengthLine(List<Integer> range) {
    return WORD_LIMIT_PREFIX +
      range[0] +
      ' to ' +
      range[1] +
      ' words, never more than ' +
      range[1] +
      '. This limit overrides any later line about length, paragraphs or sentences.' +
      ' Write five paragraphs and no more: an opening of two sentences, three body' +
      ' paragraphs of three sentences each, and a closing of two sentences, then the' +
      ' sign off. Keep each sentence under 25 words.';
  }

  /**
   * @description The word range the prompt asks for, from the two settings. A pair whose
   *              minimum is above its maximum gives both code defaults.
   * @return List<Integer> The minimum and the maximum.
   */
  public static List<Integer> coverLetterWordRange() {
    Integer minWords = PortfolioSettings.getInteger(
      MIN_WORDS_SETTING,
      COVER_LETTER_MIN_WORDS
    );
    Integer maxWords = PortfolioSettings.getInteger(
      MAX_WORDS_SETTING,
      COVER_LETTER_MAX_WORDS
    );
    if (minWords > maxWords) {
      return new List<Integer>{
        COVER_LETTER_MIN_WORDS,
        COVER_LETTER_MAX_WORDS
      };
    }
    return new List<Integer>{ minWords, maxWords };
  }

  /**
   * @description Read-only provider view for the Glass Box footer. Reads the
   *              switch only. It never says Agentforce is on while the class is not built.
   *              circuitOpenUntil comes from the agentforce and gemini breakers.
   * @return List<ProviderStatus> Agentforce, Gemini and Local in dispatch order.
   */
  @AuraEnabled(cacheable=true)
  public static List<ProviderStatus> providerStatus() {
    Boolean agentforceEnabled = AgentforceService.isEnabled();
    String agentforceState = !agentforceEnabled
      ? STATE_OFF
      : (AgentforceService.IMPLEMENTED ? STATE_ON : STATE_NOT_BUILT);
    List<ProviderStatus> rows = new List<ProviderStatus>{
      status(
        PROVIDER_AGENTFORCE,
        AgentforceService.model(),
        agentforceEnabled,
        agentforceState,
        1
      ),
      status(PROVIDER_GEMINI, GeminiService.model(), true, STATE_ON, 2),
      status(PROVIDER_LOCAL, MODEL_LOCAL, true, STATE_ON, 3)
    };
    for (ProviderStatus row : rows) {
      String key = breakerKeyFor(row.provider);
      row.circuitOpenUntil = key == null ? null : CircuitBreaker.openUntil(key);
    }
    return rows;
  }

  private static ProviderStatus status(
    String provider,
    String model,
    Boolean enabled,
    String state,
    Integer sortOrder
  ) {
    ProviderStatus row = new ProviderStatus();
    row.provider = provider;
    row.model = model;
    row.enabled = enabled;
    row.state = state;
    row.sortOrder = sortOrder;
    return row;
  }

  private static String tryProvider(
    String provider,
    IAIGenerationService service,
    String prompt,
    Map<String, Object> context,
    List<Attempt> attempts,
    List<String> errors
  ) {
    Long started = System.currentTimeMillis();
    if (!service.isAvailable()) {
      attempts.add(new Attempt(provider, OUTCOME_SKIPPED_OFF, 0L));
      errors.add(provider + ': unavailable');
      return null;
    }
    String breakerKey = breakerKeyFor(provider);
    if (breakerKey != null && CircuitBreaker.isOpen(breakerKey)) {
      attempts.add(new Attempt(provider, OUTCOME_SKIPPED_OPEN_CIRCUIT, 0L));
      errors.add(provider + ': circuit open');
      return null;
    }
    if (provider == PROVIDER_AGENTFORCE && !reserveAgentforceCall()) {
      attempts.add(new Attempt(provider, OUTCOME_BUDGET_EXHAUSTED, 0L));
      errors.add(provider + ': hourly budget used');
      return null;
    }
    String detail;
    try {
      String text = service.generateContent(prompt, context);
      if (isUsable(text)) {
        attempts.add(new Attempt(provider, OUTCOME_SERVED, elapsed(started)));
        noteBreakerResult(breakerKey, true);
        return text;
      }
      errors.add(provider + ': no usable content');
      detail = service instanceof GeminiService
        ? GeminiService.lastFailureDetail()
        : null;
      detail = detail ?? DETAIL_NO_CONTENT;
    } catch (Exception e) {
      errors.add(provider + ': ' + e.getMessage());
      detail = failureDetail(e);
    }
    attempts.add(
      new Attempt(provider, OUTCOME_FAILED, elapsed(started), detail)
    );
    noteBreakerResult(breakerKey, false);
    return null;
  }

  /**
   * Breaker results of the dispatch in progress, by key. Written by recordBreakerResults()
   * once every provider has been tried, so no DML sits ahead of a provider callout (C2).
   */
  private static Map<String, Boolean> pendingBreakerResults = new Map<String, Boolean>();

  private static String breakerKeyFor(String provider) {
    if (provider == PROVIDER_AGENTFORCE) {
      return CircuitBreaker.KEY_AGENTFORCE;
    }
    if (provider == PROVIDER_GEMINI) {
      return CircuitBreaker.KEY_GEMINI;
    }
    return null;
  }

  private static void noteBreakerResult(String breakerKey, Boolean success) {
    if (breakerKey != null) {
      pendingBreakerResults.put(breakerKey, success);
    }
  }

  // Agentforce's hourly budget, counted where the template runs. The count is written with
  // the breaker results, after the last provider call.
  private static Boolean reserveAgentforceCall() {
    return AgentforceServiceBudget.tryReserve(AgentforceService.hourlyBudget());
  }

  private static void recordBreakerResults() {
    AgentforceServiceBudget.commitPending();
    for (String key : pendingBreakerResults.keySet()) {
      if (pendingBreakerResults.get(key)) {
        CircuitBreaker.recordSuccess(key);
      } else {
        CircuitBreaker.recordFailure(key);
      }
    }
    pendingBreakerResults.clear();
  }

  /**
   * @description The Attempt.detail for an exception: its type and a short message, with any
   *              URL or key=value pair replaced, at most 120 characters.
   * @param e The exception a provider threw.
   * @return String The detail.
   */
  @TestVisible
  private static String failureDetail(Exception e) {
    String cleaned = (e.getTypeName() +
      ': ' +
      e.getMessage())
      .replaceAll('(?i)https?://\\S+', '[url]')
      .replaceAll(
        '(?i)(api[_-]?key|key|token|secret|password|authorization)\\s*[=:]\\s*\\S+',
        '$1=[redacted]'
      )
      .normalizeSpace();
    return cleaned.length() > DETAIL_MAX_LENGTH
      ? cleaned.substring(0, DETAIL_MAX_LENGTH)
      : cleaned;
  }

  private static GenerationResult result(
    String content,
    String provider,
    String model,
    String promptShown,
    List<Attempt> attempts,
    Long started
  ) {
    recordBreakerResults();
    Boolean earlierFailure = false;
    for (Attempt attempt : attempts) {
      if (attempt.outcome == OUTCOME_FAILED) {
        earlierFailure = true;
      }
    }
    GenerationResult generated = new GenerationResult();
    generated.content = content;
    generated.provider = provider;
    generated.model = model;
    generated.fallbackOccurred = earlierFailure || provider == PROVIDER_LOCAL;
    generated.latencyMs = elapsed(started);
    generated.attempts = attempts;
    generated.promptShown = promptShown;
    return generated;
  }

  private static Long elapsed(Long started) {
    return System.currentTimeMillis() - started;
  }

  private static Boolean isUsable(String text) {
    if (String.isBlank(text)) {
      return false;
    }
    for (String prefix : GEMINI_FAILURE_PREFIXES) {
      if (text.startsWith(prefix)) {
        return false;
      }
    }
    return true;
  }

  private static AuraHandledException auraError(String message) {
    AuraHandledException e = new AuraHandledException(message);
    e.setMessage(message);
    return e;
  }
}
