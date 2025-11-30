%dw 2.0
output application/java
import * from modules::queryHelpers

var base = "Select Id, Contact__r.Name, Name, Issuer__r.Name, Field_of_Study__c, GPA__c, Graduation_Date__c FROM Education__c"
var issuerName = vars.issuerName default ''

var conditions = [
    if (!isBlank(vars.contactName default '')) 
        "Contact__r.Name = '" ++ escapeSOQL(vars.contactName) ++ "'" 
    else null,
    
    if (!isBlank(issuerName)) 
        "(Issuer__r.Name LIKE '" ++ escapeLike(escapeSOQL(issuerName)) ++ "%' OR Issuer__r.Abbreviation__c = '" ++ escapeSOQL(issuerName) ++ "')" 
    else null
] filter ($ != null)
---
base ++ whereIfAny(conditions) ++ " ORDER BY Name ASC"