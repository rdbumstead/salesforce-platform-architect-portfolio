%dw 2.0
output application/java
import * from modules::queryHelpers
var projectId = vars.projectId default ''
var conditions = [
    eqIfPresent("Project__r.Id", projectId)
] filter ($ != null)
---
buildPagedQuery(
    "Id, Project__r.Id, Project__r.Name, Skill__r.Id, Skill__r.Name, Skill__r.Category__c, Skill__r.Proficiency_Score__c",
    "Project_Skill__c",
    conditions,
    "ORDER BY Skill__r.Category__c ASC, Skill__r.Name ASC",
    vars.limit,
    vars.offset
)