%dw 2.0
/**
 * SOQL Query Utility Helpers
 * - All returned queries are SOQL-safe via escaping
 * - Inputs must be unescaped raw values
 * - LIMIT max is enforced at 200 to match API specifications
 * - Handles Multi-select Picklists via INCLUDES syntax (single or array)
 */

// Returns true if value is null, empty, or whitespace-only
fun isBlank(s) =
    s == null or s == "" or trim(s) == ""

// Escapes a string for SOQL string literals to prevent injection
fun escapeSoqlLiteral(s) =
    if (isBlank(s)) s
    else (
        s
            replace "\\" with "\\\\"
            replace "'" with "\\'"
    )

/**
 * Escapes a string for SOQL LIKE clauses including wildcards.
 * NOTE: Caller must append '%' manually to control wildcard placement.
 */
fun escapeSoqlLike(s) =
    if (isBlank(s)) s
    else (
        s
            replace "\\" with "\\\\"
            replace "'" with "\\'"
            replace "%" with "\\%"
            replace "_" with "\\_"
    )

// Formats boolean values specifically for SOQL syntax
// Returns null if the input is not a valid boolean or boolean-string
fun soqlBoolean(b) = 
    if (b == true or b == "true") "true" 
    else if (b == false or b == "false") "false" 
    else null

// Helper to generate an equality condition if a value is present
// Specifically for fields requiring single quotes (Strings, IDs, etc.)
fun eqIfPresent(field, value) =
    if (isBlank(value)) null
    else field ++ " = '" ++ escapeSoqlLiteral(value) ++ "'"

/**
 * Builds an INCLUDES condition for Multi-Select Picklists.
 * Accepts either a single string or an array of strings.
 * Returns null if input is empty/blank.
 * 
 * Examples:
 *   includesIfPresent("Persona_Tag__c", "Admin") 
 *     => "Persona_Tag__c INCLUDES ('Admin')"
 *   includesIfPresent("Persona_Tag__c", ["Admin", "Developer"]) 
 *     => "Persona_Tag__c INCLUDES ('Admin','Developer')"
 */
fun includesIfPresent(field, value) = do {
    var values = 
        if (value is String and !isBlank(value)) [value]
        else if (value is Array) value filter (!isBlank($))
        else []
    ---
    if (isEmpty(values)) null
    else field ++ " INCLUDES (" ++ 
         (values map ("'" ++ escapeSoqlLiteral($) ++ "'") joinBy ",") ++ 
         ")"
}

// Builds a WHERE clause only if there are valid conditions provided
fun whereIfAny(conditions) = do {
    var validConditions = conditions filter (!isBlank($))
    ---
    if (isEmpty(validConditions)) ""
    else " WHERE " ++ (validConditions joinBy " AND ")
}

// Hardened logic to handle numeric casting and limit enforcement
// Safe against non-string types to prevent .matches() runtime errors
fun limitAndOffset(l, o) = do {
    var limitValue = 
        if (l is Number) l 
        else if (l is String and (l matches /^\d+$/)) l as Number 
        else null
        
    var offsetValue = 
        if (o is Number) o 
        else if (o is String and (o matches /^\d+$/)) o as Number 
        else null
    ---
    (if (limitValue != null and limitValue > 0 and limitValue <= 200)
        " LIMIT " ++ limitValue
     else "") ++
    (if (offsetValue != null and offsetValue >= 0)
        " OFFSET " ++ offsetValue
     else "")
}

/**
 * Builds a standard pagination object containing data and count queries.
 * Spacing is handled defensively to prevent malformed queries.
 * NOTE: INCLUDES syntax for Multi-Select Picklists requires single quotes 
 * around the literal, which is why escapeSoqlLiteral is used for those fields.
 */
fun buildPagedQuery(selectFields, tableName, conditions, orderBy, l, o) = do {
    var whereClause = whereIfAny(conditions)
    ---
    {
        dataQuery: "SELECT " ++ selectFields ++ 
                   " FROM " ++ tableName ++ 
                   whereClause ++ 
                   (if (!isBlank(orderBy)) " " ++ orderBy else "") ++ 
                   limitAndOffset(l, o),
        countQuery: "SELECT COUNT() FROM " ++ tableName ++ whereClause
    }
}