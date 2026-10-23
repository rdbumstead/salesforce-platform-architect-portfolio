/**
 * @description       : Serves the home page pillar cards (Round 6 plan N7, readings R7 and R9).
 *                      Returns one row per pillar letter, A to E, holding only the headline
 *                      number, its label and the card image with its alternative text. The
 *                      static c/pillarData still drives every card, so heroBanner merges these
 *                      rows in by letter and a missing row changes nothing.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
 * @Test Class        : [ProjectCardControllerTest]
 **/
public with sharing class ProjectCardController {
  private static final List<String> PILLAR_LETTERS = new List<String>{
    'A',
    'B',
    'C',
    'D',
    'E'
  };

  /**
   * @description The fixed shape of one card's extras. Every value is null when its field
   *              is blank.
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

  private static List<PillarCard> toCards(List<Project__c> projects) {
    Map<String, PillarCard> cardsByLetter = new Map<String, PillarCard>();
    for (Project__c project : projects) {
      // Rows arrive in priority order, so the first row for a letter is the one shown.
      if (cardsByLetter.containsKey(project.Pillar__c)) {
        continue;
      }
      PillarCard card = new PillarCard();
      card.pillar = project.Pillar__c;
      card.headlineMetric = valueOrNull(project.Headline_Metric__c);
      card.headlineLabel = valueOrNull(project.Headline_Metric_Label__c);
      card.imageUrl = valueOrNull(project.Hero_Image_URL__c);
      card.imageAlt = valueOrNull(project.Hero_Image_Alt__c);
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

  private static String valueOrNull(String value) {
    return String.isBlank(value) ? null : value.trim();
  }

  /**
   * @description Reads Project__c in system mode and without sharing, because the site
   *              guest holds no read on the four card fields. The guest reaches these values
   *              only through the fixed PillarCard shape the outer class builds. Selects
   *              nothing beyond the letter, the ordering fields and the four card fields.
   */
  private without sharing class ProjectCardSelector {
    private List<Project__c> selectProjects() {
      return [
        SELECT
          Pillar__c,
          Headline_Metric__c,
          Headline_Metric_Label__c,
          Hero_Image_URL__c,
          Hero_Image_Alt__c
        FROM Project__c
        WHERE Pillar__c IN :PILLAR_LETTERS
        WITH SYSTEM_MODE
        ORDER BY
          Pillar__c ASC,
          Is_Featured__c DESC,
          Sort_Order__c ASC NULLS LAST,
          Name ASC
        LIMIT 500
      ];
    }
  }
}
