%dw 2.0

fun escapeSOQL(s) =
    s replace /'/ with "\\'"

fun escapeLike(s) =
    (s replace /%/ with "\\%" replace /_/ with "\\_")

fun whereIfAny(list) =
    if (isEmpty(list)) ""
    else " WHERE " ++ (list joinBy " AND ")

fun limitAndOffset(l, o) =
    (if (l != null and l > 0) " LIMIT " ++ l else "") ++
    (if (o != null and o >= 0) " OFFSET " ++ o else "")