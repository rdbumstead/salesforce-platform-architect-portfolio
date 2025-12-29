%dw 2.0
output application/java
import * from modules::queryHelpers
var certificationId = vars.certificationId default ''
var certificationName = vars.certificationName default ''
var contactName = vars.contactName default ''
var conditions = [
    eqIfPresent("Certification__c", certificationId),
    if (!isBlank(certificationName)) "Certification__r.Name LIKE '" ++ escapeSoqlLike(certificationName) ++ "%'" else null,
    eqIfPresent("Certification__r.Contact__r.Name", contactName)
] filter ($ != null)
---
buildPagedQuery(
    "Id, Certification__r.Id, Certification__r.Name, Skill__r.Id, Skill__r.Name, Skill__r.Category__c, Skill__r.Proficiency_Score__c",
    "Certification_Skill__c",
    conditions,
    "ORDER BY Skill__r.Category__c ASC",
    vars.limit,
    vars.offset
)