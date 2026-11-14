/**
 * @description       : Builds the resume snapshot the static build exports for the tailored
 *                      resume: the owner, every role, and every selectable item (headline and
 *                      summary variants, role bullets, skills, projects, certifications) with its
 *                      tags, priority, verified flag and visibility. Only a user holding the
 *                      Site_Build_Export permission may build it. Item records are read in user
 *                      mode, so that user also needs the resume fields Portfolio_Site_Build
 *                      grants, and the site guest can read none of them. The export
 *                      fails rather than guess: a record that is not Public, an item with no id,
 *                      two items with one id, a role with no id, an item with no text or
 *                      priority, and anything but exactly one primary role that is also current
 *                      each throw SnapshotException. Performs no DML.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/14/2026
 * @Test Class        : [ResumeSnapshotServiceTest]
 **/
public with sharing class ResumeSnapshotService {
  /** The contract version the snapshot follows. */
  public static final Integer VERSION = 1;
  /** The one visibility value the org may hold. */
  public static final String PUBLIC_VISIBILITY = 'Public';

  public static final String TYPE_HEADLINE = 'headline';
  public static final String TYPE_SUMMARY = 'summary';
  public static final String TYPE_BULLET = 'bullet';
  public static final String TYPE_SKILL = 'skill';
  public static final String TYPE_PROJECT = 'project';
  public static final String TYPE_CERTIFICATION = 'certification';

  /**
   * The project statuses the public pages list. A project in any other status, or with none, is
   * not shown on the site, so it is never offered as resume evidence. Mirrors
   * PAPIProjects.LISTED_STATUS_FILTER and ApiLabOptionsController.LISTED_PROJECT_STATUSES. Change
   * all three together.
   */
  @TestVisible
  private static final Set<String> LISTED_PROJECT_STATUSES = new Set<String>{
    'Live – In Production',
    'Live – Demo / Reference',
    'Active Development'
  };

  private static final Map<String, String> VARIANT_TYPES = new Map<String, String>{
    'Headline' => TYPE_HEADLINE,
    'Summary' => TYPE_SUMMARY
  };

  /**
   * @description Thrown when the org data cannot make a snapshot that meets the contract.
   */
  public class SnapshotException extends Exception {
  }

  /** The snapshot, typed. getSnapshot turns it into the contract's JSON keys. */
  public class Snapshot {
    public Integer version;
    public Datetime generatedAt;
    public Owner owner;
    public List<Role> roles = new List<Role>();
    public List<Item> items = new List<Item>();
  }

  /** The resume owner and the employer of the primary role. */
  public class Owner {
    public String name;
    public String currentEmployer;
  }

  /** One role. current is the org's own current flag. */
  public class Role {
    public String id;
    public String employer;
    public String title;
    public Date startDate;
    public Date endDate;
    public Boolean current;
  }

  /** One selectable item. roleId is set on bullets only. */
  public class Item {
    public String id;
    public String itemType;
    public String roleId;
    public String text;
    public List<String> tags = new List<String>();
    public Integer priority;
    public Boolean verified;
    public String visibility;
  }

  /**
   * @description The snapshot in the contract's shape, for the site export.
   * @return the snapshot as JSON ready maps and lists
   * @throws SnapshotException when the data breaks a rule of the contract
   * @example
   * Map<String, Object> snapshot = ResumeSnapshotService.getSnapshot();
   */
  public static Map<String, Object> getSnapshot() {
    return toContract(build());
  }

  /**
   * @description Reads the org and builds the typed snapshot.
   * @return the snapshot
   * @throws SnapshotException when the data breaks a rule of the contract
   */
  public static Snapshot build() {
    if (!FeatureManagement.checkPermission(SiteExportResource.PERMISSION)) {
      throw new SnapshotException(
        'The resume snapshot needs the Site_Build_Export permission.'
      );
    }
    List<Experience__c> experiences = [
      SELECT
        Id,
        Name,
        Public_Key__c,
        Start_Date__c,
        End_Date__c,
        Is_Current_Role__c,
        Is_Primary_Role__c
      FROM Experience__c
      WITH USER_MODE
      ORDER BY Is_Current_Role__c DESC, Start_Date__c DESC NULLS LAST, Name ASC
    ];
    SystemModeSelector names = new SystemModeSelector();
    Map<Id, String> employerNames = names.employerNames(
      new Map<Id, Experience__c>(experiences).keySet()
    );

    Snapshot snapshot = new Snapshot();
    snapshot.version = VERSION;
    snapshot.generatedAt = Datetime.now();
    Map<Id, String> roleIds = new Map<Id, String>();
    for (Experience__c experience : experiences) {
      Role role = toRole(experience, employerNames);
      snapshot.roles.add(role);
      roleIds.put(experience.Id, role.id);
    }
    snapshot.owner = new Owner();
    snapshot.owner.name = names.ownerName();
    snapshot.owner.currentEmployer = employerNames.get(
      primaryRole(experiences).Id
    );

    addVariants(snapshot.items);
    addBullets(snapshot.items, roleIds);
    addSkills(snapshot.items);
    addProjects(snapshot.items);
    addCertifications(snapshot.items, names);
    checkUniqueIds(snapshot.items);
    return snapshot;
  }

  private static Role toRole(
    Experience__c experience,
    Map<Id, String> employerNames
  ) {
    if (String.isBlank(experience.Public_Key__c)) {
      throw new SnapshotException(
        'The role ' + experience.Name + ' has no Public_Key__c.'
      );
    }
    Role role = new Role();
    role.id = experience.Public_Key__c;
    role.title = experience.Name;
    role.employer = employerNames.get(experience.Id);
    role.startDate = experience.Start_Date__c;
    role.endDate = experience.End_Date__c;
    role.current = experience.Is_Current_Role__c == true;
    return role;
  }

  /** The one role ticked primary, which must also be current. */
  private static Experience__c primaryRole(List<Experience__c> experiences) {
    List<Experience__c> primary = new List<Experience__c>();
    for (Experience__c experience : experiences) {
      if (experience.Is_Primary_Role__c == true) {
        primary.add(experience);
      }
    }
    if (primary.isEmpty()) {
      throw new SnapshotException(
        'No role is ticked Is_Primary_Role__c. Tick exactly one current role.'
      );
    }
    if (primary.size() > 1) {
      throw new SnapshotException(
        primary.size() +
        ' roles are ticked Is_Primary_Role__c. Tick exactly one current role.'
      );
    }
    if (primary[0].Is_Current_Role__c != true) {
      throw new SnapshotException(
        'The primary role ' +
          primary[0].Public_Key__c +
          ' is not marked Is_Current_Role__c.'
      );
    }
    return primary[0];
  }

  private static void addVariants(List<Item> items) {
    for (Resume_Variant__c variant : [
      SELECT
        Id,
        Public_Key__c,
        Variant_Type__c,
        Text__c,
        Requirement_Tags__c,
        Selection_Priority__c,
        Is_Verified__c,
        Visibility__c
      FROM Resume_Variant__c
      WITH USER_MODE
      ORDER BY Variant_Type__c ASC, Name ASC
    ]) {
      String itemType = VARIANT_TYPES.get(variant.Variant_Type__c);
      if (itemType == null) {
        throw new SnapshotException(
          'The variant ' + label(variant) + ' has no Variant_Type__c.'
        );
      }
      items.add(toItem(variant, itemType, variant.Text__c));
    }
  }

  private static void addBullets(List<Item> items, Map<Id, String> roleIds) {
    for (Experience_Highlight__c highlight : [
      SELECT
        Id,
        Public_Key__c,
        Experience__c,
        Description__c,
        Requirement_Tags__c,
        Selection_Priority__c,
        Is_Verified__c,
        Visibility__c
      FROM Experience_Highlight__c
      WITH USER_MODE
      ORDER BY Experience__c ASC, Sort_Order__c ASC NULLS LAST, Name ASC
    ]) {
      Item item = toItem(highlight, TYPE_BULLET, highlight.Description__c);
      item.roleId = roleIds.get(highlight.Experience__c);
      items.add(item);
    }
  }

  private static void addSkills(List<Item> items) {
    for (Skill__c skill : [
      SELECT
        Id,
        Name,
        Public_Key__c,
        Display_Name__c,
        Requirement_Tags__c,
        Selection_Priority__c,
        Is_Verified__c,
        Visibility__c
      FROM Skill__c
      WITH USER_MODE
      ORDER BY Name ASC
    ]) {
      items.add(toItem(skill, TYPE_SKILL, skill.Display_Name__c ?? skill.Name));
    }
  }

  private static void addProjects(List<Item> items) {
    for (Project__c project : [
      SELECT
        Id,
        Name,
        Public_Key__c,
        Requirement_Tags__c,
        Selection_Priority__c,
        Is_Verified__c,
        Visibility__c
      FROM Project__c
      WHERE Status__c IN :LISTED_PROJECT_STATUSES
      WITH USER_MODE
      ORDER BY Name ASC
    ]) {
      items.add(toItem(project, TYPE_PROJECT, project.Name));
    }
  }

  private static void addCertifications(
    List<Item> items,
    SystemModeSelector names
  ) {
    for (Certification__c certification : names.certifications()) {
      items.add(toItem(certification, TYPE_CERTIFICATION, certification.Name));
    }
  }

  /** One item from any of the five objects, which share the four selection fields. */
  private static Item toItem(SObject record, String itemType, String text) {
    String visibility = (String) record.get('Visibility__c');
    String priority = (String) record.get('Selection_Priority__c');
    String key = (String) record.get('Public_Key__c');
    if (String.isBlank(key)) {
      throw new SnapshotException(
        'A ' + itemType + ' record (' + record.Id + ') has no Public_Key__c.'
      );
    }
    if (visibility != PUBLIC_VISIBILITY) {
      throw new SnapshotException(
        'The ' +
          itemType +
          ' ' +
          key +
          ' has visibility "' +
          (visibility ?? '') +
          '". Only Public may be exported.'
      );
    }
    if (String.isBlank(priority)) {
      throw new SnapshotException(
        'The ' + itemType + ' ' + key + ' has no Selection_Priority__c.'
      );
    }
    if (String.isBlank(text)) {
      throw new SnapshotException(
        'The ' + itemType + ' ' + key + ' has no text.'
      );
    }
    Item item = new Item();
    item.id = key;
    item.itemType = itemType;
    item.text = text;
    item.priority = Integer.valueOf(priority);
    item.verified = record.get('Is_Verified__c') == true;
    item.visibility = visibility.toLowerCase();
    String tags = (String) record.get('Requirement_Tags__c');
    if (String.isNotBlank(tags)) {
      item.tags = tags.split(';');
    }
    return item;
  }

  private static void checkUniqueIds(List<Item> items) {
    Set<String> seen = new Set<String>();
    for (Item item : items) {
      if (!seen.add(item.id.toLowerCase())) {
        throw new SnapshotException(
          'Two items share the id ' + item.id + '. Ids must be unique.'
        );
      }
    }
  }

  private static String label(Resume_Variant__c variant) {
    return String.isBlank(variant.Public_Key__c)
      ? String.valueOf(variant.Id)
      : variant.Public_Key__c;
  }

  /**
   * @description The typed snapshot with the contract's keys. Apex reserves type and end as
   *              names, so the typed fields carry other names and the keys are set here.
   * @param snapshot the typed snapshot
   * @return the snapshot as maps and lists
   */
  public static Map<String, Object> toContract(Snapshot snapshot) {
    List<Object> roles = new List<Object>();
    for (Role role : snapshot.roles) {
      roles.add(
        new Map<String, Object>{
          'id' => role.id,
          'employer' => role.employer,
          'title' => role.title,
          'start' => isoDate(role.startDate),
          'end' => isoDate(role.endDate),
          'current' => role.current
        }
      );
    }
    List<Object> items = new List<Object>();
    for (Item item : snapshot.items) {
      Map<String, Object> entry = new Map<String, Object>{
        'id' => item.id,
        'type' => item.itemType
      };
      if (item.roleId != null) {
        entry.put('roleId', item.roleId);
      }
      entry.put('text', item.text);
      entry.put('tags', item.tags);
      entry.put('priority', item.priority);
      entry.put('verified', item.verified);
      entry.put('visibility', item.visibility);
      items.add(entry);
    }
    return new Map<String, Object>{
      'version' => snapshot.version,
      'generatedAt' => snapshot.generatedAt,
      'owner' => new Map<String, Object>{
        'name' => snapshot.owner.name,
        'currentEmployer' => snapshot.owner.currentEmployer
      },
      'roles' => roles,
      'items' => items
    };
  }

  private static String isoDate(Date value) {
    return value == null ? null : String.valueOf(value);
  }

  /**
   * @description The reads that run in system mode, only after build() has checked the
   *              Site_Build_Export permission. The owner Contact's name and the employer
   *              Account names, which the guest already reads through the resume header and
   *              timeline, and the certifications, which are master detail to Contact, so
   *              reading them in user mode would need Contact access the build user is never
   *              given. Selects Name and the selection fields, so no contact detail can reach
   *              the snapshot.
   */
  private without sharing class SystemModeSelector {
    private String ownerName() {
      List<Contact> owners = [
        SELECT Name
        FROM Contact
        WHERE Is_Portfolio_Owner__c = TRUE
        WITH SYSTEM_MODE
        ORDER BY CreatedDate ASC
        LIMIT 1
      ];
      if (owners.isEmpty()) {
        throw new SnapshotException('No Contact is the portfolio owner.');
      }
      return owners[0].Name;
    }

    private List<Certification__c> certifications() {
      return [
        SELECT
          Id,
          Name,
          Public_Key__c,
          Requirement_Tags__c,
          Selection_Priority__c,
          Is_Verified__c,
          Visibility__c
        FROM Certification__c
        WITH SYSTEM_MODE
        ORDER BY Name ASC
      ];
    }

    /** Employer name by role Id. The employer is a lookup to Account, which the build user cannot read. */
    private Map<Id, String> employerNames(Set<Id> experienceIds) {
      Map<Id, String> namesByRole = new Map<Id, String>();
      for (Experience__c experience : [
        SELECT Id, Employer__r.Name
        FROM Experience__c
        WHERE Id IN :experienceIds
        WITH SYSTEM_MODE
      ]) {
        namesByRole.put(experience.Id, experience.Employer__r?.Name);
      }
      return namesByRole;
    }
  }
}
