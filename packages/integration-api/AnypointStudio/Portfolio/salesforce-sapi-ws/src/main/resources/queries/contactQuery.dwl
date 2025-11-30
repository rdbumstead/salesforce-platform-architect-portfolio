%dw 2.0
output application/java
import * from modules::queryHelpers

var base = "SELECT Id, Name, Email, Phone, Account.Name, Career_Objective__c, LinkedIn__c, Trailhead__c, Portfolio__c FROM Contact"
var conditions = [
    if (!isBlank(vars.contactName default '')) 
        "Name = '" ++ escapeSOQL(vars.contactName) ++ "'" 
    else null
] filter ($ != null)
---
base ++ whereIfAny(conditions) ++ " ORDER BY Name ASC"