/**
 * @description       : Serves the schema visualizer. getObjectGraph draws just the objects a section
 *                      reads, from the same allowed set. Discovers
 *                      the objects of one ERD scope from the global describe, describes only those,
 *                      and returns nodes with their fields and edges drawn from reference fields whose
 *                      target is in the same scope. Reads no records. Overrides and hidden objects
 *                      come from Schema_Visualizer_Object__mdt. No Platform Cache, the only cache is the
 *                      client one from cacheable=true.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/22/2026
 * @Test Class        : [SchemaServiceTest]
 **/
public with sharing class SchemaService {
  public static final String SCOPE_PORTFOLIO = 'portfolio';
  public static final String SCOPE_EMPLOYER_HUB = 'employerHub';
  public static final String SCOPE_OBJECTS = 'objects';
  public static final String KIND_MASTER_DETAIL = 'masterDetail';
  public static final String KIND_LOOKUP = 'lookup';
  public static final Integer MAX_OBJECTS = 12;

  @TestVisible
  private static final String UNKNOWN_SCOPE_MESSAGE = 'Unknown scope. Valid values: portfolio, employerHub';
  @TestVisible
  private static final String TOO_MANY_OBJECTS_MESSAGE =
    'Too many objects. Ask for ' +
    MAX_OBJECTS +
    ' or fewer.';

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

    return buildGraph(scope, describeScope(scope), cpuStart);
  }

  /**
   * @description Builds the ERD for just the named objects, for a section that shows the
   *              objects it reads. Only objects either scope already draws are allowed, so any
   *              other name is dropped without a word. Names match without regard to case. An
   *              allowed object that holds a reference to two or more of the requested ones is
   *              added too, so a junction object shows how the requested objects connect. Edges
   *              join only objects in the result.
   * @param objectNames API names to draw, at most 12.
   * @return SchemaGraph Scope objects, nodes sorted by API name, edges sorted by object and
   *         field, and the server CPU the call took. Empty when nothing allowed was asked for.
   * @throws AuraHandledException When more than 12 names are requested.
   * @example
   * SchemaService.SchemaGraph graph = SchemaService.getObjectGraph(
   *   new List<String>{ 'Experience__c', 'Skill__c' }
   * );
   */
  @AuraEnabled(cacheable=true)
  public static SchemaGraph getObjectGraph(List<String> objectNames) {
    Integer cpuStart = Limits.getCpuTime();
    if (objectNames != null && objectNames.size() > MAX_OBJECTS) {
      throw auraError(TOO_MANY_OBJECTS_MESSAGE);
    }

    Map<String, Schema.DescribeSObjectResult> modelByName = describeModel();
    Set<String> requestedKeys = requestedModelKeys(objectNames, modelByName);
    List<Schema.DescribeSObjectResult> objects = new List<Schema.DescribeSObjectResult>();
    if (!requestedKeys.isEmpty()) {
      for (String key : modelByName.keySet()) {
        Schema.DescribeSObjectResult result = modelByName.get(key);
        if (
          requestedKeys.contains(key) || joinsRequested(result, requestedKeys)
        ) {
          objects.add(result);
        }
      }
    }
    return buildGraph(SCOPE_OBJECTS, objects, cpuStart);
  }

  /**
   * @description The API names, in their real case, of every object either ERD scope draws.
   *              Custom settings and hidden objects are left out, as in the ERD. A section can
   *              show a diagram only when one of its objects is in this set.
   * @return Set<String> The API names, never null.
   * @example
   * Boolean drawn = SchemaService.modelObjectNames().contains('Skill__c');
   */
  public static Set<String> modelObjectNames() {
    Set<String> names = new Set<String>();
    for (Schema.DescribeSObjectResult result : describeModel().values()) {
      names.add(result.getName());
    }
    return names;
  }

  /**
   * @description Counts the objects the ERD draws for one scope, with the same discovery
   *              rules as getSchemaGraph but without describing any field. The home page's
   *              Pillar A card reads it.
   * @param scope portfolio or employerHub.
   * @return Integer The object count, the same number as SchemaGraph.objectCount.
   * @throws AuraHandledException When the scope is anything else.
   * @example
   * Integer count = SchemaService.countObjects(SchemaService.SCOPE_EMPLOYER_HUB);
   */
  public static Integer countObjects(String scope) {
    if (scope == null || !STANDARD_OBJECTS_BY_SCOPE.containsKey(scope)) {
      throw auraError(UNKNOWN_SCOPE_MESSAGE);
    }
    return describeScope(scope).size();
  }

  /**
   * @description Describes the objects of one valid scope. A custom setting ends in __c
   *              too, but it is configuration, not data model, so it is dropped
   *              once the describe says what it is. Deferred describes, so no field is read.
   * @param scope A valid scope.
   * @return List<Schema.DescribeSObjectResult> The objects in the scope, never null.
   */
  private static List<Schema.DescribeSObjectResult> describeScope(
    String scope
  ) {
    return describeNames(
      objectNamesInScope(
        scope,
        Schema.getGlobalDescribe().keySet(),
        overridesByObjectName()
      )
    );
  }

  /**
   * @description Describes every object either scope draws, keyed by lower case name.
   * @return Map<String, Schema.DescribeSObjectResult> The objects, never null.
   */
  private static Map<String, Schema.DescribeSObjectResult> describeModel() {
    Map<String, Schema_Visualizer_Object__mdt> overrides = overridesByObjectName();
    Set<String> globalKeys = Schema.getGlobalDescribe().keySet();
    Set<String> names = new Set<String>();
    names.addAll(objectNamesInScope(SCOPE_PORTFOLIO, globalKeys, overrides));
    names.addAll(objectNamesInScope(SCOPE_EMPLOYER_HUB, globalKeys, overrides));
    Map<String, Schema.DescribeSObjectResult> modelByName = new Map<String, Schema.DescribeSObjectResult>();
    for (
      Schema.DescribeSObjectResult result : describeNames(
        new List<String>(names)
      )
    ) {
      modelByName.put(result.getName().toLowerCase(), result);
    }
    return modelByName;
  }

  /**
   * @description Describes the named objects with deferred describes, so no field is read,
   *              and drops custom settings.
   * @param objectNames Lower case object names that exist in the org.
   * @return List<Schema.DescribeSObjectResult> The objects, never null.
   */
  private static List<Schema.DescribeSObjectResult> describeNames(
    List<String> objectNames
  ) {
    List<Schema.DescribeSObjectResult> objects = new List<Schema.DescribeSObjectResult>();
    if (objectNames.isEmpty()) {
      return objects;
    }
    for (
      Schema.DescribeSObjectResult result : Schema.describeSObjects(
        objectNames,
        SObjectDescribeOptions.DEFERRED
      )
    ) {
      if (!result.isCustomSetting()) {
        objects.add(result);
      }
    }
    return objects;
  }

  /**
   * @description Turns the requested names into the lower case keys of allowed objects.
   * @param objectNames The names a caller asked for, may be null or hold blanks.
   * @param modelByName The allowed objects keyed by lower case name.
   * @return Set<String> The allowed keys that were asked for, never null.
   */
  private static Set<String> requestedModelKeys(
    List<String> objectNames,
    Map<String, Schema.DescribeSObjectResult> modelByName
  ) {
    Set<String> keys = new Set<String>();
    if (objectNames == null) {
      return keys;
    }
    for (String requested : objectNames) {
      if (String.isBlank(requested)) {
        continue;
      }
      String key = requested.trim().toLowerCase();
      if (modelByName.containsKey(key)) {
        keys.add(key);
      }
    }
    return keys;
  }

  /**
   * @description True when the object holds reference fields to two or more different
   *              requested objects, which makes it a junction between them.
   * @param result The object to check.
   * @param requestedKeys Lower case keys of the requested objects.
   * @return Boolean True for a junction.
   */
  private static Boolean joinsRequested(
    Schema.DescribeSObjectResult result,
    Set<String> requestedKeys
  ) {
    Set<String> joinedKeys = new Set<String>();
    for (Schema.SObjectField token : result.fields.getMap().values()) {
      for (
        Schema.SObjectType referenced : token.getDescribe().getReferenceTo()
      ) {
        String referencedKey = String.valueOf(referenced).toLowerCase();
        if (requestedKeys.contains(referencedKey)) {
          joinedKeys.add(referencedKey);
        }
      }
    }
    return joinedKeys.size() >= 2;
  }

  /**
   * @description Builds the nodes and edges for a set of described objects. Edges join only
   *              objects in the set.
   * @param scope The scope name to echo back.
   * @param objects The described objects.
   * @param cpuStart The CPU time when the public call began.
   * @return SchemaGraph The sorted graph.
   */
  private static SchemaGraph buildGraph(
    String scope,
    List<Schema.DescribeSObjectResult> objects,
    Integer cpuStart
  ) {
    Map<String, String> namesInScope = new Map<String, String>();
    for (Schema.DescribeSObjectResult result : objects) {
      namesInScope.put(result.getName().toLowerCase(), result.getName());
    }

    SchemaGraph graph = new SchemaGraph();
    graph.scope = scope;
    graph.nodes = new List<SchemaNode>();
    graph.edges = new List<SchemaEdge>();
    for (Schema.DescribeSObjectResult result : objects) {
      graph.nodes.add(toNode(result, namesInScope, graph.edges));
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
    // Only a master-detail field carries a relationship order.
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
