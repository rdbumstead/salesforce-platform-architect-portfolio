/**
 * Marks every resume item that was live before the selection fields arrived as verified, on
 * the owner's approval that the records live on the site today start verified. The objects
 * are Experience_Highlight__c, Skill__c, Project__c and Certification__c. Resume_Variant__c
 * is new, so none of its records is touched. The owner runs this ONCE against production,
 * after the deploy that adds the fields. Nothing here runs by itself.
 *
 * Run it:
 *   sf apex run --file scripts/mark-existing-verified.apex --target-org spap-portfolio
 *
 * How it knows a record existed before the deploy: adding a picklist with a default leaves
 * every existing record blank, while every record made after the deploy gets the defaults
 * (visibility Public, priority 2, not verified). So the script takes only records whose
 * Visibility__c is blank, and on each it sets Is_Verified__c to true, Visibility__c to Public
 * (the only value the field holds) and Selection_Priority__c to 2 when that is blank too. A
 * record made after the deploy is never picked, so a new item is never marked verified, and
 * a second run finds nothing to do.
 *
 * It does not tick Is_Primary_Role__c on any role. The owner ticks that by hand.
 *
 * How to check it worked (read only):
 *   SELECT COUNT() FROM Skill__c WHERE Visibility__c = null
 * The count must be 0 for each of the four objects. The script prints one line per object in
 * the debug log (search the log for MARK_VERIFIED): how many records it updated and how many
 * the object holds.
 */
Map<String, Integer> updatedByObject = new Map<String, Integer>();
Map<String, Integer> totalByObject = new Map<String, Integer>();
List<SObject> changed = new List<SObject>();

List<List<SObject>> blanks = new List<List<SObject>>{
  [
    SELECT Id, Selection_Priority__c
    FROM Experience_Highlight__c
    WHERE Visibility__c = NULL
    LIMIT 2000
  ],
  [
    SELECT Id, Selection_Priority__c
    FROM Skill__c
    WHERE Visibility__c = NULL
    LIMIT 2000
  ],
  [
    SELECT Id, Selection_Priority__c
    FROM Project__c
    WHERE Visibility__c = NULL
    LIMIT 2000
  ],
  [
    SELECT Id, Selection_Priority__c
    FROM Certification__c
    WHERE Visibility__c = NULL
    LIMIT 2000
  ]
};
List<String> objectNames = new List<String>{
  'Experience_Highlight__c',
  'Skill__c',
  'Project__c',
  'Certification__c'
};

for (Integer i = 0; i < blanks.size(); i++) {
  for (SObject record : blanks[i]) {
    record.put('Is_Verified__c', true);
    record.put('Visibility__c', 'Public');
    if (String.isBlank((String) record.get('Selection_Priority__c'))) {
      record.put('Selection_Priority__c', '2');
    }
    changed.add(record);
  }
  updatedByObject.put(objectNames[i], blanks[i].size());
}
update changed;

totalByObject.put(
  'Experience_Highlight__c',
  [SELECT COUNT() FROM Experience_Highlight__c]
);
totalByObject.put('Skill__c', [SELECT COUNT() FROM Skill__c]);
totalByObject.put('Project__c', [SELECT COUNT() FROM Project__c]);
totalByObject.put('Certification__c', [SELECT COUNT() FROM Certification__c]);

for (String objectName : objectNames) {
  System.debug(
    LoggingLevel.ERROR,
    'MARK_VERIFIED ' +
      objectName +
      ' updated=' +
      updatedByObject.get(objectName) +
      ' total=' +
      totalByObject.get(objectName)
  );
}
