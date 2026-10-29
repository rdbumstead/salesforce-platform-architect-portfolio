/**
 * @description       : Gives every new Experience__c record its stable public key and refuses a
 *                      change to a key once set (ADR-038).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/28/2026
 * @Test Class        : [PublicKeyServiceTest]
 **/
trigger ExperiencePublicKeyTrigger on Experience__c(
  before insert,
  before update
) {
  if (Trigger.isInsert) {
    PublicKeyService.assign(Trigger.new);
  } else {
    PublicKeyService.refuseChange(Trigger.new, Trigger.oldMap);
  }
}
