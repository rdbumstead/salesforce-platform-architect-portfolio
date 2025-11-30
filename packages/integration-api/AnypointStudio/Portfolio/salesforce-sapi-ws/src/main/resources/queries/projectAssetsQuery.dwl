%dw 2.0
output application/java
import * from modules::queryHelpers

var base = "SELECT Id, Name, External_URL__c, Type__c, Sort_Order__c FROM Project_Asset__c"
var conditions = [
    if (!isBlank(vars.projectId default '')) 
        "Project__c = '" ++ escapeSOQL(vars.projectId) ++ "'" 
    else null
] filter ($ != null)
---
base ++ whereIfAny(conditions) ++ " ORDER BY Sort_Order__c ASC"