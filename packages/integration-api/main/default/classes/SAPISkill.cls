/**
 * @description       : SAPI Skill REST resource for portfolio data.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 12/05/2025
 * @Test Class        : [SAPISkillTest]
 **/
@RestResource(urlMapping='/sapi/v1/skills/*')
global with sharing class SAPISkill implements QueryDefinitions.Provider {
  private static final String LIST_QUERY = 'SAPISkill_List';

  /**
   * @description GET method to retrieve Skill records with pagination and filtering.
   */
  @HttpGet
  global static void getSkills() {
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
      String category = ctx.stringParam('category');

      List<Skill__c> skills = (List<Skill__c>) QueryDefinitions.runPage(
        LIST_QUERY,
        listBinds(category),
        listDefault(),
        limitParam,
        offsetParam
      );
      // The total counts the rows the request's filter matches, not one page of them.
      Integer totalCount = QueryDefinitions.count(
        LIST_QUERY,
        listBinds(category),
        listDefault()
      );

      ctx.paginate(totalCount, skills.size());
      ctx.cache(ApiRequestContext.CachePolicy.PUBLIC_300);
      ctx.ok(transformSkills(skills));
    } catch (Exception e) {
      ctx.error(500, 'INTERNAL_SERVER_ERROR', e.getMessage());
    }
  }

  /**
   * @description Transforms Skill__c records to the Skill schema in salesforce-sapi.yaml.
   */
  @TestVisible
  private static List<Map<String, Object>> transformSkills(
    List<Skill__c> skills
  ) {
    List<Map<String, Object>> result = new List<Map<String, Object>>();
    for (Skill__c s : skills) {
      result.add(
        new Map<String, Object>{
          'id' => s.Id,
          'key' => s.Public_Key__c,
          'name' => s.Name,
          'displayName' => s.Display_Name__c,
          'category' => s.Category__c,
          'proficiencyScore' => s.Proficiency__c,
          'iconName' => s.Icon_Name__c,
          'svgPathData' => s.SVG_Path_Data__c,
          'colorHex' => s.Color_Hex__c,
          'categoryOrder' => s.Category_Order__c
        }
      );
    }
    return result;
  }

  /**
   * @description The list read as code: every field the Skill schema returns, the optional
   *              category filter and the order. Query_Definition.SAPISkill_List ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault listDefault() {
    return new QueryDefinitions.QueryDefault(
        'Skill__c',
        'Id, Public_Key__c, Name, Display_Name__c, Category__c, Proficiency__c, ' +
        'Icon_Name__c, SVG_Path_Data__c, Color_Hex__c, Category_Order__c'
      )
      .filter('(IsDeleted = :hasCategory OR Category__c = :category)')
      .orderBy('Proficiency__c DESC, Name ASC')
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(listBinds(null));
  }

  private static Map<String, Object> listBinds(String category) {
    return new Map<String, Object>{
      'hasCategory' => String.isNotBlank(category),
      'category' => category
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
