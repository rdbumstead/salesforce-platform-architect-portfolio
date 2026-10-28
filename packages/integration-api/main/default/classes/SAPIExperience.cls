/**
 * @description       : SAPI Experience REST resource for portfolio data.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 12/05/2025
 * @Test Class        : [SAPIExperienceTest]
 **/
@RestResource(urlMapping='/sapi/v1/experience/*')
global with sharing class SAPIExperience implements QueryDefinitions.Provider {
  private static final String LIST_QUERY = 'SAPIExperience_List';

  /**
   * @description GET method to retrieve Experience records with pagination and the
   *              currentlyEmployed, employerName and contactName filters.
   */
  @HttpGet
  global static void getExperiences() {
    ApiRequestContext ctx = ApiRequestContext.begin();
    if (ctx.isRejected()) {
      return;
    }

    try {
      if (Test.isRunningTest() && throwException) {
        throw new CalloutException('Forced Exception');
      }

      Integer limitParam = ctx.limitParam();
      Integer offsetParam = ctx.offsetParam();
      if (ctx.isRejected()) {
        return;
      }
      Boolean currentlyEmployed = ctx.boolParam('currentlyEmployed');
      String employerName = ctx.stringParam('employerName');
      String contactName = ctx.stringParam('contactName');

      List<Experience__c> experiences = (List<Experience__c>) QueryDefinitions.runPage(
        LIST_QUERY,
        listBinds(currentlyEmployed, employerName, contactName),
        listDefault(),
        limitParam,
        offsetParam
      );
      // The total counts the rows the request's filters match, not one page of them.
      Integer totalCount = QueryDefinitions.count(
        LIST_QUERY,
        listBinds(currentlyEmployed, employerName, contactName),
        listDefault()
      );

      ctx.paginate(totalCount, experiences.size());
      ctx.cache(ApiRequestContext.CachePolicy.NO_STORE);
      ctx.ok(transformExperiences(experiences));
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  /**
   * @description Transforms Experience__c records to the Experience schema in
   *              salesforce-sapi.yaml. accomplishments is the deprecated HTML
   *              field the spec keeps. Highlights are served by /experience-highlights.
   */
  @TestVisible
  private static List<Map<String, Object>> transformExperiences(
    List<Experience__c> experiences
  ) {
    List<Map<String, Object>> result = new List<Map<String, Object>>();
    for (Experience__c exp : experiences) {
      Map<String, Object> item = new Map<String, Object>{
        'id' => exp.Id,
        'name' => exp.Name,
        'employerId' => exp.Employer__c,
        'employerName' => exp.Employer__r?.Name,
        'startDate' => exp.Start_Date__c != null
          ? String.valueOf(exp.Start_Date__c)
          : null,
        'endDate' => exp.End_Date__c != null
          ? String.valueOf(exp.End_Date__c)
          : null,
        'isCurrentRole' => exp.Is_Current_Role__c,
        'isRemote' => exp.Is_Remote__c,
        'sortOrder' => exp.Sort_Order__c,
        'contactId' => exp.Contact__c,
        'contactName' => exp.Contact__r?.Name,
        'accomplishments' => exp.Accomplishments__c
      };
      result.add(item);
    }
    return result;
  }

  /**
   * @description The list read as code: every field the response returns, the optional
   *              filters and the order. Query_Definition.SAPIExperience_List ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault listDefault() {
    return new QueryDefinitions.QueryDefault(
        'Experience__c',
        'Id, Name, Employer__c, Employer__r.Name, Start_Date__c, End_Date__c, ' +
          'Is_Current_Role__c, Is_Remote__c, Sort_Order__c, Contact__c, ' +
          'Contact__r.Name, Accomplishments__c'
      )
      .filter(
        '(IsDeleted = :hasCurrentlyEmployed OR ' +
          'Is_Current_Role__c = :currentlyEmployed) AND ' +
          '(IsDeleted = :hasEmployerName OR Employer__r.Name LIKE :employerName) AND ' +
          '(IsDeleted = :hasContactName OR Contact__r.Name = :contactName)'
      )
      .orderBy(
        'Is_Current_Role__c DESC, Sort_Order__c ASC, End_Date__c DESC NULLS FIRST, Start_Date__c DESC'
      )
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(listBinds(null, null, null));
  }

  // employerName keeps its LIKE match with no wildcard added, as before. A blank name binds
  // an empty text so the LIKE never sees null.
  private static Map<String, Object> listBinds(
    Boolean currentlyEmployed,
    String employerName,
    String contactName
  ) {
    return new Map<String, Object>{
      'hasCurrentlyEmployed' => currentlyEmployed != null,
      'currentlyEmployed' => currentlyEmployed,
      'hasEmployerName' => String.isNotBlank(employerName),
      'employerName' => String.isBlank(employerName) ? '' : employerName,
      'hasContactName' => String.isNotBlank(contactName),
      'contactName' => contactName
    };
  }

  /**
   * @description The code defaults this class owns, for QueryDefinitions.validateAll().
   * @return Map<String, QueryDefinitions.QueryDefault> The defaults by record name.
   */
  public Map<String, QueryDefinitions.QueryDefault> queryDefaults() {
    return new Map<String, QueryDefinitions.QueryDefault>{
      LIST_QUERY => listDefault()
    };
  }

  @TestVisible
  private static Boolean throwException = false;
}
