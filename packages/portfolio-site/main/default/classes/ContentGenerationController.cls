/**
 * @description       : Content generation. dispatch() is the one provider chain: Agentforce,
 *                      then Gemini, then the local template (pillar-d-design 3.2). Agentforce
 *                      is consulted only when AgentforceService.isAvailable() says its switch is
 *                      on, and while that class throws it can never serve, so no result names
 *                      Agentforce unless a real Agentforce call produced the content (3.1).
 *                      Every attempt is recorded with its outcome and elapsed time.
 *                      PAPIAiGenerate (POST /papi/v1/ai/generate) and generateCoverLetter both
 *                      call it. The site page reaches it through ApiLabController and the API
 *                      (PD-D3 b). providerStatus() is the read-only provider view for the
 *                      footer.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/19/2025
 * @Test Class        : [ContentGenerationControllerTest]
 **/
public with sharing class ContentGenerationController {
  /**
   * @description Thrown when no provider produced usable content.
   */
  public class ContentGenerationException extends Exception {
  }

  public static final String PROVIDER_AGENTFORCE = 'Agentforce';
  public static final String PROVIDER_GEMINI = 'Gemini';
  public static final String PROVIDER_LOCAL = 'Local';
  /** Default Gemini model. The model reported is GeminiService.model(), read from its record. */
  public static final String MODEL_GEMINI = GeminiService.MODEL;
  public static final String MODEL_LOCAL = 'local-template';

  /** Attempt outcomes. Round 4 adds skipped_open_circuit, the real provider budget_exhausted. */
  public static final String OUTCOME_SERVED = 'served';
  public static final String OUTCOME_SKIPPED_OFF = 'skipped_off';
  public static final String OUTCOME_FAILED = 'failed';

  /** Provider states reported by providerStatus(). */
  public static final String STATE_ON = 'on';
  public static final String STATE_OFF = 'off';
  public static final String STATE_NOT_BUILT = 'not built';

  @TestVisible
  private static final Integer COVER_LETTER_MAX_LENGTH = 1000;

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
     * @description Creates an attempt record.
     * @param provider Provider name.
     * @param outcome One of the OUTCOME_ constants.
     * @param ms Elapsed milliseconds.
     */
    public Attempt(String provider, String outcome, Long ms) {
      this.provider = provider;
      this.outcome = outcome;
      this.ms = ms;
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
  }

  /**
   * @description The one provider chain: Agentforce when its switch is on, then Gemini, then
   *              the local template when the request allows it. Performs no DML.
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

    IAIGenerationService agentforce = (mockAgentforceService != null)
      ? mockAgentforceService
      : new AgentforceService();
    String text = tryProvider(
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

    throw new ContentGenerationException(
      'Content generation failed. Errors: ' + String.join(errors, '; ')
    );
  }

  /**
   * @description Generates a cover letter through dispatch(), grounded on portfolio records.
   *              The site page does not call this method. It reaches the same dispatch
   *              through ApiLabController.generateCoverLetter and /papi/v1/ai/generate.
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

    List<String> lines = new List<String>{
      'Write a cover letter for Ryan Bumstead in a professional tone, no longer than ' +
      COVER_LETTER_MAX_LENGTH +
      ' characters.',
      'companyName: ' + companyName,
      'role: ' + jobTitle
    };
    if (String.isNotBlank(jobDescription)) {
      lines.add('jobDescription: ' + jobDescription);
    }
    String grounding = groundingSection(jobTitle, jobDescription);
    if (grounding != null) {
      lines.add(grounding);
    }

    Map<String, Object> context = new Map<String, Object>{
      'companyName' => companyName,
      'jobTitle' => jobTitle,
      'jobDescription' => jobDescription
    };
    try {
      return dispatch(
        new GenerationRequest(String.join(lines, '\n'), context, true)
      );
    } catch (ContentGenerationException e) {
      throw auraError(
        'No AI provider could write the letter. Try again later.'
      );
    }
  }

  /**
   * @description The grounding block for a cover letter prompt (PD-D4 a). A grounding
   *              failure never blocks the letter: the prompt then goes without facts.
   * @param jobTitle Job title the letter is for.
   * @param jobDescription Job description, may be blank.
   * @return String Instruction line plus facts JSON, or null when there are no facts.
   */
  public static String groundingSection(
    String jobTitle,
    String jobDescription
  ) {
    String facts;
    try {
      facts = PortfolioGroundingService.build(jobTitle, jobDescription);
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
   * @description Read-only provider view for the Glass Box footer (Round 4). Reads the
   *              switch only. It never says Agentforce is on while the class is not built.
   * @return List<ProviderStatus> Agentforce, Gemini and Local in dispatch order.
   */
  @AuraEnabled(cacheable=true)
  public static List<ProviderStatus> providerStatus() {
    Boolean agentforceEnabled = AgentforceService.isEnabled();
    String agentforceState = !agentforceEnabled
      ? STATE_OFF
      : (AgentforceService.IMPLEMENTED ? STATE_ON : STATE_NOT_BUILT);
    return new List<ProviderStatus>{
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
    try {
      String text = service.generateContent(prompt, context);
      if (isUsable(text)) {
        attempts.add(new Attempt(provider, OUTCOME_SERVED, elapsed(started)));
        return text;
      }
      errors.add(provider + ': no usable content');
    } catch (Exception e) {
      errors.add(provider + ': ' + e.getMessage());
    }
    attempts.add(new Attempt(provider, OUTCOME_FAILED, elapsed(started)));
    return null;
  }

  private static GenerationResult result(
    String content,
    String provider,
    String model,
    String promptShown,
    List<Attempt> attempts,
    Long started
  ) {
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
