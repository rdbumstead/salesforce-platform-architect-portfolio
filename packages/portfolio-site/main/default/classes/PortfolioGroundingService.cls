/**
 * @description       : Builds the portfolio facts that ground a cover letter on the Gemini path.
 *                      Returns compact JSON of
 *                      featured projects (name, challenge, solution, business value, skills)
 *                      and experience highlights (role, employer, text), ranked by keywords
 *                      from the job title and description. It never selects Email, Phone or any
 *                      Owner field, and it strips anything shaped like an email address or a
 *                      phone number from the free text, because the prompt is sent to the model
 *                      and shown to the visitor. The output stays under MAX_CHARS (about 2,000
 *                      tokens), so Gemma's 16,000 tokens per minute still fit several letters.
 *                      inferPersona() reads Architect, Developer or Admin from the job, and
 *                      build() then gives the highlights tagged with that persona a small
 *                      boost. removeContactDetails() clears email and phone shapes from the
 *                      visitor's own job text before it goes into a prompt.
 *                      The site page runs it as the guest, and guest
 *                      with sharing code sees no Experience_Highlight__c, so the
 *                      reads go through the without sharing Selector below, which selects a
 *                      fixed field list and returns only this PII-free shape.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 * @Test Class        : [PortfolioGroundingServiceTest]
 **/
public with sharing class PortfolioGroundingService implements QueryDefinitions.Provider {
  private static final String PROJECTS_QUERY = 'PortfolioGroundingService_Projects';
  private static final String SKILL_LINKS_QUERY = 'PortfolioGroundingService_SkillLinks';
  private static final String HIGHLIGHTS_QUERY = 'PortfolioGroundingService_Highlights';
  /** Upper bound on the returned JSON, about 2,000 tokens. */
  public static final Integer MAX_CHARS = 8000;
  public static final Integer MAX_PROJECTS = 5;
  public static final Integer MAX_HIGHLIGHTS = 8;
  /** Each free text value is cut to this length. */
  public static final Integer MAX_TEXT_CHARS = 600;
  /** Replaces an email address or phone number found in free text. */
  public static final String REMOVED = '[removed]';

  /** The persona values, the same as Persona_Tag__c and the resume's persona filter. */
  public static final String PERSONA_ARCHITECT = 'Architect';
  public static final String PERSONA_DEVELOPER = 'Developer';
  public static final String PERSONA_ADMIN = 'Admin';

  /** Score added to a highlight tagged with the job's persona. */
  public static final Integer PERSONA_BOOST = 2;

  /** Job text longer than this is cut before contact details are removed. */
  public static final Integer MAX_JOB_TEXT_CHARS = 4000;

  /** The order the title is checked in. */
  private static final List<String> PERSONA_ORDER = new List<String>{
    PERSONA_ARCHITECT,
    PERSONA_DEVELOPER,
    PERSONA_ADMIN
  };

  /** Words in a job that point at each persona. */
  private static final Map<String, Set<String>> PERSONA_WORDS = new Map<String, Set<String>>{
    PERSONA_ARCHITECT => new Set<String>{
      'architect',
      'architects',
      'architecture'
    },
    PERSONA_DEVELOPER => new Set<String>{
      'developer',
      'developers',
      'engineer',
      'engineers',
      'engineering',
      'apex',
      'lwc',
      'javascript',
      'programming'
    },
    PERSONA_ADMIN => new Set<String>{
      'admin',
      'admins',
      'administrator',
      'administrators',
      'administration'
    }
  };

  private static final Integer MAX_KEYWORDS = 60;
  private static final Integer MIN_KEYWORD_LENGTH = 3;
  private static final Integer CANDIDATE_PROJECTS = 50;
  private static final Integer CANDIDATE_HIGHLIGHTS = 200;
  private static final Integer MAX_SKILL_LINKS = 2000;

  private static final Set<String> LIVE_STATUSES = new Set<String>{
    'Live – In Production',
    'Live – Demo / Reference',
    'Active Development'
  };

  private static final Set<String> STOP_WORDS = new Set<String>{
    'the',
    'and',
    'for',
    'with',
    'you',
    'our',
    'are',
    'will',
    'your',
    'this',
    'that',
    'from',
    'have',
    'has',
    'who',
    'can',
    'all',
    'not',
    'job',
    'role',
    'team',
    'work',
    'years',
    'experience'
  };

  /** Free text is cut to this length before cleaning. Only MAX_TEXT_CHARS survive anyway. */
  private static final Integer MAX_SCAN_CHARS = 2000;
  /** Text read for keyword matching is cut to this length, so splitting stays bounded. */
  private static final Integer MAX_MATCH_CHARS = 8000;
  private static final Selector SELECTOR = new Selector();

  private static final Pattern PHONE = Pattern.compile(
    '(\\+?\\d{1,2}[\\s.-]?)?\\(?\\d{3}\\)?[\\s.-]?\\d{3}[\\s.-]?\\d{4}'
  );

  /**
   * @description The facts sent to the model.
   */
  public class Grounding {
    public List<ProjectFact> projects = new List<ProjectFact>();
    public List<HighlightFact> highlights = new List<HighlightFact>();
  }

  /**
   * @description One featured project.
   */
  public class ProjectFact {
    public String name;
    public String challenge;
    public String solution;
    public String businessValue;
    public List<String> skills = new List<String>();
  }

  /**
   * @description One experience highlight with its role.
   */
  public class HighlightFact {
    public String role;
    public String employer;
    public String text;
  }

  /**
   * @description Builds the grounding JSON for a job.
   * @param jobTitle Job title the letter is for.
   * @param jobDescription Job description, may be blank.
   * @return String JSON no longer than MAX_CHARS, or null when there is nothing to ground on.
   * @example
   * String facts = PortfolioGroundingService.build('Architect', 'Apex and integration');
   */
  public static String build(String jobTitle, String jobDescription) {
    return build(jobTitle, jobDescription, null);
  }

  /**
   * @description Builds the grounding JSON for a job. A highlight tagged with the persona
   *              gets PERSONA_BOOST added to its keyword score.
   * @param jobTitle Job title the letter is for.
   * @param jobDescription Job description, may be blank.
   * @param persona Architect, Developer or Admin, or null for no preference.
   * @return String JSON no longer than MAX_CHARS, or null when there is nothing to ground on.
   * @example
   * String facts = PortfolioGroundingService.build('Architect', null, 'Architect');
   */
  public static String build(
    String jobTitle,
    String jobDescription,
    String persona
  ) {
    Set<String> keywords = keywords(
      (jobTitle ?? '') + ' ' + (jobDescription ?? '')
    );
    Grounding grounding = new Grounding();
    grounding.projects = selectProjects(keywords);
    grounding.highlights = selectHighlights(keywords, persona);
    if (grounding.projects.isEmpty() && grounding.highlights.isEmpty()) {
      return null;
    }
    return serializeWithinCap(grounding);
  }

  @TestVisible
  private static Set<String> keywords(String text) {
    Set<String> result = new Set<String>();
    for (String token : tokens(text)) {
      if (result.size() >= MAX_KEYWORDS) {
        break;
      }
      if (token.length() >= MIN_KEYWORD_LENGTH && !STOP_WORDS.contains(token)) {
        result.add(token);
      }
    }
    return result;
  }

  private static List<ProjectFact> selectProjects(Set<String> keywords) {
    List<Project__c> projects = SELECTOR.featuredProjects();
    Map<Id, List<String>> skillsByProject = skillsFor(
      new Map<Id, Project__c>(projects).keySet()
    );

    List<Ranked> ranked = new List<Ranked>();
    for (Integer i = 0; i < projects.size(); i++) {
      Project__c project = projects[i];
      ProjectFact fact = new ProjectFact();
      fact.name = clean(project.Name);
      fact.challenge = clean(project.Challenge__c);
      fact.solution = clean(project.Solution__c);
      fact.businessValue = clean(project.Business_Value__c);
      if (skillsByProject.containsKey(project.Id)) {
        fact.skills = skillsByProject.get(project.Id);
      }
      String searchable = String.join(
        new List<String>{
          project.Name,
          project.Challenge__c,
          project.Solution__c,
          project.Business_Value__c,
          String.join(fact.skills, ' ')
        },
        ' '
      );
      ranked.add(new Ranked(score(searchable, keywords), i, fact));
    }
    ranked.sort();

    List<ProjectFact> result = new List<ProjectFact>();
    for (Ranked item : ranked) {
      if (result.size() >= MAX_PROJECTS) {
        break;
      }
      result.add((ProjectFact) item.fact);
    }
    return result;
  }

  private static Map<Id, List<String>> skillsFor(Set<Id> projectIds) {
    Map<Id, List<String>> skillsByProject = new Map<Id, List<String>>();
    if (projectIds.isEmpty()) {
      return skillsByProject;
    }
    for (Project_Skill__c link : SELECTOR.skillLinks(projectIds)) {
      if (!skillsByProject.containsKey(link.Project__c)) {
        skillsByProject.put(link.Project__c, new List<String>());
      }
      String label = String.isBlank(link.Skill__r.Display_Name__c)
        ? link.Skill__r.Name
        : link.Skill__r.Display_Name__c;
      skillsByProject.get(link.Project__c).add(clean(label));
    }
    return skillsByProject;
  }

  /**
   * @description The persona a job points at. The title decides first, checked for
   *              Architect, then Developer, then Admin. With no persona word in the title,
   *              the description decides when one persona has more matching words than
   *              each of the others. A tie or no match gives null.
   * @param jobTitle Job title, may be blank.
   * @param jobDescription Job description, may be blank.
   * @return String Architect, Developer, Admin or null.
   * @example
   * String persona = PortfolioGroundingService.inferPersona('Solution Architect', null);
   */
  public static String inferPersona(String jobTitle, String jobDescription) {
    Set<String> titleTokens = new Set<String>(tokens(jobTitle));
    for (String persona : PERSONA_ORDER) {
      for (String word : PERSONA_WORDS.get(persona)) {
        if (titleTokens.contains(word)) {
          return persona;
        }
      }
    }
    Map<String, Integer> hits = new Map<String, Integer>();
    for (String token : tokens(jobDescription)) {
      for (String persona : PERSONA_ORDER) {
        if (PERSONA_WORDS.get(persona).contains(token)) {
          hits.put(persona, (hits.get(persona) ?? 0) + 1);
        }
      }
    }
    String best;
    Integer bestHits = 0;
    Boolean tied = false;
    for (String persona : PERSONA_ORDER) {
      Integer count = hits.get(persona) ?? 0;
      if (count > bestHits) {
        best = persona;
        bestHits = count;
        tied = false;
      } else if (count > 0 && count == bestHits) {
        tied = true;
      }
    }
    return tied ? null : best;
  }

  /**
   * @description Removes email addresses and phone numbers from text a visitor typed, such
   *              as a job description, and collapses whitespace. The text is first cut to
   *              MAX_JOB_TEXT_CHARS, the page's own limit. It is not cut further.
   * @param text Text from the visitor.
   * @return String The cleaned text, or null when blank.
   * @example
   * String safe = PortfolioGroundingService.removeContactDetails('Write to jobs@acme.example');
   */
  public static String removeContactDetails(String text) {
    if (String.isBlank(text)) {
      return null;
    }
    List<String> words = new List<String>();
    for (
      String word : text.left(MAX_JOB_TEXT_CHARS).normalizeSpace().split(' ')
    ) {
      words.add(word.contains('@') ? REMOVED : word);
    }
    return PHONE.matcher(String.join(words, ' '))
      .replaceAll(REMOVED)
      .normalizeSpace();
  }

  private static Boolean hasPersona(String tags, String persona) {
    if (String.isBlank(tags) || String.isBlank(persona)) {
      return false;
    }
    return new Set<String>(tags.split(';')).contains(persona);
  }

  private static List<HighlightFact> selectHighlights(
    Set<String> keywords,
    String persona
  ) {
    List<Experience_Highlight__c> highlights = SELECTOR.highlights();

    List<Ranked> ranked = new List<Ranked>();
    for (Integer i = 0; i < highlights.size(); i++) {
      Experience_Highlight__c highlight = highlights[i];
      if (String.isBlank(highlight.Description__c)) {
        continue;
      }
      HighlightFact fact = new HighlightFact();
      fact.role = clean(highlight.Experience__r?.Name);
      fact.employer = clean(highlight.Experience__r?.Employer__r?.Name);
      fact.text = clean(highlight.Description__c);
      String searchable = highlight.Description__c + ' ' + fact.role;
      Integer points = score(searchable, keywords);
      if (hasPersona(highlight.Persona_Tag__c, persona)) {
        points += PERSONA_BOOST;
      }
      ranked.add(new Ranked(points, i, fact));
    }
    ranked.sort();

    List<HighlightFact> result = new List<HighlightFact>();
    for (Ranked item : ranked) {
      if (result.size() >= MAX_HIGHLIGHTS) {
        break;
      }
      result.add((HighlightFact) item.fact);
    }
    return result;
  }

  private static String serializeWithinCap(Grounding grounding) {
    String payload = JSON.serialize(grounding, true);
    while (payload.length() > MAX_CHARS) {
      if (!grounding.highlights.isEmpty()) {
        grounding.highlights.remove(grounding.highlights.size() - 1);
      } else if (!grounding.projects.isEmpty()) {
        grounding.projects.remove(grounding.projects.size() - 1);
      } else {
        return null;
      }
      payload = JSON.serialize(grounding, true);
    }
    return payload;
  }

  /**
   * @description Removes email addresses and phone numbers, collapses whitespace and cuts
   *              the text to MAX_TEXT_CHARS. The text is first cut to MAX_SCAN_CHARS, and any
   *              word holding an @ is replaced without a regex, so a long word cannot hit the
   *              Apex regex limit. Only the bounded phone pattern runs as a regex.
   * @param text Free text from a record.
   * @return String The cleaned text, or null when blank.
   */
  @TestVisible
  private static String clean(String text) {
    if (String.isBlank(text)) {
      return null;
    }
    List<String> words = new List<String>();
    for (String word : text.left(MAX_SCAN_CHARS).normalizeSpace().split(' ')) {
      words.add(word.contains('@') ? REMOVED : word);
    }
    String result = PHONE.matcher(String.join(words, ' ')).replaceAll(REMOVED);
    return result.normalizeSpace().abbreviate(MAX_TEXT_CHARS);
  }

  private static Integer score(String text, Set<String> keywords) {
    if (keywords.isEmpty() || String.isBlank(text)) {
      return 0;
    }
    Integer hits = 0;
    for (String token : new Set<String>(tokens(text))) {
      if (keywords.contains(token)) {
        hits++;
      }
    }
    return hits;
  }

  private static List<String> tokens(String text) {
    List<String> result = new List<String>();
    if (String.isBlank(text)) {
      return result;
    }
    String bounded = text.left(MAX_MATCH_CHARS).toLowerCase();
    for (String token : bounded.split('[^a-z0-9]+')) {
      if (String.isNotBlank(token)) {
        result.add(token);
      }
    }
    return result;
  }

  /**
   * @description The three grounding reads, without sharing on purpose. The site guest sees
   *              only rows shared to it, which excludes every Experience_Highlight__c, so a
   *              with sharing read would ground a guest's letter on nothing. Each
   *              query selects a fixed list of public portfolio fields: no Contact, no
   *              Account other than an employer name, no email, phone or Owner field. The
   *              caller cleans the free text before anything leaves this class.
   */
  private without sharing class Selector {
    List<Project__c> featuredProjects() {
      return (List<Project__c>) QueryDefinitions.run(
        PROJECTS_QUERY,
        projectBinds(),
        projectsDefault()
      );
    }

    List<Project_Skill__c> skillLinks(Set<Id> projectIds) {
      return (List<Project_Skill__c>) QueryDefinitions.run(
        SKILL_LINKS_QUERY,
        skillLinkBinds(projectIds),
        skillLinksDefault()
      );
    }

    List<Experience_Highlight__c> highlights() {
      return (List<Experience_Highlight__c>) QueryDefinitions.run(
        HIGHLIGHTS_QUERY,
        new Map<String, Object>(),
        highlightsDefault()
      );
    }
  }

  /**
   * @description The featured project read as code: featured projects in a live status,
   *              in system mode. Query_Definition.PortfolioGroundingService_Projects ships
   *              equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault projectsDefault() {
    return new QueryDefinitions.QueryDefault(
        'Project__c',
        'Id, Name, Challenge__c, Solution__c, Business_Value__c'
      )
      .filter('Is_Featured__c = TRUE AND Status__c IN :liveStatuses')
      .orderBy('Sort_Order__c ASC NULLS LAST, Name ASC')
      .rowLimit(CANDIDATE_PROJECTS)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(projectBinds());
  }

  private static Map<String, Object> projectBinds() {
    return new Map<String, Object>{ 'liveStatuses' => LIVE_STATUSES };
  }

  /**
   * @description The skill link read as code: the skills of the given projects, in system
   *              mode. Query_Definition.PortfolioGroundingService_SkillLinks ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault skillLinksDefault() {
    return new QueryDefinitions.QueryDefault(
        'Project_Skill__c',
        'Project__c, Skill__r.Name, Skill__r.Display_Name__c'
      )
      .filter('Project__c IN :projectIds')
      .orderBy('Skill__r.Name ASC')
      .rowLimit(MAX_SKILL_LINKS)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(skillLinkBinds(new Set<Id>()));
  }

  private static Map<String, Object> skillLinkBinds(Set<Id> projectIds) {
    return new Map<String, Object>{ 'projectIds' => projectIds };
  }

  /**
   * @description The highlight read as code: current roles first, then the newest end
   *              date, in system mode. Query_Definition.PortfolioGroundingService_Highlights
   *              ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault highlightsDefault() {
    return new QueryDefinitions.QueryDefault(
        'Experience_Highlight__c',
        'Description__c, Persona_Tag__c, Experience__r.Name, Experience__r.Employer__r.Name'
      )
      .orderBy(
        'Experience__r.Is_Current_Role__c DESC, Experience__r.End_Date__c DESC NULLS FIRST, Sort_Order__c ASC'
      )
      .rowLimit(CANDIDATE_HIGHLIGHTS)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE);
  }

  /**
   * @description The code defaults this class owns, for QueryDefinitions.validateAll().
   * @return Map<String, QueryDefinitions.QueryDefault> The defaults by record name.
   */
  public Map<String, QueryDefinitions.QueryDefault> queryDefaults() {
    return new Map<String, QueryDefinitions.QueryDefault>{
      PROJECTS_QUERY => projectsDefault(),
      SKILL_LINKS_QUERY => skillLinksDefault(),
      HIGHLIGHTS_QUERY => highlightsDefault()
    };
  }

  /**
   * @description A candidate fact with its keyword score. Sorts by score, highest first,
   *              then by query order, so ties keep the record order.
   */
  private class Ranked implements Comparable {
    public final Integer score;
    public final Integer position;
    public final Object fact;

    Ranked(Integer score, Integer position, Object fact) {
      this.score = score;
      this.position = position;
      this.fact = fact;
    }

    public Integer compareTo(Object other) {
      Ranked that = (Ranked) other;
      if (score != that.score) {
        return score > that.score ? -1 : 1;
      }
      return position - that.position;
    }
  }
}
