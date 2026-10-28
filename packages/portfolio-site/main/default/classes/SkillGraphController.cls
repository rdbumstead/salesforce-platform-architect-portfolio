/**
 * @description       : Serves the certification evidence for the skills graph. Returns each
 *                      certification that backs at least one skill, with its Id, its name,
 *                      whether it is retired, the year it was earned and the Ids of the skills it
 *                      backs. Nothing else: no issuer, no full date, no Contact or Account value.
 *                      The site guest already sees the same certification names and years on the
 *                      resume.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 * @Test Class        : [SkillGraphControllerTest]
 **/
public with sharing class SkillGraphController implements QueryDefinitions.Provider {
  private static final String CERTIFICATION_LINKS_QUERY = 'SkillGraphController_CertificationLinks';
  @TestVisible
  private static final String LOAD_FAILED_MESSAGE = 'The certifications could not be loaded.';
  // Tests set this to reach the failure path.
  @TestVisible
  private static Boolean failRead = false;

  /**
   * @description Every certification that backs a skill, ordered by name, each with the skill
   *              Ids it backs in skill Id order.
   * @return List<CertificationLinks> One entry per certification. Empty when no link exists.
   * @throws AuraHandledException When the read fails.
   * @example
   * List<SkillGraphController.CertificationLinks> links = SkillGraphController.getCertificationLinks();
   */
  @AuraEnabled(cacheable=true)
  public static List<CertificationLinks> getCertificationLinks() {
    try {
      return toCertificationLinks(new LinkSelector().selectLinks());
    } catch (QueryException error) {
      AuraHandledException failure = new AuraHandledException(
        LOAD_FAILED_MESSAGE
      );
      failure.setMessage(LOAD_FAILED_MESSAGE);
      throw failure;
    }
  }

  private static List<CertificationLinks> toCertificationLinks(
    List<Certification_Skill__c> links
  ) {
    Map<Id, CertificationLinks> byCertification = new Map<Id, CertificationLinks>();
    for (Certification_Skill__c link : links) {
      if (link.Certification__c == null || link.Skill__c == null) {
        continue;
      }
      CertificationLinks entry = byCertification.get(link.Certification__c);
      if (entry == null) {
        entry = new CertificationLinks();
        entry.id = link.Certification__c;
        entry.name = link.Certification__r?.Name;
        entry.isRetired = link.Certification__r?.Is_Retired__c == true;
        entry.earnedYear = link.Certification__r?.Earned_Date__c?.year();
        byCertification.put(link.Certification__c, entry);
      }
      if (!entry.skillIds.contains(link.Skill__c)) {
        entry.skillIds.add(link.Skill__c);
      }
    }
    return byCertification.values();
  }

  /**
   * @description The link read as code, in system mode, ordered by certification name.
   *              Query_Definition.SkillGraphController_CertificationLinks ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault certificationLinksDefault() {
    return new QueryDefinitions.QueryDefault(
        'Certification_Skill__c',
        'Id, Certification__c, Certification__r.Name, Certification__r.Is_Retired__c, Certification__r.Earned_Date__c, Skill__c'
      )
      .orderBy('Certification__r.Name ASC, Skill__c ASC')
      .mode(QueryDefinitions.Mode.SYSTEM_MODE);
  }

  /**
   * @description The code defaults this class owns, for QueryDefinitions.validateAll().
   * @return Map<String, QueryDefinitions.QueryDefault> The defaults by record name.
   */
  public Map<String, QueryDefinitions.QueryDefault> queryDefaults() {
    return new Map<String, QueryDefinitions.QueryDefault>{
      CERTIFICATION_LINKS_QUERY => certificationLinksDefault()
    };
  }

  /**
   * @description Reads the links in system mode and without sharing, because certifications
   *              are master-detail to Contact and the site guest has no Contact or Account
   *              access. The guest reaches this data only through the fixed shape above.
   */
  private without sharing class LinkSelector {
    private List<Certification_Skill__c> selectLinks() {
      if (failRead) {
        throw new QueryException('Read failed in a test');
      }
      return (List<Certification_Skill__c>) QueryDefinitions.run(
        CERTIFICATION_LINKS_QUERY,
        new Map<String, Object>(),
        certificationLinksDefault()
      );
    }
  }

  /**
   * @description One certification and the skills it backs.
   */
  public class CertificationLinks {
    @AuraEnabled
    public Id id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public Boolean isRetired;
    @AuraEnabled
    public Integer earnedYear;
    @AuraEnabled
    public List<Id> skillIds = new List<Id>();
  }
}
