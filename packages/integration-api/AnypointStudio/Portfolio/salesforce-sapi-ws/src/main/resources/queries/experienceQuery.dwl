%dw 2.0
output application/java
import * from modules::queryHelpers
var contactName = vars.contactName default ''
var employerName = vars.employerName default ''
var currentlyEmployed = vars.currentlyEmployed
var conditions = [
    eqIfPresent("Contact__r.Name", contactName),
    if (!isBlank(employerName)) "(Employer__r.Name LIKE '" ++ escapeSoqlLike(employerName) ++ "%' OR Employer__r.Abbreviation__c = '" ++ escapeSoqlLiteral(employerName) ++ "')" else null,
    if (soqlBoolean(currentlyEmployed) != null) "Is_Current_Role__c = " ++ soqlBoolean(currentlyEmployed) else null
] filter ($ != null)
---
buildPagedQuery(
    "Id, Contact__r.Id, Contact__r.Name, Name, Employer__r.Id, Employer__r.Name, Start_Date__c, End_Date__c, Is_Current_Role__c, Is_Remote__c, Accomplishments__c, Sort_Order__c",
    "Experience__c",
    conditions,
    "ORDER BY Start_Date__c DESC",
    vars.limit,
    vars.offset
)