/**
 * @description       : Unit tests for PortfolioAgentText: contact shapes removed, blank text,
 *                      years and keyword matches.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/26/2026
 **/
@IsTest
private class PortfolioAgentTextTest {
  @IsTest
  static void cleanRemovesEmailAndPhone() {
    String cleaned = PortfolioAgentText.clean(
      'Write to someone@example.com or call 555-014-2424.'
    );

    Assert.isFalse(cleaned.contains('@'), cleaned);
    Assert.isFalse(cleaned.contains('555'), cleaned);
  }

  @IsTest
  static void cleanReturnsNullForBlankText() {
    Assert.isNull(PortfolioAgentText.clean('   '), 'Blank');
    Assert.isNull(PortfolioAgentText.clean(null), 'Null');
  }

  @IsTest
  static void yearOfADate() {
    Assert.areEqual(
      '2017',
      PortfolioAgentText.yearOf(Date.newInstance(2017, 3, 1)),
      'Year'
    );
    Assert.isNull(PortfolioAgentText.yearOf(null), 'No date');
  }

  @IsTest
  static void matchesAnyWordOfThreeLettersOrMore() {
    Assert.isTrue(
      PortfolioAgentText.matches('An Integration layer', 'integration work'),
      'Word found'
    );
    Assert.isFalse(
      PortfolioAgentText.matches('An API', 'an'),
      'Words under three letters are ignored'
    );
    Assert.isTrue(PortfolioAgentText.matches(null, ' '), 'Blank matches all');
    Assert.isFalse(PortfolioAgentText.matches(null, 'portal'), 'No text');
  }
}
