/**
 * Gives a Public_Key__c to every row that has none, on the 13 objects the portfolio API
 * exposes (ADR-038). The owner runs this ONCE against production, after the deploy that adds
 * the field and PublicKeyService. Nothing here runs by itself. An agent never runs it.
 *
 * Run it:
 *   sf apex run --file scripts/backfill-public-keys.apex --target-org spap-portfolio
 *
 * It fills up to 200 rows per object per pass and up to 5 passes per object, so one run covers
 * 1,000 rows per object. It reads and counts a few times per object, and it stops by itself
 * when the query limit gets close, so run it again if the log says it stopped early. It stops an object early
 * when a pass finds nothing left. The portfolio holds well under 1,000 rows of each object, so
 * one run is expected to finish. If the log still shows rows left, run it again. It is safe to
 * run twice, because a row that has a key is never touched and a key is never changed.
 *
 * How to check it worked (read only, run as anonymous Apex or in the Developer Console):
 *   SELECT COUNT() FROM Project__c WHERE Public_Key__c = null
 * The count must be 0 for every object. The script prints the same counts before and after,
 * one line per object, in the debug log (search the log for BACKFILL). The objects are
 * Account, Contact, Skill__c, Experience__c, Experience_Highlight__c, Experience_Skill__c,
 * Project__c, Project_Asset__c, Project_Skill__c, Certification__c, Certification_Skill__c,
 * Education__c and Testimonial__c.
 *
 * A key is never changed after it is set. If a row gets a wrong key, there is no undo here.
 * Ask before running it against anything but the production org it was written for.
 */
Integer batchSize = 200;
Integer maxPasses = 5;
Integer totalFilled = 0;

for (SObjectType objectType : PublicKeyService.OBJECT_TYPES) {
  // Leave room for the counts. If a run gets this far, it stops and says so. Run it again.
  if (Limits.getQueries() > Limits.getLimitQueries() - 20) {
    System.debug(
      LoggingLevel.INFO,
      'BACKFILL stopped before ' + objectType + ' to stay inside the query limit. Run it again.'
    );
    break;
  }
  String objectName = objectType.getDescribe().getName();
  Integer before = PublicKeyService.countBlank(objectType);
  Integer filled = 0;
  for (Integer pass = 0; pass < maxPasses && filled < before; pass++) {
    Integer count = PublicKeyService.backfill(objectType, batchSize);
    filled += count;
    if (count == 0) {
      break;
    }
  }
  totalFilled += filled;
  System.debug(
    LoggingLevel.INFO,
    'BACKFILL ' +
      objectName +
      ': blank before ' +
      before +
      ', filled ' +
      filled +
      ', blank after ' +
      PublicKeyService.countBlank(objectType)
  );
}
System.debug(LoggingLevel.INFO, 'BACKFILL total filled: ' + totalFilled);
