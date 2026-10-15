CALL db.idx.fulltext.queryNodes('Document', $text)
YIELD node AS doc, score
RETURN count(DISTINCT doc) AS total