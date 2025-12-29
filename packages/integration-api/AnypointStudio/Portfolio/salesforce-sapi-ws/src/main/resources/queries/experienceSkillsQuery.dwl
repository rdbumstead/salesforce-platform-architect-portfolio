%dw 2.0
output application/java
import * from modules::queryHelpers
var experienceId = vars.experienceId default ''
var conditions = [
    eqIfPresent("Experience__r.Id", experienceId)
] filter ($ != null)
---
buildPagedQuery(
    "Id, Experience__r.Id, Experience__r.Name, Skill__r.Id, Skill__r.Name, Skill__r.Category__c, Skill__r.Proficiency_Score__c",
    "Experience_Skill__c",
    conditions,
    "ORDER BY Skill__r.Category__c ASC",
    vars.limit,
    vars.offset
)