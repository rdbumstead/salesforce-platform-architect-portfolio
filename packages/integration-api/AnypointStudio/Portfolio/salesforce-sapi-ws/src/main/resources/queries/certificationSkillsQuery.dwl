%dw 2.0
output application/java
import * from modules::queryHelpers

var base = "SELECT Id, Certification__c, Certification__r.Name, Skill__r.Name, Skill__r.Category__c FROM Certification_Skill__c"

var certificationId = vars.certificationId default ''
var certificationName = vars.certificationName default ''
var contactName = vars.contactName default ''

var conditions = [
    if (!isBlank(certificationId)) 
        "Certification__c = '" ++ escapeSOQL(certificationId) ++ "'" 
    else null,
    
    if (!isBlank(certificationName)) 
        "Certification__r.Name LIKE '" ++ escapeSOQL(certificationName) ++ "%'" 
    else null,
    
    if (!isBlank(contactName)) 
        "Certification__r.Contact__r.Name = '" ++ escapeSOQL(contactName) ++ "'" 
    else null
] filter ($ != null)

---
base ++ whereIfAny(conditions) ++ " ORDER BY Skill__r.Category__c ASC" ++ limitAndOffset(vars.limit, vars.offset)