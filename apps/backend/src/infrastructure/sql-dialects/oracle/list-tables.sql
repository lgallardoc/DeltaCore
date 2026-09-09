SELECT OWNER AS schema_name,
       TABLE_NAME AS table_name,
       'T' AS table_type
FROM ALL_TABLES
WHERE ('{{tableName}}' = '' OR TABLE_NAME IN ({{tableList}}))
  AND ('{{limitToPath}}' = '0' OR OWNER IN ({{schemaList}}))
ORDER BY OWNER, TABLE_NAME;
