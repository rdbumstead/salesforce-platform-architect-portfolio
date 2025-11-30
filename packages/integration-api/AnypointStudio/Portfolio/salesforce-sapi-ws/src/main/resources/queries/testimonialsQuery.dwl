%dw 2.0
output application/java
import * from modules::queryHelpers

var base = "SELECT Id, Name, Author_Name__c, Author_Title__c, Avatar_URL__c, Vibe_Mode__c, Relationship_Type__c FROM Testimonial__c"
// Always filter by Approved = true for public API
var conditions = ["Approved__c = true"] 
---
base ++ whereIfAny(conditions) ++ " ORDER BY Sort_Order__c ASC" ++ limitAndOffset(vars.limit, vars.offset)