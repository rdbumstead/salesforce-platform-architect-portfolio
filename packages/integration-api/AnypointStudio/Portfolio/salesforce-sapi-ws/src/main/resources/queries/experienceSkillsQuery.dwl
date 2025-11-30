%dw 2.0
output application/java
import * from modules::queryHelpers

var base = "SELECT Id, Experience__c, Skill__r.Name, Skill__r.Category__c FROM Experience_Skill__c"

var conditions = [
    if (!isBlank(vars.experienceId default '')) 
        "Experience__c = '" ++ escapeSOQL(vars.experienceId) ++ "'" 
    else null
] filter ($ != null)

---
base ++ whereIfAny(conditions) ++ " ORDER BY Skill__r.Category__c ASC" ++ limitAndOffset(vars.limit, vars.offset)