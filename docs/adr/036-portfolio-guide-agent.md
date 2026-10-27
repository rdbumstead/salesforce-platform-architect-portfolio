# ADR-036: The Portfolio Guide Agent, in Source and Not Live

## Status

Accepted (2026-10-27). Checked against the merged metadata: the bot, the planner bundle, the topics and functions, `PortfolioAgentCareer`, `PortfolioAgentProjects`, `PortfolioAgentCredentials`, `PortfolioAgentText` and the `Portfolio_Guide_Agent_Actions` permission set.

## Context

A January prototype of `Portfolio_Guide_Agent` lived only in the production org. It held six topics, one of which told the agent to give `Owner_Email__c`, and its action ran `PortfolioAgentService`, which only the admin profile could run, so the agent user could not have used it. None of it was in source, so none of it could be reviewed, tested or deployed with the rest of the site.

## Decision

**Put a rebuilt agent in source, read only, and ship it to production inactive at the owner's word.**

- **Shape.** A classic Bot (`Portfolio_Guide_Agent`, agent type `EinsteinServiceAgent`) with a `GenAiPlannerBundle` using the ReAct planner. No agent user is named in source (`botUser` is absent), so the owner assigns one in Setup.
- **Four topics.** Career and Experience, Projects and Case Studies, Skills and Certifications, and Contacting Ryan. The last has no action. It points the visitor to the site's contact page and gives no email or phone.
- **Three read only invocable actions.** `PortfolioAgentCareer`, `PortfolioAgentProjects` and `PortfolioAgentCredentials`. Each reads only through `QueryDefinitions` (five `Query_Definition__mdt` records equal to their code defaults, ADR-033) in system mode and returns JSON the agent reads. `PortfolioAgentText.clean` removes email and phone shapes from every text, no Contact is read, and no client name is returned.
- **The January topics are replaced.** The six prototype topics, including the one that told the agent to give `Owner_Email__c`, are replaced by the planner's four. The two January prompt templates (`Portfolio_Architect_Response`, `Contact_Record_Summary`) stay out of source and are not used. The owner deactivates them in Setup.
- **API 65.0.** The agent metadata types need API version 65.0 (at 64.0 the topics fail with "sortOrder not valid in version 64.0"), so `sourceApiVersion` in `sfdx-project.json` is now 65.0. The whole project deployed at 65.0 to a scratch org.
- **A permission set for the actions.** `Portfolio_Guide_Agent_Actions` grants class access to the three actions and nothing else, because the actions read in system mode and need no object access. The owner assigns it to the agent's user.
- **Shipped inactive, and not on the site.** The agent deploys to production with the rest of the metadata and stays inactive. No page embeds it and no Messaging channel or deployment is built. Activating it is the owner's decision.

## Alternatives considered

| Option                                         | Why not                                                                                      |
| :--------------------------------------------- | :------------------------------------------------------------------------------------------- |
| Leave the prototype in the production org only | It could not be reviewed or tested, and it carried an instruction to give the owner's email. |
| Keep `PortfolioAgentService` as the one action | It is a single wide read, and only the admin profile could run it.                           |
| Give the agent a Contact record snapshot       | A snapshot hands the model every Contact field, email and phone included.                    |

## Implications

- **A deploy over an active agent fails.** Salesforce refuses to edit an active bot version ("Can't edit an active bot version"), and the deploy rolls back. The production agent is inactive, so deploys pass today. Once the owner activates it, every deploy that holds the agent fails until it is deactivated, so the deploy flow needs a deactivation step before any activation.
- **Tested in a scratch org.** `sf agent test run` of four cases (12 of 12 topic, action and output checks) passed on 2026-10-27. Each topic routed to its action, and the contact question gave no email or phone. A run right after activation had two "technical issue" answers, so a freshly activated agent may need a short settle. This was not run in production.
- **Not measured or claimed in production.** The agent's user, its licences and the Agent Builder preview are the owner's checks after the deploy (assign the permission set, keep the agent user permission set group, test the four questions).
- **The records are the source of truth.** An answer can only repeat what the records hold. The topics forbid adding benefits the records do not state.
- **Related decisions.** [ADR-033](033-queries-in-custom-metadata.md) governs the reads. [ADR-015](015-strategy-pattern-for-generative-ai.md) covers the separate Prompt Builder template the cover letters use.
