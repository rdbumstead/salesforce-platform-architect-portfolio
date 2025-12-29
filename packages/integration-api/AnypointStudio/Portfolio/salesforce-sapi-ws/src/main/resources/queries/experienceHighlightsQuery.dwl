%dw 2.0
output application/java
import * from modules::queryHelpers

var experienceId = vars.experienceId default ''
var persona = vars.persona default ''

var conditions = [
    eqIfPresent("Experience__r.Id", experienceId),
    includesIfPresent("Persona_Tag__c", persona)
] filter ($ != null)
---
buildPagedQuery(
    "Id, Name, Experience__r.Id, Experience__r.Name, Persona_Tag__c, Sort_Order__c, Description__c",
    "Experience_Highlight__c",
    conditions,
    "ORDER BY Sort_Order__c ASC",
    vars.limit,
    vars.offset
)