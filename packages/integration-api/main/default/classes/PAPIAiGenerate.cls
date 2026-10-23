/**
 * @description       : PAPI AI generation endpoint (POST /papi/v1/ai/generate). Validates the
 *                      request against the spec enums and bounds, then calls
 *                      ContentGenerationController.dispatch: Agentforce only when its switch is
 *                      on, then Gemini, then the local template for cover letters. A
 *                      cover letter prompt carries portfolio facts from
 *                      PortfolioGroundingService. The response names the
 *                      provider that served it and adds latencyMs, attempts and promptShown.
 *                      Performs no DML, so the provider callout is never preceded by
 *                      uncommitted work. The "ai" rate-limit tier applies by
 *                      path in ApiRequestContext.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/20/2026
 * @Test Class        : [PAPIAiGenerateTest]
 **/
@RestResource(urlMapping='/papi/v1/ai/generate')
global with sharing class PAPIAiGenerate {
  public static final String TYPE_COVER_LETTER = 'CoverLetter';
  public static final Set<String> VALID_TYPES = new Set<String>{
    TYPE_COVER_LETTER,
    'BioSummary',
    'SkillDescription'
  };
  public static final Set<String> VALID_TONES = new Set<String>{
    'Professional',
    'Enthusiastic',
    'Technical',
    'Casual'
  };
  public static final String DEFAULT_TONE = 'Professional';
  // Code defaults for maxLength. The values in force come from the Ai_Min_Length,
  // Ai_Max_Length and Ai_Default_Length settings.
  public static final Integer MIN_LENGTH = 100;
  public static final Integer MAX_LENGTH = 1000;
  public static final Integer DEFAULT_LENGTH = 500;

  private static final Map<String, String> TYPE_LABELS = new Map<String, String>{
    TYPE_COVER_LETTER => 'cover letter',
    'BioSummary' => 'professional bio summary',
    'SkillDescription' => 'skill description'
  };
  private static final List<String> PROMPT_FIELDS = new List<String>{
    'companyName',
    'role',
    'jobDescription',
    'experienceSummary',
    'skills'
  };

  /**
   * @description Thrown when the request body fails validation; becomes a 400.
   */
  public class InvalidRequestException extends Exception {
  }

  /**
   * @description POST handler.
   */
  @HttpPost
  global static void generate() {
    ApiRequestContext ctx = ApiRequestContext.begin();
    if (ctx.isRejected()) {
      return;
    }
    ctx.cache(ApiRequestContext.CachePolicy.NO_STORE);

    try {
      if (Test.isRunningTest() && throwException) {
        throw new CalloutException('Forced Exception');
      }

      GenerationRequest request = parse(RestContext.request?.requestBody);

      Long startedAt = System.currentTimeMillis();
      ContentGenerationController.GenerationResult result = ContentGenerationController.dispatch(
        new ContentGenerationController.GenerationRequest(
          request.prompt(),
          request.providerContext(),
          request.type == TYPE_COVER_LETTER
        )
      );
      Long elapsedMs = System.currentTimeMillis() - startedAt;

      ctx.header('X-AI-Provider', result.provider);
      ctx.header('X-Generation-Time-Ms', String.valueOf(elapsedMs));
      ctx.ok(
        new Map<String, Object>{
          'content' => result.content.left(request.maxLength),
          'provider' => result.provider,
          'model' => result.model,
          'type' => request.type,
          'tone' => request.tone,
          'generatedAt' => Datetime.now()
            .formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\''),
          'fallbackOccurred' => result.fallbackOccurred,
          'latencyMs' => result.latencyMs,
          'attempts' => attemptsBody(result.attempts),
          'promptShown' => result.promptShown
        }
      );
    } catch (InvalidRequestException e) {
      ctx.error(400, 'BAD_REQUEST', e.getMessage());
    } catch (ContentGenerationController.ContentGenerationException e) {
      ctx.error(
        503,
        'ALL_PROVIDERS_UNAVAILABLE',
        'All AI providers currently unavailable'
      );
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  private static List<Map<String, Object>> attemptsBody(
    List<ContentGenerationController.Attempt> attempts
  ) {
    List<Map<String, Object>> body = new List<Map<String, Object>>();
    for (ContentGenerationController.Attempt attempt : attempts) {
      body.add(
        new Map<String, Object>{
          'provider' => attempt.provider,
          'outcome' => attempt.outcome,
          'ms' => attempt.ms
        }
      );
    }
    return body;
  }

  /**
   * @description Parses and validates the request body.
   * @param body Raw request body.
   * @return GenerationRequest The validated request.
   * @throws InvalidRequestException When the body or a field is invalid.
   */
  @TestVisible
  private static GenerationRequest parse(Blob body) {
    Map<String, Object> root = toObject(body);

    GenerationRequest request = new GenerationRequest();
    request.type = requireEnum(root, 'type', VALID_TYPES, null);
    request.tone = requireEnum(root, 'tone', VALID_TONES, DEFAULT_TONE);
    request.maxLength = readMaxLength(root);

    Object context = root.get('context');
    if (!(context instanceof Map<String, Object>)) {
      throw new InvalidRequestException(
        'context is required and must be an object.'
      );
    }
    request.context = (Map<String, Object>) context;

    if (request.type == TYPE_COVER_LETTER) {
      requireText(request.context, 'companyName');
      requireText(request.context, 'role');
    }
    return request;
  }

  private static Map<String, Object> toObject(Blob body) {
    if (body == null || String.isBlank(body.toString())) {
      throw new InvalidRequestException('Request body is required.');
    }
    Object parsed;
    try {
      parsed = JSON.deserializeUntyped(body.toString());
    } catch (JSONException e) {
      throw new InvalidRequestException('Request body must be valid JSON.');
    }
    if (!(parsed instanceof Map<String, Object>)) {
      throw new InvalidRequestException('Request body must be a JSON object.');
    }
    return (Map<String, Object>) parsed;
  }

  private static String requireEnum(
    Map<String, Object> root,
    String field,
    Set<String> allowed,
    String defaultValue
  ) {
    Object value = root.get(field);
    if (value == null && defaultValue != null) {
      return defaultValue;
    }
    String valid = String.join(new List<String>(allowed), ', ');
    if (value == null) {
      throw new InvalidRequestException(
        field + ' is required. Valid values: ' + valid
      );
    }
    if (!(value instanceof String) || !allowed.contains((String) value)) {
      throw new InvalidRequestException(
        'Invalid ' + field + '. Valid values: ' + valid
      );
    }
    return (String) value;
  }

  private static Integer readMaxLength(Map<String, Object> root) {
    Integer minLength = PortfolioSettings.getInteger(
      'Ai_Min_Length',
      MIN_LENGTH
    );
    Integer maxLength = PortfolioSettings.getInteger(
      'Ai_Max_Length',
      MAX_LENGTH
    );
    Object value = root.get('maxLength');
    if (value == null) {
      // The default stays inside the accepted range even if the settings disagree.
      Integer defaultLength = PortfolioSettings.getInteger(
        'Ai_Default_Length',
        DEFAULT_LENGTH
      );
      return Math.max(minLength, Math.min(defaultLength, maxLength));
    }
    if (
      !(value instanceof Integer) ||
      (Integer) value < minLength ||
      (Integer) value > maxLength
    ) {
      throw new InvalidRequestException(
        'maxLength must be an integer between ' +
          minLength +
          ' and ' +
          maxLength +
          '.'
      );
    }
    return (Integer) value;
  }

  private static void requireText(Map<String, Object> context, String field) {
    Object value = context.get(field);
    if (!(value instanceof String) || String.isBlank((String) value)) {
      throw new InvalidRequestException(
        'context.' + field + ' is required for CoverLetter.'
      );
    }
  }

  /**
   * @description A validated generation request.
   */
  @TestVisible
  private class GenerationRequest {
    public String type;
    public String tone;
    public Integer maxLength;
    public Map<String, Object> context;

    /**
     * @description Prompt text built from the type, tone, length and context.
     * @return String The prompt.
     */
    public String prompt() {
      List<String> lines = new List<String>{
        'Write a ' +
        TYPE_LABELS.get(type) +
        ' for Ryan Bumstead in a ' +
        tone.toLowerCase() +
        ' tone, no longer than ' +
        maxLength +
        ' characters.'
      };
      for (String key : PROMPT_FIELDS) {
        Object value = context.get(key);
        if (value instanceof List<Object>) {
          List<String> items = new List<String>();
          for (Object item : (List<Object>) value) {
            items.add(String.valueOf(item));
          }
          lines.add(key + ': ' + String.join(items, ', '));
        } else if (value != null) {
          lines.add(key + ': ' + String.valueOf(value));
        }
      }
      if (type == TYPE_COVER_LETTER) {
        String grounding = ContentGenerationController.groundingSection(
          textOf(context.get('role')),
          textOf(context.get('jobDescription'))
        );
        if (grounding != null) {
          lines.add(grounding);
        }
      }
      return String.join(lines, '\n');
    }

    /**
     * @description Context in the keys the providers read (LocalTemplateService reads
     *              companyName and jobTitle).
     * @return Map<String, Object> Provider context.
     */
    public Map<String, Object> providerContext() {
      Map<String, Object> result = new Map<String, Object>(context);
      result.put('jobTitle', context.get('role'));
      result.put('tone', tone);
      result.put('maxLength', maxLength);
      return result;
    }
  }

  private static String textOf(Object value) {
    return value instanceof String ? (String) value : null;
  }

  @TestVisible
  private static Boolean throwException = false;
}
