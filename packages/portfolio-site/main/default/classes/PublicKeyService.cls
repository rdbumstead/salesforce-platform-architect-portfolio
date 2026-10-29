/**
 * @description       : Stable public keys for the records the portfolio API exposes (ADR-038).
 *                      A key is an object prefix, an underscore and 10 random characters from a
 *                      base32 alphabet without l, o, 0 and 1, for example prj_8f3k2m9qtz. It is
 *                      opaque on purpose, so a rename never changes it and no name leaks. The
 *                      object triggers call assign on insert and refuseChange on update. The
 *                      backfill method gives keys to rows that existed before the field did.
 *                      The lookups run in system mode so a collision with a row the caller
 *                      cannot see is still found.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/28/2026
 * @Test Class        : [PublicKeyServiceTest]
 **/
public with sharing class PublicKeyService {
  public static final String FIELD_NAME = 'Public_Key__c';
  public static final String ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
  public static final Integer SUFFIX_LENGTH = 10;
  public static final Integer MAX_ATTEMPTS = 5;
  public static final String CHANGE_ERROR = 'Public_Key__c is set once and cannot be changed or cleared.';

  // Matches a key of any object: three lowercase letters, an underscore and 10 alphabet characters.
  private static final Pattern KEY_PATTERN = Pattern.compile(
    '^[a-z]{3}_[a-km-np-z2-9]{10}$'
  );

  /**
   * @description Every object that carries a key, in the order the backfill visits them.
   */
  public static final List<SObjectType> OBJECT_TYPES = new List<SObjectType>{
    Account.SObjectType,
    Contact.SObjectType,
    Skill__c.SObjectType,
    Experience__c.SObjectType,
    Experience_Highlight__c.SObjectType,
    Experience_Skill__c.SObjectType,
    Project__c.SObjectType,
    Project_Asset__c.SObjectType,
    Project_Skill__c.SObjectType,
    Certification__c.SObjectType,
    Certification_Skill__c.SObjectType,
    Education__c.SObjectType,
    Testimonial__c.SObjectType
  };

  private static final Map<SObjectType, String> PREFIXES = new Map<SObjectType, String>{
    Account.SObjectType => 'acc',
    Contact.SObjectType => 'con',
    Skill__c.SObjectType => 'skl',
    Experience__c.SObjectType => 'exp',
    Experience_Highlight__c.SObjectType => 'hlt',
    Experience_Skill__c.SObjectType => 'exs',
    Project__c.SObjectType => 'prj',
    Project_Asset__c.SObjectType => 'pas',
    Project_Skill__c.SObjectType => 'prs',
    Certification__c.SObjectType => 'crt',
    Certification_Skill__c.SObjectType => 'cks',
    Education__c.SObjectType => 'edu',
    Testimonial__c.SObjectType => 'tst'
  };

  // Test seams. A test sets suspended to insert rows without keys, and forcedKeys to make
  // the next draws known so the collision path can run.
  @TestVisible
  private static Boolean suspended = false;
  @TestVisible
  private static List<String> forcedKeys = new List<String>();

  /**
   * @description Raised when a unique key cannot be found after the allowed attempts.
   */
  public class PublicKeyException extends Exception {
  }

  /**
   * @description The prefix an object's keys start with.
   * @param objectType The object.
   * @return String The prefix, or null when the object carries no key.
   */
  public static String prefixFor(SObjectType objectType) {
    return PREFIXES.get(objectType);
  }

  /**
   * @description Builds one random key. It is not checked for collisions here.
   * @param prefix The object prefix.
   * @return String The key, for example prj_8f3k2m9qtz.
   */
  public static String generate(String prefix) {
    if (!forcedKeys.isEmpty()) {
      return forcedKeys.remove(0);
    }
    String suffix = '';
    for (Integer i = 0; i < SUFFIX_LENGTH; i++) {
      Integer index = Math.mod(Crypto.getRandomInteger(), ALPHABET.length());
      if (index < 0) {
        index += ALPHABET.length();
      }
      suffix += ALPHABET.substring(index, index + 1);
    }
    return prefix + '_' + suffix;
  }

  /**
   * @description True when the text has the shape of a public key. Case is ignored.
   * @param value Raw text.
   * @return Boolean True for a key shaped value.
   */
  public static Boolean isKey(String value) {
    if (String.isBlank(value)) {
      return false;
    }
    return KEY_PATTERN.matcher(value.trim().toLowerCase()).matches();
  }

  /**
   * @description Fills every blank Public_Key__c on the records. A key a record already
   *              carries is left alone. A key that collides with a stored row, or with another
   *              key in the same call, is drawn again, up to MAX_ATTEMPTS times.
   * @param records Records of objects that carry the field, new or being backfilled.
   * @throws PublicKeyException When a unique key cannot be found.
   */
  public static void assign(List<SObject> records) {
    if (suspended || records == null || records.isEmpty()) {
      return;
    }
    Map<SObjectType, List<SObject>> blanksByType = new Map<SObjectType, List<SObject>>();
    for (SObject record : records) {
      SObjectType objectType = record.getSObjectType();
      if (
        PREFIXES.containsKey(objectType) &&
        String.isBlank((String) record.get(FIELD_NAME))
      ) {
        if (!blanksByType.containsKey(objectType)) {
          blanksByType.put(objectType, new List<SObject>());
        }
        blanksByType.get(objectType).add(record);
      }
    }
    for (SObjectType objectType : blanksByType.keySet()) {
      assignForType(objectType, blanksByType.get(objectType));
    }
  }

  /**
   * @description Refuses an update that changes or clears a key already set. Setting a key on
   *              a row that had none is allowed, which is what the backfill does.
   * @param records The updated records.
   * @param oldRecords The records as they were, by Id.
   */
  public static void refuseChange(
    List<SObject> records,
    Map<Id, SObject> oldRecords
  ) {
    if (records == null || oldRecords == null) {
      return;
    }
    for (SObject record : records) {
      SObject before = oldRecords.get(record.Id);
      String oldKey = before == null ? null : (String) before.get(FIELD_NAME);
      if (String.isNotBlank(oldKey)) {
        String newKey = (String) record.get(FIELD_NAME);
        // String == ignores case in Apex, so the exact comparison uses equals.
        if (newKey == null || !oldKey.equals(newKey)) {
          record.addError(CHANGE_ERROR);
        }
      }
    }
  }

  /**
   * @description Finds the Id of the record that holds a key.
   * @param objectType The object the key belongs to.
   * @param key The public key, any case.
   * @return Id The record Id, or null when no record holds the key.
   */
  public static Id findId(SObjectType objectType, String key) {
    if (!isKey(key) || !PREFIXES.containsKey(objectType)) {
      return null;
    }
    String lowered = key.trim().toLowerCase();
    String soql =
      'SELECT Id FROM ' +
      objectType.getDescribe().getName() +
      ' WHERE Public_Key__c = :lowered LIMIT 1';
    List<SObject> rows = Database.queryWithBinds(
      soql,
      new Map<String, Object>{ 'lowered' => lowered },
      AccessLevel.SYSTEM_MODE
    );
    return rows.isEmpty() ? null : rows[0].Id;
  }

  /**
   * @description Gives keys to up to maxRecords rows of one object that have none, and saves
   *              them. Run it again until it returns 0.
   * @param objectType The object to fill.
   * @param maxRecords The most rows to take in this call.
   * @return Integer How many rows were given a key.
   */
  public static Integer backfill(SObjectType objectType, Integer maxRecords) {
    if (
      !PREFIXES.containsKey(objectType) ||
      maxRecords == null ||
      maxRecords < 1
    ) {
      return 0;
    }
    String soql =
      'SELECT Id, Public_Key__c FROM ' +
      objectType.getDescribe().getName() +
      ' WHERE Public_Key__c = null LIMIT :maxRecords';
    List<SObject> rows = Database.queryWithBinds(
      soql,
      new Map<String, Object>{ 'maxRecords' => maxRecords },
      AccessLevel.SYSTEM_MODE
    );
    assign(rows);
    update rows;
    return rows.size();
  }

  /**
   * @description Counts the rows of one object that still have no key.
   * @param objectType The object.
   * @return Integer The count.
   */
  public static Integer countBlank(SObjectType objectType) {
    if (!PREFIXES.containsKey(objectType)) {
      return 0;
    }
    String soql =
      'SELECT COUNT() FROM ' +
      objectType.getDescribe().getName() +
      ' WHERE Public_Key__c = null';
    return Database.countQuery(soql);
  }

  private static void assignForType(
    SObjectType objectType,
    List<SObject> blanks
  ) {
    String prefix = PREFIXES.get(objectType);
    String objectName = objectType.getDescribe().getName();
    List<SObject> pending = blanks;
    Set<String> taken = new Set<String>();
    for (Integer attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      Set<String> drawn = new Set<String>();
      List<SObject> clashed = new List<SObject>();
      for (SObject record : pending) {
        String candidate = generate(prefix);
        if (taken.contains(candidate) || drawn.contains(candidate)) {
          clashed.add(record);
        } else {
          drawn.add(candidate);
          record.put(FIELD_NAME, candidate);
        }
      }
      Set<String> stored = storedKeys(objectName, drawn);
      for (SObject record : pending) {
        String assigned = (String) record.get(FIELD_NAME);
        if (assigned != null && stored.contains(assigned)) {
          drawn.remove(assigned);
          record.put(FIELD_NAME, null);
          clashed.add(record);
        }
      }
      taken.addAll(drawn);
      if (clashed.isEmpty()) {
        return;
      }
      pending = clashed;
    }
    throw new PublicKeyException(
      'Could not draw a unique public key for ' + objectName + '.'
    );
  }

  private static Set<String> storedKeys(
    String objectName,
    Set<String> candidates
  ) {
    Set<String> stored = new Set<String>();
    if (candidates.isEmpty()) {
      return stored;
    }
    String soql =
      'SELECT Public_Key__c FROM ' +
      objectName +
      ' WHERE Public_Key__c IN :candidates';
    List<SObject> rows = Database.queryWithBinds(
      soql,
      new Map<String, Object>{ 'candidates' => candidates },
      AccessLevel.SYSTEM_MODE
    );
    for (SObject row : rows) {
      stored.add((String) row.get(FIELD_NAME));
    }
    return stored;
  }
}
