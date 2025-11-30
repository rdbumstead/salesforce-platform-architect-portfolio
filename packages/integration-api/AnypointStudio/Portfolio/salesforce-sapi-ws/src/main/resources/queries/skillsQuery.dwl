%dw 2.0
output application/java
import * from modules::queryHelpers

var base = "Select Id, Name, Display_Name__c, Category__c, Proficiency_Score__c, Color_Hex__c, SVG_Path_Data__c FROM Skill__c"

var conditions = [
    // if (!isBlank(vars.contactName default '')) 
    //     "Contact__r.Name = '" ++ escapeSOQL(vars.contactName) ++ "'" 
    // else null,
    
    // if (!isBlank(vars.category)) 
    //     "Category__c = '" ++ escapeSOQL(vars.category) ++ "'" 
    // else null
] filter ($ != null)

---
base ++ whereIfAny(conditions) ++ " ORDER BY Category__c ASC, Proficiency_Score__c DESC"