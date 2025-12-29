%dw 2.0
output application/java
---
{
    dataQuery: "SELECT Owner_Email__c, Owner_Phone__c, LinkedIn_URL__c, Calendly_URL__c, GitHub_Profile_URL__c, Career_Objective__c, Trailblazer_Profile_URL__c, Personal_Website_URL__c FROM Portfolio_Config__mdt LIMIT 1",
    countQuery: "SELECT COUNT() FROM Portfolio_Config__mdt"
}