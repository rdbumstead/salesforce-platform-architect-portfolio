%dw 2.0
output application/java
import * from modules::queryHelpers
var issuerName = vars.issuerName default ''
var contactName = vars.contactName default ''
var conditions = [
    eqIfPresent("Contact__r.Name", contactName),
    if (!isBlank(issuerName)) "(Issuer__r.Name LIKE '" ++ escapeSoqlLike(issuerName) ++ "%' OR Issuer__r.Abbreviation__c = '" ++ escapeSoqlLiteral(issuerName) ++ "')" else null
] filter ($ != null)
---
buildPagedQuery(
    "Id, Contact__r.Id, Contact__r.Name, Name, Issuer__r.Id, Issuer__r.Name, Earned_Date__c",
    "Certification__c",
    conditions,
    "ORDER BY Name ASC",
    vars.limit,
    vars.offset
)