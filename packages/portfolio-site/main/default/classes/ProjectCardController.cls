/**
 * @description       : Serves the home page's project reads.
 *                      getPillarCards returns one row per pillar letter, A to E, with the headline
 *                      number and its label, the card image with its alternative text, and the
 *                      case study (Challenge, Solution, Business Value, Live and Source links). The
 *                      static c/pillarData still drives every pillar, so c/siteBuildSection merges
 *                      these rows in by letter and a missing row changes nothing.
 *                      getHomeCaseStudies returns at most three case study cards, the projects
 *                      with Home_Sort__c set, lowest first. It never reads Is_Featured__c, so a
 *                      home card never changes the featured projects the API and the cover
 *                      letters use. A case study card reads the Case_Metric__c fields and a
 *                      pillar card reads the Headline_Metric__c fields, each with the same
 *                      source rule. A case study card with no Case_Metric__c shows no number,
 *                      never the Headline one.
 *                      getBuildCounts returns the newest successful run's passed Apex tests, its
 *                      coverage and its passed Jest tests, for the "How this site is built" line.
 *                      A card whose Headline_Metric_Source__c (or Case_Metric_Source__c) is set
 *                      gets its number computed from a live source: the Employer Hub object
 *                      count from the ERD's describe, the paths in the SAPI_Spec and PAPI_Spec
 *                      resources, the providers the AI fallback chain has switched on, the
 *                      passed test count of the newest successful Pipeline_Run__c with a test
 *                      count, or the successful runs among the retained deploy runs (the
 *                      runs PortfolioStatsController counts as deploys recorded). That source
 *                      also fills {total}, all retained deploy runs, and {recovery}, a clause
 *                      on how fast failures were fixed, empty when there are none or the
 *                      latest is not fixed yet. The computed number
 *                      replaces the first number in the stored metric and fills the label's
 *                      {n} token ({coverage} too for Apex tests). When a source fails, the
 *                      stored text is shown, and a label whose token cannot be filled hides the
 *                      headline, so a broken number never reaches the page.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/22/2026
 * @Test Class        : [ProjectCardControllerTest, ProjectCardControllerHomeTest]
 **/
public with sharing class ProjectCardController implements QueryDefinitions.Provider {
  private static final String CARDS_QUERY = 'ProjectCardController_Cards';
  private static final String TEST_RUN_QUERY = 'ProjectCardController_LatestTestRun';
  private static final String HOME_QUERY = 'ProjectCardController_HomeCaseStudies';
  private static final String DEPLOYS_QUERY = 'ProjectCardController_ProductionDeploys';
  private static final Integer HOME_CARD_LIMIT = 3;
  public static final String SOURCE_EMPLOYER_HUB_OBJECTS = 'Employer Hub objects';
  public static final String SOURCE_API_PATHS = 'API paths';
  public static final String SOURCE_AI_PROVIDERS = 'AI providers';
  public static final String SOURCE_APEX_TESTS = 'Apex tests';
  public static final String SOURCE_PRODUCTION_DEPLOYS = 'Production deploys';
  /** headlineSource when the card shows its stored text. */
  public static final String SOURCE_STORED = 'stored';

  private static final String TOKEN_N = '{n}';
  private static final String TOKEN_COVERAGE = '{coverage}';
  private static final String TOKEN_TOTAL = '{total}';
  private static final String TOKEN_RECOVERY = '{recovery}';
  private static final Integer HOURS_FROM_MINUTES = 120;
  private static final Pattern ANY_TOKEN = Pattern.compile('\\{[a-z]+\\}');
  private static final Pattern FIRST_NUMBER = Pattern.compile('\\d[\\d,]*');
  private static final Pattern SPEC_PATH = Pattern.compile('^  /\\S*:\\s*$');
  private static final List<String> SPEC_RESOURCES = new List<String>{
    'SAPI_Spec',
    'PAPI_Spec'
  };
  private static final String PIPELINE_SUCCESS = 'Success';

  private static final List<String> PILLAR_LETTERS = new List<String>{
    'A',
    'B',
    'C',
    'D',
    'E'
  };

  // Test seam: sources named here throw, so a test can prove the fallback.
  @TestVisible
  private static Set<String> failingSources = new Set<String>();

  /**
   * @description The fixed shape of one card. Every value is null when its field is blank.
   *              headlineSource names the source the number came from, or "stored".
   */
  public class PillarCard {
    @AuraEnabled
    public String pillar;
    @AuraEnabled
    public String headlineMetric;
    @AuraEnabled
    public String headlineLabel;
    @AuraEnabled
    public String imageUrl;
    @AuraEnabled
    public String imageAlt;
    @AuraEnabled
    public String challenge;
    @AuraEnabled
    public String solution;
    @AuraEnabled
    public String businessValue;
    @AuraEnabled
    public String liveUrl;
    @AuraEnabled
    public String repositoryUrl;
    @AuraEnabled
    public String headlineSource;
  }

  /**
   * @description The fixed shape of one home page case study card. Every value is null when
   *              its field is blank, and tags is an empty list when Case_Tags__c is blank.
   *              title is Home_Title__c when set, otherwise the project Name.
   */
  public class CaseStudy {
    @AuraEnabled
    public String key;
    @AuraEnabled
    public String title;
    @AuraEnabled
    public String clientLine;
    @AuraEnabled
    public String headlineMetric;
    @AuraEnabled
    public String headlineLabel;
    @AuraEnabled
    public String headlineSource;
    @AuraEnabled
    public String challenge;
    @AuraEnabled
    public String solution;
    @AuraEnabled
    public String businessValue;
    @AuraEnabled
    public String liveUrl;
    @AuraEnabled
    public List<String> tags;
  }

  /**
   * @description The newest successful run's counts. A value is null when the run did not
   *              record it, and every value is null when there is no such run.
   */
  public class BuildCounts {
    @AuraEnabled
    public Integer apexPassed;
    @AuraEnabled
    public Integer coverage;
    @AuraEnabled
    public Integer jestPassed;
  }

  /**
   * @description One computed value: the number, plus the coverage and the Jest count for
   *              Apex tests.
   */
  private class Computed {
    private Integer n;
    private Integer coverage;
    private Integer jest;
    // Production deploys only: every retained deploy run, and the recovery clause.
    private Integer total;
    private String recovery;
  }

  /**
   * @description A card's headline after the source rule: the number, its label and where the
   *              number came from, all null when the headline cannot be shown.
   */
  private class Headline {
    private String metric;
    private String label;
    private String source;
  }

  /**
   * @description Returns at most one card per pillar letter, in letter order. Within a
   *              letter the featured project wins, then the lowest Sort_Order__c, then Name.
   *              A letter with no project has no row.
   * @return List<PillarCard> The cards, never null.
   * @example
   * List<ProjectCardController.PillarCard> cards = ProjectCardController.getPillarCards();
   */
  @AuraEnabled(cacheable=true)
  public static List<PillarCard> getPillarCards() {
    try {
      return toCards(new ProjectCardSelector().selectProjects());
    } catch (QueryException e) {
      throw new AuraHandledException('The pillar cards could not be loaded.');
    }
  }

  /**
   * @description Returns at most three home page case study cards, the projects with
   *              Home_Sort__c set, lowest first, then by Name. A project with no Home_Sort__c
   *              is never a card. Is_Featured__c plays no part.
   * @return List<CaseStudy> The cards, never null.
   * @example
   * List<ProjectCardController.CaseStudy> cards = ProjectCardController.getHomeCaseStudies();
   */
  @AuraEnabled(cacheable=true)
  public static List<CaseStudy> getHomeCaseStudies() {
    try {
      return toCaseStudies(new ProjectCardSelector().selectHomeCaseStudies());
    } catch (QueryException e) {
      throw new AuraHandledException('The case studies could not be loaded.');
    }
  }

  /**
   * @description Returns the newest successful run with a test count: its passed Apex tests,
   *              its coverage rounded down and its passed Jest tests. Every value is null when
   *              no such run exists, so the page shows no line rather than a made up number.
   * @return BuildCounts The counts, never null.
   * @example
   * ProjectCardController.BuildCounts counts = ProjectCardController.getBuildCounts();
   */
  @AuraEnabled(cacheable=true)
  public static BuildCounts getBuildCounts() {
    try {
      return toBuildCounts(latestTestRun());
    } catch (QueryException e) {
      throw new AuraHandledException('The test counts could not be loaded.');
    }
  }

  private static BuildCounts toBuildCounts(Computed run) {
    BuildCounts counts = new BuildCounts();
    if (run == null || run.n == null || run.n <= 0) {
      return counts;
    }
    counts.apexPassed = run.n;
    counts.coverage = run.coverage;
    counts.jestPassed = run.jest != null && run.jest > 0 ? run.jest : null;
    return counts;
  }

  private static List<CaseStudy> toCaseStudies(List<Project__c> projects) {
    Map<String, Computed> computedBySource = new Map<String, Computed>();
    List<CaseStudy> cards = new List<CaseStudy>();
    for (Project__c project : projects) {
      if (cards.size() == HOME_CARD_LIMIT) {
        break;
      }
      CaseStudy card = new CaseStudy();
      card.key = project.Id;
      card.title = valueOrNull(project.Home_Title__c) ??
        valueOrNull(project.Name);
      card.clientLine = valueOrNull(project.Client_Line__c);
      card.challenge = valueOrNull(project.Challenge__c);
      card.solution = valueOrNull(project.Solution__c);
      card.businessValue = valueOrNull(project.Business_Value__c);
      card.liveUrl = valueOrNull(project.Live_URL__c);
      card.tags = splitTags(project.Case_Tags__c);
      // The home cards read the Case fields only. A blank Case metric shows no number.
      Headline headline = headlineOf(
        project.Case_Metric__c,
        project.Case_Metric_Label__c,
        project.Case_Metric_Source__c,
        computedBySource
      );
      card.headlineMetric = headline.metric;
      card.headlineLabel = headline.label;
      card.headlineSource = headline.source;
      cards.add(card);
    }
    return cards;
  }

  /**
   * @description Splits a comma separated tag list, trimmed, blanks and repeats dropped in
   *              the order written.
   * @param text The Case_Tags__c value.
   * @return List<String> The tags, empty when the text is blank.
   */
  @TestVisible
  private static List<String> splitTags(String text) {
    List<String> tags = new List<String>();
    if (String.isBlank(text)) {
      return tags;
    }
    Set<String> seen = new Set<String>();
    for (String part : text.split(',')) {
      String tag = part.trim();
      if (tag.length() > 0 && seen.add(tag.toLowerCase())) {
        tags.add(tag);
      }
    }
    return tags;
  }

  private static List<PillarCard> toCards(List<Project__c> projects) {
    Map<String, PillarCard> cardsByLetter = new Map<String, PillarCard>();
    Map<String, Computed> computedBySource = new Map<String, Computed>();
    for (Project__c project : projects) {
      // Rows arrive in priority order, so the first row for a letter is the one shown.
      if (cardsByLetter.containsKey(project.Pillar__c)) {
        continue;
      }
      PillarCard card = new PillarCard();
      card.pillar = project.Pillar__c;
      card.imageUrl = valueOrNull(project.Hero_Image_URL__c);
      card.imageAlt = valueOrNull(project.Hero_Image_Alt__c);
      card.challenge = valueOrNull(project.Challenge__c);
      card.solution = valueOrNull(project.Solution__c);
      card.businessValue = valueOrNull(project.Business_Value__c);
      card.liveUrl = valueOrNull(project.Live_URL__c);
      card.repositoryUrl = valueOrNull(project.Repository_URL__c);
      applyHeadline(card, project, computedBySource);
      cardsByLetter.put(project.Pillar__c, card);
    }
    List<PillarCard> cards = new List<PillarCard>();
    for (String letter : PILLAR_LETTERS) {
      if (cardsByLetter.containsKey(letter)) {
        cards.add(cardsByLetter.get(letter));
      }
    }
    return cards;
  }

  private static void applyHeadline(
    PillarCard card,
    Project__c project,
    Map<String, Computed> computedBySource
  ) {
    Headline headline = headlineOf(
      project.Headline_Metric__c,
      project.Headline_Metric_Label__c,
      project.Headline_Metric_Source__c,
      computedBySource
    );
    card.headlineMetric = headline.metric;
    card.headlineLabel = headline.label;
    card.headlineSource = headline.source;
  }

  private static Headline headlineOf(
    String metricText,
    String labelText,
    String sourceName,
    Map<String, Computed> computedBySource
  ) {
    Headline headline = new Headline();
    String storedMetric = valueOrNull(metricText);
    String storedLabel = valueOrNull(labelText);
    String source = valueOrNull(sourceName);
    Computed computed = null;
    if (source != null) {
      if (!computedBySource.containsKey(source)) {
        computedBySource.put(source, compute(source));
      }
      computed = computedBySource.get(source);
    }

    if (computed == null) {
      // Stored text only. A label that still holds a token cannot be shown.
      Boolean labelUsable = storedLabel == null || !hasToken(storedLabel);
      headline.metric = labelUsable ? storedMetric : null;
      headline.label = labelUsable ? storedLabel : null;
      headline.source = headline.metric == null ? null : SOURCE_STORED;
      return headline;
    }

    String label = fillTokens(storedLabel, computed);
    if (label != null && hasToken(label)) {
      return headline;
    }
    headline.metric = fillMetric(storedMetric, computed.n);
    headline.label = label;
    headline.source = source;
    return headline;
  }

  /**
   * @description Computes one source. Any failure returns null so the card falls back to its
   *              stored text. The catch is broad on purpose: a describe, a resource read, a
   *              provider lookup or a query can each fail in its own way, and none of them may
   *              break the home page.
   * @param source A Headline_Metric_Source__c value.
   * @return Computed The number, or null when the source fails or gives nothing above 0.
   */
  private static Computed compute(String source) {
    try {
      if (failingSources.contains(source)) {
        throw new IllegalArgumentException('Forced failure for ' + source);
      }
      Computed computed = new Computed();
      if (source == SOURCE_EMPLOYER_HUB_OBJECTS) {
        computed.n = SchemaService.countObjects(
          SchemaService.SCOPE_EMPLOYER_HUB
        );
      } else if (source == SOURCE_API_PATHS) {
        computed.n = countSpecPaths();
      } else if (source == SOURCE_AI_PROVIDERS) {
        computed.n = countProvidersOn();
      } else if (source == SOURCE_APEX_TESTS) {
        computed = latestTestRun();
      } else if (source == SOURCE_PRODUCTION_DEPLOYS) {
        computed = productionDeploys();
      } else {
        return null;
      }
      return computed != null &&
        computed.n != null &&
        computed.n > 0
        ? computed
        : null;
    } catch (Exception e) {
      return null;
    }
  }

  private static Integer countSpecPaths() {
    List<StaticResource> specs = new ProjectCardSelector()
      .selectSpecs(SPEC_RESOURCES);
    if (specs.size() != SPEC_RESOURCES.size()) {
      return null;
    }
    Integer total = 0;
    for (StaticResource spec : specs) {
      Integer paths = countPaths(spec.Body.toString());
      if (paths == 0) {
        return null;
      }
      total += paths;
    }
    return total;
  }

  /**
   * @description Counts the keys of the top level paths: block of an OpenAPI YAML file, the
   *              lines indented two spaces that start with a slash.
   * @param yaml The spec text.
   * @return Integer The number of paths, 0 when there is no paths: block.
   */
  @TestVisible
  private static Integer countPaths(String yaml) {
    Integer count = 0;
    Boolean inPaths = false;
    for (String line : yaml.replace('\r', '').split('\n')) {
      if (line.startsWith('paths:')) {
        inPaths = true;
        continue;
      }
      if (inPaths && line.length() > 0 && !line.startsWith(' ')) {
        inPaths = false;
      }
      if (inPaths && SPEC_PATH.matcher(line).matches()) {
        count++;
      }
    }
    return count;
  }

  private static Integer countProvidersOn() {
    Integer count = 0;
    for (
      ContentGenerationController.ProviderStatus row : ContentGenerationController.providerStatus()
    ) {
      if (row.state == ContentGenerationController.STATE_ON) {
        count++;
      }
    }
    return count;
  }

  /**
   * @description Reads the retained deploy runs, the Pipeline_Run__c rows whose Workflow__c is
   *              deploy (the workflow that deploys to production, the rows
   *              PortfolioStatsController counts as deploys recorded). n is the successful
   *              runs, total is every retained run, and recovery is the clause that tells how
   *              fast the failures were fixed.
   * @return Computed The counts, never null.
   */
  private static Computed productionDeploys() {
    List<Pipeline_Run__c> runs = new ProjectCardSelector()
      .selectProductionDeploys();
    Computed computed = new Computed();
    computed.total = runs.size();
    computed.n = 0;
    List<Datetime> openFailures = new List<Datetime>();
    Long slowest = 0;
    Boolean anyFailure = false;
    for (Pipeline_Run__c run : runs) {
      Datetime at = run.Completed_At__c ?? run.CreatedDate;
      if (run.Status__c == PIPELINE_SUCCESS) {
        computed.n++;
        for (Datetime failedAt : openFailures) {
          slowest = Math.max(slowest, minutesBetween(failedAt, at));
        }
        openFailures.clear();
      } else if (run.Status__c == GovernanceEventHandler.STATUS_FAILURE) {
        anyFailure = true;
        openFailures.add(at);
      }
    }
    computed.recovery = anyFailure && openFailures.isEmpty()
      ? recoveryClause(failureCount(runs), slowest)
      : '';
    return computed;
  }

  private static Integer failureCount(List<Pipeline_Run__c> runs) {
    Integer count = 0;
    for (Pipeline_Run__c run : runs) {
      if (run.Status__c == GovernanceEventHandler.STATUS_FAILURE) {
        count++;
      }
    }
    return count;
  }

  private static Long minutesBetween(Datetime fromTime, Datetime toTime) {
    Long minutes = (toTime.getTime() - fromTime.getTime()) / 60000;
    return minutes < 1 ? 1 : minutes;
  }

  /**
   * @description The clause after the success rate when every failure was followed by a
   *              successful deploy. Minutes under 120, otherwise hours rounded.
   * @param failures How many retained runs failed, at least 1.
   * @param slowest The most minutes any failure waited for the next successful deploy.
   * @return String The clause, starting with a comma.
   */
  @TestVisible
  private static String recoveryClause(Integer failures, Long slowest) {
    String span = slowest < HOURS_FROM_MINUTES
      ? slowest + (slowest == 1 ? ' minute' : ' minutes')
      : (Math.round(slowest / 60.0)) + ' hours';
    if (failures == 1) {
      return ', and the one failure was fixed by the next deploy ' +
        span +
        ' later';
    }
    return ', and every failure was fixed by the next deploy, the slowest in ' +
      span;
  }

  private static Computed latestTestRun() {
    List<Pipeline_Run__c> runs = new ProjectCardSelector()
      .selectLatestTestRun(PIPELINE_SUCCESS);
    if (runs.isEmpty()) {
      return null;
    }
    Computed computed = new Computed();
    // The label says passing, so the number is the passed count.
    computed.n = runs[0].Tests_Passed__c?.intValue();
    computed.jest = runs[0].Jest_Tests_Passed__c?.intValue();
    computed.coverage = runs[0].Org_Coverage__c == null
      ? null
      : runs[0]
          .Org_Coverage__c.setScale(0, System.RoundingMode.DOWN)
          .intValue();
    return computed;
  }

  private static String fillMetric(String storedMetric, Integer n) {
    if (storedMetric == null) {
      return String.valueOf(n);
    }
    Matcher matcher = FIRST_NUMBER.matcher(storedMetric);
    if (!matcher.find()) {
      return String.valueOf(n) + ' ' + storedMetric;
    }
    return storedMetric.substring(0, matcher.start()) +
      String.valueOf(n) +
      storedMetric.substring(matcher.end());
  }

  private static String fillTokens(String label, Computed computed) {
    if (label == null) {
      return null;
    }
    String filled = label.replace(TOKEN_N, String.valueOf(computed.n));
    if (computed.total != null) {
      filled = filled
        .replace(TOKEN_TOTAL, String.valueOf(computed.total))
        .replace(TOKEN_RECOVERY, computed.recovery ?? '');
    }
    if (computed.coverage != null) {
      filled = filled.replace(
        TOKEN_COVERAGE,
        String.valueOf(computed.coverage)
      );
    }
    return filled;
  }

  private static Boolean hasToken(String text) {
    return ANY_TOKEN.matcher(text).find();
  }

  private static String valueOrNull(String value) {
    return String.isBlank(value) ? null : value.trim();
  }

  /**
   * @description Reads in system mode and without sharing, because the site guest holds no
   *              read on the card fields, the pipeline runs or the static resources. The guest
   *              reaches these values only through the fixed PillarCard shape the outer class
   *              builds. Each query selects only what the cards need.
   */
  private without sharing class ProjectCardSelector {
    private List<Project__c> selectProjects() {
      return (List<Project__c>) QueryDefinitions.run(
        CARDS_QUERY,
        cardBinds(),
        cardsDefault()
      );
    }

    private List<Project__c> selectHomeCaseStudies() {
      return (List<Project__c>) QueryDefinitions.run(
        HOME_QUERY,
        new Map<String, Object>(),
        homeDefault()
      );
    }

    private List<StaticResource> selectSpecs(List<String> names) {
      return [
        SELECT Name, Body
        FROM StaticResource
        WHERE Name IN :names
        WITH SYSTEM_MODE
        LIMIT 2
      ];
    }

    private List<Pipeline_Run__c> selectProductionDeploys() {
      return (List<Pipeline_Run__c>) QueryDefinitions.run(
        DEPLOYS_QUERY,
        deployBinds(),
        deploysDefault()
      );
    }

    private List<Pipeline_Run__c> selectLatestTestRun(String status) {
      return (List<Pipeline_Run__c>) QueryDefinitions.run(
        TEST_RUN_QUERY,
        testRunBinds(status),
        testRunDefault()
      );
    }
  }

  /**
   * @description The card read as code: every field a card shows, for the five pillar
   *              letters, in priority order, in system mode.
   *              Query_Definition.ProjectCardController_Cards ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault cardsDefault() {
    return new QueryDefinitions.QueryDefault(
        'Project__c',
        'Pillar__c, Headline_Metric__c, Headline_Metric_Label__c, Headline_Metric_Source__c, Hero_Image_URL__c, Hero_Image_Alt__c, Challenge__c, Solution__c, Business_Value__c, Live_URL__c, Repository_URL__c'
      )
      .filter('Pillar__c IN :pillarLetters')
      .orderBy(
        'Pillar__c ASC, Is_Featured__c DESC, Sort_Order__c ASC NULLS LAST, Name ASC'
      )
      .rowLimit(500)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(cardBinds());
  }

  /**
   * @description The home case study read as code: the projects with Home_Sort__c set,
   *              lowest first, at most three, in system mode. It filters on Home_Sort__c only,
   *              never on Is_Featured__c. Query_Definition.ProjectCardController_HomeCaseStudies
   *              ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault homeDefault() {
    return new QueryDefinitions.QueryDefault(
        'Project__c',
        'Name, Home_Title__c, Client_Line__c, Case_Tags__c, Case_Metric__c, Case_Metric_Label__c, Case_Metric_Source__c, Challenge__c, Solution__c, Business_Value__c, Live_URL__c'
      )
      .filter('Home_Sort__c != NULL')
      .orderBy('Home_Sort__c ASC, Name ASC')
      .rowLimit(HOME_CARD_LIMIT)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE);
  }

  private static Map<String, Object> cardBinds() {
    return new Map<String, Object>{ 'pillarLetters' => PILLAR_LETTERS };
  }

  /**
   * @description The newest successful run with a test count, as code, in system mode, with
   *              its passed Apex and Jest counts and its coverage.
   *              Query_Definition.ProjectCardController_LatestTestRun ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault testRunDefault() {
    return new QueryDefinitions.QueryDefault(
        'Pipeline_Run__c',
        'Tests_Passed__c, Org_Coverage__c, Jest_Tests_Passed__c'
      )
      .filter('Status__c = :status AND Tests_Run__c != NULL')
      .orderBy('Completed_At__c DESC NULLS LAST, CreatedDate DESC')
      .rowLimit(1)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(testRunBinds(PIPELINE_SUCCESS));
  }

  /**
   * @description The retained deploy runs as code: status and times, oldest first, system
   *              mode. It is PortfolioStatsController's deploy runs read with the fields the
   *              success rate needs. Query_Definition.ProjectCardController_ProductionDeploys
   *              ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault deploysDefault() {
    return new QueryDefinitions.QueryDefault(
        'Pipeline_Run__c',
        'Status__c, Completed_At__c, CreatedDate'
      )
      .filter('Workflow__c = :workflow')
      .orderBy('Completed_At__c ASC NULLS LAST, CreatedDate ASC, Id ASC')
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(deployBinds());
  }

  private static Map<String, Object> deployBinds() {
    return new Map<String, Object>{
      'workflow' => GovernanceEventHandler.WORKFLOW_DEPLOY
    };
  }

  private static Map<String, Object> testRunBinds(String status) {
    return new Map<String, Object>{ 'status' => status };
  }

  /**
   * @description The code defaults this class owns, for QueryDefinitions.validateAll().
   * @return Map<String, QueryDefinitions.QueryDefault> The defaults by record name.
   */
  public Map<String, QueryDefinitions.QueryDefault> queryDefaults() {
    return new Map<String, QueryDefinitions.QueryDefault>{
      CARDS_QUERY => cardsDefault(),
      TEST_RUN_QUERY => testRunDefault(),
      DEPLOYS_QUERY => deploysDefault(),
      HOME_QUERY => homeDefault()
    };
  }
}
