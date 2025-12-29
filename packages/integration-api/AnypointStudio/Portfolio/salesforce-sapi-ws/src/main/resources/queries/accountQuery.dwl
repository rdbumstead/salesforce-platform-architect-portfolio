%dw 2.0
output application/java
import * from modules::queryHelpers
var accountName = vars.accountName default ''
var conditions = [
    if (!isBlank(accountName)) "(Name LIKE '" ++ escapeSoqlLike(accountName) ++ "%' OR Abbreviation__c = '" ++ escapeSoqlLiteral(accountName) ++ "')" else null
] filter ($ != null)
---
buildPagedQuery(
    "Id, Name, Abbreviation__c, Industry",
    "Account",
    conditions,
    "ORDER BY Name ASC",
    vars.limit,
    vars.offset
)