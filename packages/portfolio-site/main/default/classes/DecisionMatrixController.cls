/**
 * @description       : Serves the Pillar B decision matrix (Round 5 contract M7) from three
 *                      Custom Metadata Types in the nonprofit-literacy package: the options, the
 *                      criteria with the client's default weights, and one score per option and
 *                      criterion pair. Read by c/decisionMatrix, which computes the weighted
 *                      totals in the browser, so a visitor's reweighting never calls the server.
 *                      SOQL reads the types because getAll() returns only the first 255
 *                      characters of a long text field. Custom metadata queries do not count
 *                      against the query limit.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
 * @Test Class        : [DecisionMatrixControllerTest]
 **/
public with sharing class DecisionMatrixController {
  /**
   * @description The whole matrix in one payload.
   */
  public class Matrix {
    @AuraEnabled
    public List<Option> options = new List<Option>();
    @AuraEnabled
    public List<Criterion> criteria = new List<Criterion>();
    @AuraEnabled
    public List<Score> scores = new List<Score>();
    @AuraEnabled
    public Boolean hasPlaceholders = false;
  }

  /**
   * @description One platform option, a column of the matrix.
   */
  public class Option {
    @AuraEnabled
    public String developerName;
    @AuraEnabled
    public String label;
    @AuraEnabled
    public String summary;
    @AuraEnabled
    public Decimal sortOrder;
  }

  /**
   * @description One criterion, a row of the matrix, with the client's weight.
   */
  public class Criterion {
    @AuraEnabled
    public String developerName;
    @AuraEnabled
    public String label;
    @AuraEnabled
    public String description;
    @AuraEnabled
    public Decimal defaultWeight;
    @AuraEnabled
    public Decimal sortOrder;
  }

  /**
   * @description One cell: the score an option earns on a criterion and why.
   */
  public class Score {
    @AuraEnabled
    public String optionName;
    @AuraEnabled
    public String criterionName;
    @AuraEnabled
    public Decimal score;
    @AuraEnabled
    public String rationale;
    @AuraEnabled
    public String evidence;
    @AuraEnabled
    public Boolean isPlaceholder;
  }

  /**
   * @description Returns the options and criteria in sort order and every score, ordered
   *              by criterion then option. hasPlaceholders is true when any score is still
   *              flagged Is_Placeholder__c. Holds no personal data.
   * @return Matrix The matrix.
   * @example
   * DecisionMatrixController.Matrix m = DecisionMatrixController.getMatrix();
   */
  @AuraEnabled(cacheable=true)
  public static Matrix getMatrix() {
    try {
      return buildMatrix();
    } catch (QueryException e) {
      throw new AuraHandledException(
        'The decision matrix could not be loaded.'
      );
    }
  }

  private static Matrix buildMatrix() {
    Matrix result = new Matrix();
    for (Decision_Option__mdt row : [
      SELECT DeveloperName, MasterLabel, Summary__c, Sort_Order__c
      FROM Decision_Option__mdt
      ORDER BY Sort_Order__c ASC NULLS LAST, DeveloperName ASC
    ]) {
      Option o = new Option();
      o.developerName = row.DeveloperName;
      o.label = row.MasterLabel;
      o.summary = row.Summary__c;
      o.sortOrder = row.Sort_Order__c;
      result.options.add(o);
    }
    for (Decision_Criterion__mdt row : [
      SELECT
        DeveloperName,
        MasterLabel,
        Description__c,
        Default_Weight__c,
        Sort_Order__c
      FROM Decision_Criterion__mdt
      ORDER BY Sort_Order__c ASC NULLS LAST, DeveloperName ASC
    ]) {
      Criterion c = new Criterion();
      c.developerName = row.DeveloperName;
      c.label = row.MasterLabel;
      c.description = row.Description__c;
      c.defaultWeight = row.Default_Weight__c;
      c.sortOrder = row.Sort_Order__c;
      result.criteria.add(c);
    }
    List<Score> unordered = new List<Score>();
    for (Decision_Score__mdt row : [
      SELECT
        DeveloperName,
        Option__r.DeveloperName,
        Criterion__r.DeveloperName,
        Score__c,
        Rationale__c,
        Evidence__c,
        Is_Placeholder__c
      FROM Decision_Score__mdt
      ORDER BY DeveloperName ASC
    ]) {
      Score s = new Score();
      s.optionName = row.Option__r?.DeveloperName;
      s.criterionName = row.Criterion__r?.DeveloperName;
      s.score = row.Score__c;
      s.rationale = row.Rationale__c;
      s.evidence = row.Evidence__c;
      s.isPlaceholder = row.Is_Placeholder__c == true;
      result.hasPlaceholders = result.hasPlaceholders || s.isPlaceholder;
      unordered.add(s);
    }
    result.scores = inMatrixOrder(unordered, result.options, result.criteria);
    return result;
  }

  // Criterion order first, then option order. A score whose option or criterion is missing
  // sorts last, so the pair check in the test still sees it.
  private static List<Score> inMatrixOrder(
    List<Score> scores,
    List<Option> options,
    List<Criterion> criteria
  ) {
    Map<String, Integer> optionIndex = new Map<String, Integer>();
    for (Integer i = 0; i < options.size(); i++) {
      optionIndex.put(options[i].developerName, i);
    }
    Map<String, Integer> criterionIndex = new Map<String, Integer>();
    for (Integer i = 0; i < criteria.size(); i++) {
      criterionIndex.put(criteria[i].developerName, i);
    }
    Integer width = options.size() + 1;
    Map<Integer, List<Score>> byPosition = new Map<Integer, List<Score>>();
    for (Score s : scores) {
      Integer row = criterionIndex.containsKey(s.criterionName)
        ? criterionIndex.get(s.criterionName)
        : criteria.size();
      Integer col = optionIndex.containsKey(s.optionName)
        ? optionIndex.get(s.optionName)
        : options.size();
      Integer position = row * width + col;
      if (!byPosition.containsKey(position)) {
        byPosition.put(position, new List<Score>());
      }
      byPosition.get(position).add(s);
    }
    List<Integer> positions = new List<Integer>(byPosition.keySet());
    positions.sort();
    List<Score> ordered = new List<Score>();
    for (Integer position : positions) {
      ordered.addAll(byPosition.get(position));
    }
    return ordered;
  }
}
