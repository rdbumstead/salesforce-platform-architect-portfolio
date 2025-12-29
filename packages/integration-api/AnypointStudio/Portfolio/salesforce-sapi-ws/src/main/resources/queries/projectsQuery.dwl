%dw 2.0
output application/java
import * from modules::queryHelpers
var status = vars.status default ''
var projectName = vars.projectName default ''
var isFeatured = vars.isFeatured
var contactName = vars.contactName default ''
var conditions = [
    eqIfPresent("Status__c", status),
    eqIfPresent("Name", projectName),
    if (soqlBoolean(isFeatured) != null) "Is_Featured__c = " ++ soqlBoolean(isFeatured) else null,
    eqIfPresent("Contact__r.Name", contactName)
] filter ($ != null)
---
buildPagedQuery(
    "Id, Name, Contact__r.Id, Contact__r.Name, Challenge__c, Solution__c, Business_Value__c, Status__c, Pillar__c, Hero_Image_URL__c, Live_URL__c, Repository_URL__c, Date_Completed__c, Is_Featured__c, Sort_Order__c",
    "Project__c",
    conditions,
    "ORDER BY Sort_Order__c ASC",
    vars.limit,
    vars.offset
)