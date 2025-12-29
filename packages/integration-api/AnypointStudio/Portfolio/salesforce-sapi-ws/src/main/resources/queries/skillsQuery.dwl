%dw 2.0
output application/java
import * from modules::queryHelpers
var category = vars.category default ''
var conditions = [
    eqIfPresent("Category__c", category)
] filter ($ != null)
---
buildPagedQuery(
    "Id, Name, Display_Name__c, Category__c, Proficiency_Score__c, Color_Hex__c, SVG_Path_Data__c, Icon_Name__c",
    "Skill__c",
    conditions,
    "ORDER BY Category__c ASC, Proficiency_Score__c DESC",
    vars.limit,
    vars.offset
)