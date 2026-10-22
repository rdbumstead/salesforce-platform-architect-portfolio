/**
 * @description       : Serves the schema visualizer (Round 5 plan M3, pillars-design §2.3). Discovers
 *                      the objects of one ERD scope from the global describe, describes only those,
 *                      and returns nodes with their fields and edges drawn from reference fields whose
 *                      target is in the same scope. Reads no records. Overrides and hidden objects
 *                      come from Schema_Visualizer_Object__mdt. No Platform Cache, the only cache is the
 *                      client one from cacheable=true.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
 * @Test Class        : [SchemaServiceTest]
 **/
public with sharing class SchemaService {
  public static final String SCOPE_PORTFOLIO = 'portfolio';
  public static final String SCOPE_EMPLOYER_HUB = 'employerHub';
  public static final String KIND_MASTER_DETAIL = 'masterDetail';
  public static final String KIND_LOOKUP = 'lookup';

  @TestVisible
  private static final String UNKNOWN_SCOPE_MESSAGE = 'Unknown scope. Valid values: portfolio, employerHub';

  private static final String CUSTOM_SUFFIX = '__c';
  private static final String NAME_SEPARATOR = '__';
  private static final String EMPLOYER_HUB_PREFIX = 'eh_';
  private static final List<String> DROPPED_SUFFIXES = new List<String>{
    '__mdt',
    '__e',
    '__b',
    '__x',
    '__share',
    '__history',
    '__feed',
    '__changeevent'
  };

  // Standard objects each scope shows, lower case to match the global describe keys.
  private static final Map<String, Set<String>> STANDARD_OBJECTS_BY_SCOPE = new Map<String, Set<String>>{
    SCOPE_PORTFOLIO => new Set<String>{ 'account', 'contact' },
    SCOPE_EMPLOYER_HUB => new Set<String>{
      'account',
      'contact',
      'case',
      'opportunity',
      'contract'
    }
  };

  // Test seam. Custom metadata rows cannot be inserted in a test, so a test sets
  // in-memory rows here. Null means the shipped records.
  @TestVisible
  private static List<Schema_Visualizer_Object__mdt> overrideRecords;

  /**
   * @description Builds the ERD for one scope.
   * @param scope portfolio or employerHub.
   * @return SchemaGraph Nodes sorted by API name, edges sorted by object and field, and the
   *         server CPU the call took.
   * @throws AuraHandledException When the scope is anything else.
   * @example
   * SchemaService.SchemaGraph graph = SchemaService.getSchemaGraph('employerHub');
   */
  @AuraEnabled(cacheable=true)
  public static SchemaGraph getSchemaGraph(String scope) {
    Integer cpuStart = Limits.getCpuTime();
    if (scope == null || !STANDARD_OBJECTS_BY_SCOPE.containsKey(scope)) {
      throw auraError(UNKNOWN_SCOPE_MESSAGE);
    }

    List<String> objectNames = objectNamesInScope(
      scope,
      Schema.getGlobalDescribe().keySet(),
      overridesByObjectName()
    );

    SchemaGraph graph = new SchemaGraph();
    graph.scope = scope;
    graph.nodes = new List<SchemaNode>();
    graph.edges = new List<SchemaEdge>();
    if (!objectNames.isEmpty()) {
      List<Schema.DescribeSObjectResult> results = Schema.describeSObjects(
        objectNames,
        SObjectDescribeOptions.DEFERRED
      );
      // A custom setting ends in __c too, but it is configuration, not data model
      // (log 192), so it is dropped once the describe says what it is.
      List<Schema.DescribeSObjectResult> objects = new List<Schema.DescribeSObjectResult>();
      Map<String, String> namesInScope = new Map<String, String>();
      for (Schema.DescribeSObjectResult result : results) {
        if (!result.isCustomSetting()) {
          objects.add(result);
          namesInScope.put(result.getName().toLowerCase(), result.getName());
        }
      }
      for (Schema.DescribeSObjectResult result : objects) {
        graph.nodes.add(toNode(result, namesInScope, graph.edges));
      }
    }
    graph.nodes.sort();
    graph.edges.sort();
    graph.objectCount = graph.nodes.size();
    graph.cpuMs = Limits.getCpuTime() - cpuStart;
    return graph;
  }

  /**
   * @description Applies the discovery rules and overrides to the global describe keys.
   * @param scope A valid scope.
   * @param globalKeys Object names from the global describe.
   * @param overrides Override rows keyed by lower case object name.
   * @return List<String> Lower case object names in the scope, sorted.
   */
  @TestVisible
  private static List<String> objectNamesInScope(
    String scope,
    Set<String> globalKeys,
    Map<String, Schema_Visualizer_Object__mdt> overrides
  ) {
    List<String> names = new List<String>();
    for (String key : globalKeys) {
      String name = key.toLowerCase();
      Schema_Visualizer_Object__mdt row = overrides.get(name);
      if (row != null && row.Hidden__c == true) {
        continue;
      }
      Boolean belongs = (row != null && String.isNotBlank(row.Scope__c))
        ? row.Scope__c == scope
        : isDiscoveredIn(name, scope);
      if (belongs) {
        names.add(name);
      }
    }
    names.sort();
    return names;
  }

  private static Boolean isDiscoveredIn(String name, String scope) {
    if (isUnpackagedCustomObject(name)) {
      return name.startsWith(EMPLOYER_HUB_PREFIX)
        ? scope == SCOPE_EMPLOYER_HUB
        : scope == SCOPE_PORTFOLIO;
    }
    return STANDARD_OBJECTS_BY_SCOPE.get(scope).contains(name);
  }

  // A custom object of this org: ends in __c with no namespace prefix, so exactly one "__".
  private static Boolean isUnpackagedCustomObject(String name) {
    for (String suffix : DROPPED_SUFFIXES) {
      if (name.endsWith(suffix)) {
        return false;
      }
    }
    return name.endsWith(CUSTOM_SUFFIX) &&
      name.countMatches(NAME_SEPARATOR) == 1;
  }

  private static Map<String, Schema_Visualizer_Object__mdt> overridesByObjectName() {
    List<Schema_Visualizer_Object__mdt> rows = overrideRecords != null
      ? overrideRecords
      : Schema_Visualizer_Object__mdt.getAll().values();
    Map<String, Schema_Visualizer_Object__mdt> byName = new Map<String, Schema_Visualizer_Object__mdt>();
    for (Schema_Visualizer_Object__mdt row : rows) {
      if (String.isNotBlank(row.Object_API_Name__c)) {
        byName.put(row.Object_API_Name__c.trim().toLowerCase(), row);
      }
    }
    return byName;
  }

  private static SchemaNode toNode(
    Schema.DescribeSObjectResult result,
    Map<String, String> namesInScope,
    List<SchemaEdge> edges
  ) {
    SchemaNode node = new SchemaNode();
    node.apiName = result.getName();
    node.label = result.getLabel();
    node.isCustom = result.isCustom();
    node.fields = new List<SchemaField>();
    for (Schema.SObjectField token : result.fields.getMap().values()) {
      Schema.DescribeFieldResult describe = token.getDescribe();
      SchemaField field = toField(describe);
      node.fields.add(field);
      for (String target : field.referenceTo) {
        String targetName = namesInScope.get(target.toLowerCase());
        if (targetName != null) {
          edges.add(toEdge(node.apiName, targetName, describe));
        }
      }
    }
    node.fields.sort();
    node.fieldCount = node.fields.size();
    return node;
  }

  private static SchemaField toField(Schema.DescribeFieldResult describe) {
    SchemaField field = new SchemaField();
    field.apiName = describe.getName();
    field.label = describe.getLabel();
    field.type = describe.getType().name();
    field.isRequired =
      !describe.isNillable() &&
      describe.isCreateable() &&
      !describe.isDefaultedOnCreate();
    field.referenceTo = new List<String>();
    for (Schema.SObjectType target : describe.getReferenceTo()) {
      field.referenceTo.add(String.valueOf(target));
    }
    return field;
  }

  private static SchemaEdge toEdge(
    String fromObject,
    String toObject,
    Schema.DescribeFieldResult describe
  ) {
    SchemaEdge edge = new SchemaEdge();
    edge.fromObject = fromObject;
    edge.toObject = toObject;
    edge.field = describe.getName();
    // Only a master-detail field carries a relationship order (trap 47, pillars-design §2.3).
    edge.kind = describe.getRelationshipOrder() != null
      ? KIND_MASTER_DETAIL
      : KIND_LOOKUP;
    return edge;
  }

  private static AuraHandledException auraError(String message) {
    AuraHandledException error = new AuraHandledException(message);
    error.setMessage(message);
    return error;
  }

  /**
   * @description The ERD for one scope.
   */
  public class SchemaGraph {
    @AuraEnabled
    public String scope;
    @AuraEnabled
    public List<SchemaNode> nodes;
    @AuraEnabled
    public List<SchemaEdge> edges;
    @AuraEnabled
    public Integer objectCount;
    @AuraEnabled
    public Integer cpuMs;
  }

  /**
   * @description One object, sorted by API name.
   */
  public class SchemaNode implements Comparable {
    @AuraEnabled
    public String apiName;
    @AuraEnabled
    public String label;
    @AuraEnabled
    public Boolean isCustom;
    @AuraEnabled
    public Integer fieldCount;
    @AuraEnabled
    public List<SchemaField> fields;

    /**
     * @description Orders nodes by API name.
     * @param other Another SchemaNode.
     * @return Integer Negative, zero or positive.
     */
    public Integer compareTo(Object other) {
      return apiName.compareTo(((SchemaNode) other).apiName);
    }
  }

  /**
   * @description One field of an object, sorted by API name.
   */
  public class SchemaField implements Comparable {
    @AuraEnabled
    public String apiName;
    @AuraEnabled
    public String label;
    @AuraEnabled
    public String type;
    @AuraEnabled
    public List<String> referenceTo;
    @AuraEnabled
    public Boolean isRequired;

    /**
     * @description Orders fields by API name.
     * @param other Another SchemaField.
     * @return Integer Negative, zero or positive.
     */
    public Integer compareTo(Object other) {
      return apiName.compareTo(((SchemaField) other).apiName);
    }
  }

  /**
   * @description One reference field whose target is in scope, sorted by object then field.
   */
  public class SchemaEdge implements Comparable {
    @AuraEnabled
    public String fromObject;
    @AuraEnabled
    public String toObject;
    @AuraEnabled
    public String field;
    @AuraEnabled
    public String kind;

    /**
     * @description Orders edges by source object, then field.
     * @param other Another SchemaEdge.
     * @return Integer Negative, zero or positive.
     */
    public Integer compareTo(Object other) {
      SchemaEdge that = (SchemaEdge) other;
      Integer byObject = fromObject.compareTo(that.fromObject);
      return byObject != 0 ? byObject : field.compareTo(that.field);
    }
  }
}
