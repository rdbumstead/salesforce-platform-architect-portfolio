%dw 2.0
output application/java
import * from modules::queryHelpers
var projectId = vars.projectId default ''
var conditions = [
    eqIfPresent("Project__r.Id", projectId)
] filter ($ != null)
---
buildPagedQuery(
    "Id, Name, Project__r.Id, Project__r.Name, External_URL__c, Type__c, Sort_Order__c, Alt_Text__c",
    "Project_Asset__c",
    conditions,
    "ORDER BY Sort_Order__c ASC",
    vars.limit,
    vars.offset
)