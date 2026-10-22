/**
 * @description       : Tests for DecisionMatrixController against the shipped Custom Metadata
 *                      records. Custom metadata cannot be inserted in a test, so the records in
 *                      the nonprofit-literacy package are the fixture: a missing score fails the
 *                      pair test before the matrix can ship with a hole.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
 **/
@IsTest
private class DecisionMatrixControllerTest {
  private static final Integer SHIPPED_OPTIONS = 3;
  private static final Integer SHIPPED_CRITERIA = 10;
  private static final String PLACEHOLDER_PREFIX = 'PLACEHOLDER: ';

  @IsTest
  static void shouldScoreEveryOptionAndCriterionPairExactlyOnce() {
    Test.startTest();
    DecisionMatrixController.Matrix matrix = DecisionMatrixController.getMatrix();
    Test.stopTest();

    Assert.areEqual(
      SHIPPED_OPTIONS,
      matrix.options.size(),
      'Three options ship (D2 b)'
    );
    Assert.areEqual(
      SHIPPED_CRITERIA,
      matrix.criteria.size(),
      'Ten criteria ship (pillars-design 3.3)'
    );
    Set<String> expectedPairs = new Set<String>();
    for (DecisionMatrixController.Option o : matrix.options) {
      for (DecisionMatrixController.Criterion c : matrix.criteria) {
        expectedPairs.add(o.developerName + '|' + c.developerName);
      }
    }
    Set<String> seenPairs = new Set<String>();
    for (DecisionMatrixController.Score s : matrix.scores) {
      String pair = s.optionName + '|' + s.criterionName;
      Assert.isTrue(
        expectedPairs.contains(pair),
        'Score for an unknown option or criterion: ' + pair
      );
      Assert.isTrue(seenPairs.add(pair), 'Pair scored twice: ' + pair);
    }
    expectedPairs.removeAll(seenPairs);
    Assert.areEqual(
      new Set<String>(),
      expectedPairs,
      'Every option and criterion pair needs a score'
    );
    Assert.areEqual(
      SHIPPED_OPTIONS * SHIPPED_CRITERIA,
      matrix.scores.size(),
      'Three by ten gives thirty scores'
    );
  }

  @IsTest
  static void shouldFlagPlaceholdersExactlyAsTheRecordsDo() {
    Integer placeholderRows = 0;
    for (Decision_Score__mdt row : [
      SELECT Is_Placeholder__c
      FROM Decision_Score__mdt
    ]) {
      if (row.Is_Placeholder__c) {
        placeholderRows++;
      }
    }

    Test.startTest();
    DecisionMatrixController.Matrix matrix = DecisionMatrixController.getMatrix();
    Test.stopTest();

    Integer flagged = 0;
    for (DecisionMatrixController.Score s : matrix.scores) {
      if (s.isPlaceholder) {
        flagged++;
        Assert.isTrue(
          s.rationale.startsWith(PLACEHOLDER_PREFIX),
          'A placeholder rationale is marked: ' + s.rationale
        );
      }
    }
    Assert.areEqual(placeholderRows, flagged, 'Flags follow the records');
    Assert.areEqual(
      placeholderRows > 0,
      matrix.hasPlaceholders,
      'hasPlaceholders is true exactly when a record is flagged'
    );
  }

  @IsTest
  static void shouldReturnRowsAndColumnsInSortOrderWithValuesInRange() {
    Test.startTest();
    DecisionMatrixController.Matrix matrix = DecisionMatrixController.getMatrix();
    Test.stopTest();

    for (Integer i = 1; i < matrix.options.size(); i++) {
      Assert.isTrue(
        matrix.options[i - 1].sortOrder <= matrix.options[i].sortOrder,
        'Options in sort order'
      );
    }
    for (Integer i = 1; i < matrix.criteria.size(); i++) {
      Assert.isTrue(
        matrix.criteria[i - 1].sortOrder <= matrix.criteria[i].sortOrder,
        'Criteria in sort order'
      );
    }
    for (DecisionMatrixController.Criterion c : matrix.criteria) {
      Assert.isTrue(
        c.defaultWeight >= 0 && c.defaultWeight <= 10,
        'Weight 0 to 10: ' + c.developerName
      );
      Assert.isTrue(String.isNotBlank(c.label), 'Criterion has a label');
    }
    for (DecisionMatrixController.Score s : matrix.scores) {
      Assert.isTrue(s.score >= 1 && s.score <= 5, 'Score 1 to 5');
      Assert.isTrue(String.isNotBlank(s.evidence), 'Evidence named');
    }
    Assert.areEqual(
      matrix.criteria[0].developerName,
      matrix.scores[0].criterionName,
      'Scores start with the first criterion'
    );
    Assert.areEqual(
      matrix.options[0].developerName,
      matrix.scores[0].optionName,
      'and its first option'
    );
    Assert.areEqual(
      matrix.options[1].developerName,
      matrix.scores[1].optionName,
      'then the second option of the same criterion'
    );
  }

  @IsTest
  static void shouldServeTheSameMatrixToTheSiteGuest() {
    DecisionMatrixController.Matrix asAdmin = DecisionMatrixController.getMatrix();
    User guest = SiteGuestTestSupport.preparedGuest();
    DecisionMatrixController.Matrix asGuest;

    Test.startTest();
    System.runAs(guest) {
      asGuest = DecisionMatrixController.getMatrix();
    }
    Test.stopTest();

    Assert.areEqual(
      SHIPPED_OPTIONS,
      asGuest.options.size(),
      'The guest reads every option'
    );
    Assert.areEqual(
      SHIPPED_CRITERIA,
      asGuest.criteria.size(),
      'The guest reads every criterion'
    );
    Assert.areEqual(
      asAdmin.scores.size(),
      asGuest.scores.size(),
      'The guest reads every score'
    );
    Assert.areEqual(
      asAdmin.hasPlaceholders,
      asGuest.hasPlaceholders,
      'The guest sees the same placeholder flag'
    );
    for (Integer k = 0; k < asAdmin.scores.size(); k++) {
      DecisionMatrixController.Score admin = asAdmin.scores[k];
      DecisionMatrixController.Score guestScore = asGuest.scores[k];
      Assert.isNotNull(
        guestScore.optionName,
        'The guest sees which option each score belongs to'
      );
      Assert.isNotNull(
        guestScore.criterionName,
        'The guest sees which criterion each score belongs to'
      );
      Assert.areEqual(
        admin.optionName + '|' + admin.criterionName + '|' + admin.rationale,
        guestScore.optionName +
          '|' +
          guestScore.criterionName +
          '|' +
          guestScore.rationale,
        'The guest reads the same cell in the same place'
      );
    }
  }
}
