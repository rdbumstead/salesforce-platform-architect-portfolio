%dw 2.0
output application/java
import * from modules::queryHelpers
var contactName = vars.contactName default ''
var conditions = [
    eqIfPresent("Name", contactName)
] filter ($ != null)
---
buildPagedQuery(
    "Id, Name, Email, Phone, Account.Id, Account.Name, Title, Career_Objective__c, LinkedIn__c, Trailhead__c, Portfolio__c",
    "Contact",
    conditions,
    "ORDER BY Name ASC",
    vars.limit,
    vars.offset
)