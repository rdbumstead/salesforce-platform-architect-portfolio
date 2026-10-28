/**
 * @description       : Text helpers shared by the Portfolio Guide Agent's actions. clean()
 *                      removes email and phone shapes (through
 *                      PortfolioGroundingService.removeContactDetails), collapses whitespace and
 *                      returns null for blank text, so no action output carries a contact
 *                      detail even if a record holds one.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/26/2026
 * @Test Class        : [PortfolioAgentTextTest]
 **/
public with sharing class PortfolioAgentText {
  /**
   * @description Record text made safe for the agent.
   * @param value Text from a record.
   * @return String The text without email or phone shapes, or null when blank.
   */
  public static String clean(String value) {
    if (String.isBlank(value)) {
      return null;
    }
    String cleaned = PortfolioGroundingService.removeContactDetails(
      value.normalizeSpace()
    );
    return String.isBlank(cleaned) ? null : cleaned.trim();
  }

  /**
   * @description The year of a date as text.
   * @param value A date, or null.
   * @return String For example 2017, or null.
   */
  public static String yearOf(Date value) {
    return value == null ? null : String.valueOf(value.year());
  }

  /**
   * @description Whether any of the words of a keyword phrase appears in the text, ignoring
   *              case. A blank phrase matches everything.
   * @param text The text to search.
   * @param phrase Words to look for.
   * @return Boolean True on a match.
   */
  public static Boolean matches(String text, String phrase) {
    if (String.isBlank(phrase)) {
      return true;
    }
    String haystack = (text ?? '').toLowerCase();
    for (String word : phrase.toLowerCase().normalizeSpace().split(' ')) {
      if (word.length() >= 3 && haystack.contains(word)) {
        return true;
      }
    }
    return false;
  }
}
