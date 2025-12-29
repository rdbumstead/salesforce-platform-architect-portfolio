%dw 2.0
output application/java
import * from modules::queryHelpers
var conditions = ["Approved__c = true"]
---
buildPagedQuery(
    "Id, Name, Author_Name__c, Author_Title__c, Avatar_URL__c, Vibe_Mode__c, Relationship_Type__c, Approved__c, Context__c",
    "Testimonial__c",
    conditions,
    "ORDER BY Sort_Order__c ASC",
    vars.limit,
    vars.offset
)