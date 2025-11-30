%dw 2.0
output application/java
import * from modules::queryHelpers

var base = "SELECT Id, Name, Experience__c, Persona_Tag__c, Sort_Order__c FROM Experience_Highlight__c"
var conditions = [
    if (!isBlank(vars.experienceId default '')) "Experience__c = '" ++ escapeSOQL(vars.experienceId) ++ "'" else null,
    // Note: Persona_Tag__c is a Multi-Picklist. SOQL requires 'INCLUDES'
    if (!isBlank(vars.persona default '')) "Persona_Tag__c INCLUDES ('" ++ escapeSOQL(vars.persona) ++ "')" else null
] filter ($ != null)
---
base ++ whereIfAny(conditions) ++ " ORDER BY Sort_Order__c ASC"