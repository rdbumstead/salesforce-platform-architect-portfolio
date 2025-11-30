%dw 2.0
output application/java
import * from modules::queryHelpers

var base = "Select Name, Type, BillingState, BillingCountry FROM Account"
var accountName = vars.accountName default ''

var conditions = [
    if (!isBlank(accountName)) 
        "(Name LIKE '" ++ escapeLike(escapeSOQL(accountName)) ++ "%' OR Abbreviation__c = '" ++ escapeSOQL(accountName) ++ "')" 
    else null
] filter ($ != null)
---
base ++ whereIfAny(conditions) ++ " ORDER BY Name ASC"