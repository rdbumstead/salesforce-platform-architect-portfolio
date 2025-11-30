%dw 2.0
output application/java
var base = "SELECT Owner_Email__c, Owner_Phone__c, LinkedIn_URL__c, Calendly_URL__c, GitHub_Profile_URL__c, Career_Objective__c FROM Portfolio_Config__mdt"
---
base ++ " LIMIT 1"