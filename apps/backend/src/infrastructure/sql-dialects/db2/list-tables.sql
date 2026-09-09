SELECT TABSCHEMA AS schema_name,
       TABNAME AS table_name,
       TYPE AS table_type
FROM SYSCAT.TABLES
WHERE TYPE = 'T'
  AND ('{{tableName}}' = '' OR TABNAME IN ({{tableList}}))
  AND ('{{limitToPath}}' = '0' OR TABSCHEMA IN ({{schemaList}}))
ORDER BY TABSCHEMA, TABNAME;
