SELECT TABSCHEMA AS schema_name,
       TABNAME AS table_name,
       TYPE AS table_type,
       COALESCE(REMARKS, '') AS table_description,
       COALESCE(CARD, 0) AS row_count
FROM SYSCAT.TABLES
WHERE TABNAME = '{{tableName}}'
  AND TABSCHEMA IN ({{schemaList}});
