%dw 2.0
output application/java
import * from modules::queryHelpers
var base = "SELECT Id, Project__c, Skill__r.Name, Skill__r.Category__c FROM Project_Skill__c"
var conditions = [ if (!isBlank(vars.projectId default '')) "Project__c = '" ++ escapeSOQL(vars.projectId) ++ "'" else null ] filter ($ != null)
---
base ++ whereIfAny(conditions) ++ limitAndOffset(vars.limit, vars.offset)