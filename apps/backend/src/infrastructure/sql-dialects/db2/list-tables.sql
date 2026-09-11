SELECT TABSCHEMA AS schema_name,
       TABNAME AS table_name,
  TYPE AS table_type,
  COALESCE(REMARKS, '') AS table_description,
  COALESCE(CARD, 0) AS row_count
FROM SYSCAT.TABLES
WHERE TYPE = 'T'
  AND (
    ('{{tablePattern}}' <> '' AND TABNAME LIKE '{{tablePattern}}')
    OR ('{{tablePattern}}' = '' AND ('{{tableName}}' = '' OR TABNAME IN ({{tableList}})))
  )
  AND ('{{limitToPath}}' = '0' OR TABSCHEMA IN ({{schemaList}}))
ORDER BY TABSCHEMA, TABNAME;
