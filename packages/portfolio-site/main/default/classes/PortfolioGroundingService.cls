/**
 * @description       : Builds the portfolio facts that ground a cover letter on the Gemini path
 *                      (pillar-d-design 3.7, decision PD-D4 a). Returns compact JSON of
 *                      featured projects (name, challenge, solution, business value, skills)
 *                      and experience highlights (role, employer, text), ranked by keywords
 *                      from the job title and description. It never selects Email, Phone or any
 *                      Owner field, and it strips anything shaped like an email address or a
 *                      phone number from the free text, because the prompt is sent to the model
 *                      and shown to the visitor. The output stays under MAX_CHARS (about 2,000
 *                      tokens), so Gemma's 16,000 tokens per minute still fit several letters.
 *                      The site page runs it as the guest (Round 4 decision 2 a), and guest
 *                      with sharing code sees no Experience_Highlight__c (trap 31), so the
 *                      reads go through the without sharing Selector below, which selects a
 *                      fixed field list and returns only this PII-free shape (contract G1).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 * @Test Class        : [PortfolioGroundingServiceTest]
 **/
public with sharing class PortfolioGroundingService {
  /** Upper bound on the returned JSON, about 2,000 tokens. */
  public static final Integer MAX_CHARS = 8000;
  public static final Integer MAX_PROJECTS = 5;
  public static final Integer MAX_HIGHLIGHTS = 8;
  /** Each free text value is cut to this length. */
  public static final Integer MAX_TEXT_CHARS = 600;
  /** Replaces an email address or phone number found in free text. */
  public static final String REMOVED = '[removed]';

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
    Set<String> keywords = keywords(
      (jobTitle ?? '') + ' ' + (jobDescription ?? '')
    );
    Grounding grounding = new Grounding();
    grounding.projects = selectProjects(keywords);
    grounding.highlights = selectHighlights(keywords);
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

  private static List<HighlightFact> selectHighlights(Set<String> keywords) {
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
      ranked.add(new Ranked(score(searchable, keywords), i, fact));
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
   *              with sharing read would ground a guest's letter on nothing (trap 31). Each
   *              query selects a fixed list of public portfolio fields: no Contact, no
   *              Account other than an employer name, no email, phone or Owner field. The
   *              caller cleans the free text before anything leaves this class (contract G1).
   */
  private without sharing class Selector {
    List<Project__c> featuredProjects() {
      return [
        SELECT Id, Name, Challenge__c, Solution__c, Business_Value__c
        FROM Project__c
        WHERE Is_Featured__c = TRUE AND Status__c IN :LIVE_STATUSES
        ORDER BY Sort_Order__c ASC NULLS LAST, Name ASC
        LIMIT :CANDIDATE_PROJECTS
      ];
    }

    List<Project_Skill__c> skillLinks(Set<Id> projectIds) {
      return [
        SELECT Project__c, Skill__r.Name, Skill__r.Display_Name__c
        FROM Project_Skill__c
        WHERE Project__c IN :projectIds
        ORDER BY Skill__r.Name ASC
        LIMIT :MAX_SKILL_LINKS
      ];
    }

    List<Experience_Highlight__c> highlights() {
      return [
        SELECT
          Description__c,
          Experience__r.Name,
          Experience__r.Employer__r.Name
        FROM Experience_Highlight__c
        ORDER BY
          Experience__r.Is_Current_Role__c DESC,
          Experience__r.End_Date__c DESC NULLS FIRST,
          Sort_Order__c ASC
        LIMIT :CANDIDATE_HIGHLIGHTS
      ];
    }
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
