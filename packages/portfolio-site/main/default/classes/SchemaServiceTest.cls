/**
 * @description       : Tests for SchemaService. The ERD reads no records, so the ERD
 *                      tests insert none. They read the org's real schema, the shipped
 *                      Schema_Visualizer_Object__mdt records, and the Employer Hub objects from the
 *                      employer-hub package. Guest tests run as the real Portfolio1 site guest user.
 *                      An edge points from the object holding the reference field to its target.
 *                      One more test inserts a project and an asset to prove the Url field takes
 *                      a resource path for the gallery.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
 **/
@isTest
private class SchemaServiceTest {
  private static final Integer CPU_BUDGET_MS = 1000;
  private static final List<String> HIDDEN_OBJECTS = new List<String>{
    'API_Rate_Window__c',
    'API_Access_Request__c',
    'Github_Cache__c',
    'Jira_Cache__c'
  };

  @isTest
  static void projectSkillIsMasterDetailChildOfProject() {
    SchemaService.SchemaGraph graph = graphFor(SchemaService.SCOPE_PORTFOLIO);

    SchemaService.SchemaEdge edge = findEdge(
      graph,
      'Project_Skill__c',
      'Project__c'
    );
    Assert.isNotNull(edge, 'Project_Skill__c.Project__c should be an edge');
    Assert.areEqual('Project__c', edge.toObject, 'Edge target');
    Assert.areEqual(
      SchemaService.KIND_MASTER_DETAIL,
      edge.kind,
      'Project_Skill__c to Project__c is master-detail'
    );
  }

  @isTest
  static void projectAssetIsMasterDetailChildOfProject() {
    SchemaService.SchemaGraph graph = graphFor(SchemaService.SCOPE_PORTFOLIO);

    SchemaService.SchemaEdge edge = findEdge(
      graph,
      'Project_Asset__c',
      'Project__c'
    );
    Assert.isNotNull(edge, 'Project_Asset__c.Project__c should be an edge');
    Assert.areEqual('Project__c', edge.toObject, 'Edge target');
    Assert.areEqual(
      SchemaService.KIND_MASTER_DETAIL,
      edge.kind,
      'Project_Asset__c to Project__c is master-detail'
    );
  }

  @isTest
  static void contactAccountIsLookup() {
    SchemaService.SchemaGraph graph = graphFor(SchemaService.SCOPE_PORTFOLIO);

    SchemaService.SchemaEdge edge = findEdge(graph, 'Contact', 'AccountId');
    Assert.isNotNull(edge, 'Contact.AccountId should be an edge');
    Assert.areEqual('Account', edge.toObject, 'Edge target');
    Assert.areEqual(SchemaService.KIND_LOOKUP, edge.kind, 'A lookup');
  }

  @isTest
  static void shippedRecordsHideTheFourInternalObjects() {
    Set<String> portfolio = nodeNames(graphFor(SchemaService.SCOPE_PORTFOLIO));
    Set<String> employerHub = nodeNames(
      graphFor(SchemaService.SCOPE_EMPLOYER_HUB)
    );

    for (String hidden : HIDDEN_OBJECTS) {
      Assert.isFalse(
        portfolio.contains(hidden),
        hidden + ' should be hidden from portfolio'
      );
      Assert.isFalse(
        employerHub.contains(hidden),
        hidden + ' should be hidden from employerHub'
      );
    }
    Assert.isTrue(
      portfolio.contains('Project__c'),
      'A visible portfolio object is still there'
    );
  }

  @isTest
  static void customSettingsAreLeftOut() {
    Set<String> portfolio = nodeNames(graphFor(SchemaService.SCOPE_PORTFOLIO));
    Set<String> employerHub = nodeNames(
      graphFor(SchemaService.SCOPE_EMPLOYER_HUB)
    );

    Assert.isTrue(
      Circuit_Breaker_State__c.SObjectType.getDescribe().isCustomSetting(),
      'Circuit_Breaker_State__c is a custom setting'
    );
    Assert.isFalse(
      portfolio.contains('Circuit_Breaker_State__c'),
      'A custom setting is not drawn in portfolio'
    );
    Assert.isFalse(
      employerHub.contains('Circuit_Breaker_State__c'),
      'A custom setting is not drawn in employerHub'
    );
  }

  @isTest
  static void overrideRecordMovesAnObjectToEmployerHub() {
    // Custom metadata cannot be inserted in a test, so the rows go through the seam.
    SchemaService.overrideRecords = (List<Schema_Visualizer_Object__mdt>) JSON.deserialize(
      '[{"Object_API_Name__c":"Skill__c","Scope__c":"employerHub","Hidden__c":false}]',
      List<Schema_Visualizer_Object__mdt>.class
    );

    Set<String> portfolio = nodeNames(graphFor(SchemaService.SCOPE_PORTFOLIO));
    Set<String> employerHub = nodeNames(
      graphFor(SchemaService.SCOPE_EMPLOYER_HUB)
    );

    Assert.isTrue(
      employerHub.contains('Skill__c'),
      'The override moves Skill__c to employerHub'
    );
    Assert.isFalse(portfolio.contains('Skill__c'), 'Skill__c leaves portfolio');
  }

  @isTest
  static void overrideRecordHidesAnObject() {
    SchemaService.overrideRecords = (List<Schema_Visualizer_Object__mdt>) JSON.deserialize(
      '[{"Object_API_Name__c":" skill__c ","Hidden__c":true}]',
      List<Schema_Visualizer_Object__mdt>.class
    );

    Set<String> portfolio = nodeNames(graphFor(SchemaService.SCOPE_PORTFOLIO));

    Assert.isFalse(
      portfolio.contains('Skill__c'),
      'A hidden row matches without regard to case or spaces'
    );
  }

  @isTest
  static void employerHubObjectsLandInEmployerHub() {
    SchemaService.SchemaGraph employerHub = graphFor(
      SchemaService.SCOPE_EMPLOYER_HUB
    );
    Set<String> employerHubNames = nodeNames(employerHub);
    Set<String> portfolio = nodeNames(graphFor(SchemaService.SCOPE_PORTFOLIO));

    for (
      String name : new List<String>{
        'EH_Job_Posting__c',
        'EH_Sponsorship__c',
        'EH_Letter_of_Support__c',
        'EH_Partner_Engagement__c'
      }
    ) {
      Assert.isTrue(employerHubNames.contains(name), name + ' in employerHub');
      Assert.isFalse(portfolio.contains(name), name + ' not in portfolio');
    }
    Assert.isFalse(
      employerHubNames.contains('Project__c'),
      'Portfolio objects stay out of employerHub'
    );
    Assert.areEqual(
      SchemaService.KIND_MASTER_DETAIL,
      findEdge(employerHub, 'EH_Job_Posting__c', 'Partner_Engagement__c').kind,
      'Job posting is a master-detail child of partner engagement'
    );
    Assert.areEqual(
      SchemaService.KIND_LOOKUP,
      findEdge(employerHub, 'EH_Sponsorship__c', 'Contract__c').kind,
      'Sponsorship looks up Contract'
    );
  }

  @isTest
  static void accountAppearsInBothScopes() {
    Set<String> portfolio = nodeNames(graphFor(SchemaService.SCOPE_PORTFOLIO));
    Set<String> employerHub = nodeNames(
      graphFor(SchemaService.SCOPE_EMPLOYER_HUB)
    );

    Assert.isTrue(portfolio.contains('Account'), 'Account in portfolio');
    Assert.isTrue(employerHub.contains('Account'), 'Account in employerHub');
    Assert.isFalse(portfolio.contains('Case'), 'Case only in employerHub');
    Assert.isTrue(employerHub.contains('Case'), 'Case in employerHub');
  }

  @isTest
  static void unknownScopeThrows() {
    try {
      SchemaService.getSchemaGraph('everything');
      Assert.fail('An unknown scope should throw');
    } catch (AuraHandledException error) {
      Assert.areEqual(
        SchemaService.UNKNOWN_SCOPE_MESSAGE,
        error.getMessage(),
        'Error message'
      );
    }
  }

  @isTest
  static void countObjectsMatchesTheGraphForEachScope() {
    for (
      String scope : new List<String>{
        SchemaService.SCOPE_PORTFOLIO,
        SchemaService.SCOPE_EMPLOYER_HUB
      }
    ) {
      Assert.areEqual(
        SchemaService.getSchemaGraph(scope).objectCount,
        SchemaService.countObjects(scope),
        'The card count equals the ERD count for ' + scope
      );
    }
  }

  @isTest
  static void countObjectsRejectsAnUnknownOrNullScope() {
    for (String scope : new List<String>{ 'everything', null }) {
      try {
        SchemaService.countObjects(scope);
        Assert.fail('An unknown scope should throw');
      } catch (AuraHandledException error) {
        Assert.areEqual(
          SchemaService.UNKNOWN_SCOPE_MESSAGE,
          error.getMessage(),
          'Error message'
        );
      }
    }
  }

  @isTest
  static void nullScopeThrows() {
    try {
      SchemaService.getSchemaGraph(null);
      Assert.fail('A null scope should throw');
    } catch (AuraHandledException error) {
      Assert.areEqual(
        SchemaService.UNKNOWN_SCOPE_MESSAGE,
        error.getMessage(),
        'Error message'
      );
    }
  }

  @isTest
  static void discoveryKeepsOnlyUnpackagedCustomObjectsAndTheAllowlist() {
    Set<String> keys = new Set<String>{
      'widget__c',
      'eh_gadget__c',
      'ns__packaged__c',
      'widget__share',
      'widget__history',
      'setting__mdt',
      'signal__e',
      'account',
      'case',
      'lead'
    };
    Map<String, Schema_Visualizer_Object__mdt> none = new Map<String, Schema_Visualizer_Object__mdt>();

    Test.startTest();
    List<String> portfolio = SchemaService.objectNamesInScope(
      SchemaService.SCOPE_PORTFOLIO,
      keys,
      none
    );
    List<String> employerHub = SchemaService.objectNamesInScope(
      SchemaService.SCOPE_EMPLOYER_HUB,
      keys,
      none
    );
    Test.stopTest();

    Assert.areEqual(
      new List<String>{ 'account', 'widget__c' },
      portfolio,
      'Portfolio keeps unpackaged custom objects and its allowlist'
    );
    Assert.areEqual(
      new List<String>{ 'account', 'case', 'eh_gadget__c' },
      employerHub,
      'employerHub keeps EH_ objects and its allowlist'
    );
  }

  @isTest
  static void nodeCarriesFieldDetail() {
    SchemaService.SchemaGraph graph = graphFor(SchemaService.SCOPE_PORTFOLIO);

    SchemaService.SchemaNode asset = findNode(graph, 'Project_Asset__c');
    Assert.isTrue(asset.isCustom, 'Custom object');
    Assert.areEqual(asset.fields.size(), asset.fieldCount, 'Field count');
    SchemaService.SchemaField parent = findField(asset, 'Project__c');
    Assert.areEqual('REFERENCE', parent.type, 'Reference type');
    Assert.areEqual(
      new List<String>{ 'Project__c' },
      parent.referenceTo,
      'Reference target'
    );
    Assert.isTrue(parent.isRequired, 'Master-detail is required');
    SchemaService.SchemaField altText = findField(asset, 'Alt_Text__c');
    Assert.areEqual('STRING', altText.type, 'Text type');
    Assert.isTrue(altText.isRequired, 'Alt text is required');
    Assert.areEqual(graph.nodes.size(), graph.objectCount, 'Object count');
    Assert.areEqual(SchemaService.SCOPE_PORTFOLIO, graph.scope, 'Scope echoed');
  }

  @isTest
  static void eachScopeStaysUnderTheCpuBudget() {
    for (
      String scope : new List<String>{
        SchemaService.SCOPE_PORTFOLIO,
        SchemaService.SCOPE_EMPLOYER_HUB
      }
    ) {
      SchemaService.SchemaGraph graph = graphFor(scope);
      System.debug(
        LoggingLevel.INFO,
        'SchemaService cpuMs ' +
          scope +
          ' ' +
          graph.cpuMs +
          ' objects ' +
          graph.objectCount +
          ' edges ' +
          graph.edges.size()
      );
      Assert.isTrue(
        graph.cpuMs < CPU_BUDGET_MS,
        scope + ' took ' + graph.cpuMs + ' ms of CPU, budget ' + CPU_BUDGET_MS
      );
    }
  }

  @isTest
  static void guestDescribeMatchesAdmin() {
    User guest = SiteGuestTestSupport.preparedGuest();
    Map<String, Set<String>> adminNames = new Map<String, Set<String>>();
    Map<String, Set<String>> guestNames = new Map<String, Set<String>>();
    List<String> scopes = new List<String>{
      SchemaService.SCOPE_PORTFOLIO,
      SchemaService.SCOPE_EMPLOYER_HUB
    };

    Test.startTest();
    for (String scope : scopes) {
      adminNames.put(scope, nodeNames(SchemaService.getSchemaGraph(scope)));
    }
    System.runAs(guest) {
      for (String scope : scopes) {
        guestNames.put(scope, nodeNames(SchemaService.getSchemaGraph(scope)));
      }
    }
    Test.stopTest();

    for (String scope : scopes) {
      System.debug(
        LoggingLevel.INFO,
        'SchemaService ' +
          scope +
          ' admin ' +
          adminNames.get(scope).size() +
          ' ' +
          adminNames.get(scope) +
          ' guest ' +
          guestNames.get(scope).size() +
          ' ' +
          guestNames.get(scope)
      );
      Assert.areEqual(
        adminNames.get(scope),
        guestNames.get(scope),
        'The guest sees the same ' + scope + ' objects as the admin'
      );
      for (String hidden : HIDDEN_OBJECTS) {
        Assert.isFalse(
          guestNames.get(scope).contains(hidden),
          hidden + ' is hidden from the guest too'
        );
      }
    }
  }

  // The gallery stores static resource paths as resource:<Name>/<path>
  // in the Url field. This proves the field accepts that form.
  @isTest
  static void assetUrlFieldAcceptsResourcePath() {
    Project__c project = new Project__c(
      Name = 'Schema Test Project',
      Sort_Order__c = 1
    );
    insert project;
    Project_Asset__c asset = new Project_Asset__c(
      Name = 'Schema Test Asset',
      Project__c = project.Id,
      Type__c = 'Image',
      Alt_Text__c = 'Schema test asset',
      External_URL__c = 'resource:EH_Assets/flow-part-1.svg'
    );

    Test.startTest();
    Database.SaveResult result = Database.insert(asset, false);
    Test.stopTest();

    Assert.isTrue(
      result.isSuccess(),
      'Url field refused the resource path: ' + result.getErrors()
    );
    Assert.areEqual(
      'resource:EH_Assets/flow-part-1.svg',
      [SELECT External_URL__c FROM Project_Asset__c WHERE Id = :asset.Id]
      .External_URL__c,
      'Stored as given'
    );
  }

  private static SchemaService.SchemaGraph graphFor(String scope) {
    return SchemaService.getSchemaGraph(scope);
  }

  private static Set<String> nodeNames(SchemaService.SchemaGraph graph) {
    Set<String> names = new Set<String>();
    for (SchemaService.SchemaNode node : graph.nodes) {
      names.add(node.apiName);
    }
    return names;
  }

  private static SchemaService.SchemaNode findNode(
    SchemaService.SchemaGraph graph,
    String apiName
  ) {
    for (SchemaService.SchemaNode node : graph.nodes) {
      if (node.apiName == apiName) {
        return node;
      }
    }
    Assert.fail(apiName + ' is not a node');
    return null;
  }

  private static SchemaService.SchemaField findField(
    SchemaService.SchemaNode node,
    String apiName
  ) {
    for (SchemaService.SchemaField field : node.fields) {
      if (field.apiName == apiName) {
        return field;
      }
    }
    Assert.fail(apiName + ' is not a field of ' + node.apiName);
    return null;
  }

  private static SchemaService.SchemaEdge findEdge(
    SchemaService.SchemaGraph graph,
    String fromObject,
    String field
  ) {
    for (SchemaService.SchemaEdge edge : graph.edges) {
      if (edge.fromObject == fromObject && edge.field == field) {
        return edge;
      }
    }
    return null;
  }
}
