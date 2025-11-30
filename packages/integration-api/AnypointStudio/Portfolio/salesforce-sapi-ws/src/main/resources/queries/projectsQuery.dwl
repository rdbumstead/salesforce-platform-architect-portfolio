%dw 2.0
output application/java
import * from modules::queryHelpers

var base = "SELECT Id, Name, Challenge__c, Solution__c, Business_Value__c, Status__c, Pillar__c, Hero_Image_URL__c, Live_URL__c, Repository_URL__c, Date_Completed__c FROM Project__c"
var conditions = [
    if (!isBlank(vars.status default '')) "Status__c = '" ++ escapeSOQL(vars.status) ++ "'" else null,
    if (!isBlank(vars.id default '')) "Id = '" ++ escapeSOQL(vars.id) ++ "'" else null
] filter ($ != null)
---
base ++ whereIfAny(conditions) ++ " ORDER BY Sort_Order__c ASC" ++ limitAndOffset(vars.limit, vars.offset)