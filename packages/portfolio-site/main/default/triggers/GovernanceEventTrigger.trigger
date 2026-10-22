/**
 * @description       : Subscriber for Governance_Event__e. Routes every delivered batch to
 *                      GovernanceEventHandler, which stores the runs (Round 4 plan L11).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 * @Test Class        : [GovernanceEventHandlerTest]
 **/
trigger GovernanceEventTrigger on Governance_Event__e(after insert) {
  GovernanceEventHandler.handle(Trigger.new);
}
