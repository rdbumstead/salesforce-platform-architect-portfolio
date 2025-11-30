%dw 2.0
output application/java
import * from modules::queryHelpers

var base = "SELECT Id, Contact__r.Name, Name, Employer__r.Name, Start_Date__c, End_Date__c, Is_Current_Role__c, Is_Remote__c, Accomplishments__c, Sort_Order__c FROM Experience__c"
var currentEmp = vars.currentlyEmployed
var employerName = vars.employerName default ''

var conditions = [
    if (!isBlank(vars.contactName default '')) "Contact__r.Name = '" ++ escapeSOQL(vars.contactName) ++ "'" else null,
    if (!isBlank(employerName)) "(Employer__r.Name LIKE '" ++ escapeLike(escapeSOQL(employerName)) ++ "%' OR Employer__r.Abbreviation__c = '" ++ escapeSOQL(employerName) ++ "')" else null,
    if (currentEmp != null) "Is_Current_Role__c = " ++ currentEmp else null
] filter ($ != null)
---
base ++ whereIfAny(conditions) ++ " ORDER BY Start_Date__c DESC" ++ limitAndOffset(vars.limit, vars.offset)