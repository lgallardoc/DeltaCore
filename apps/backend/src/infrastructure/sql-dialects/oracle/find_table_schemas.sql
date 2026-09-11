SELECT OWNER AS schema_name,
       TABLE_NAME AS table_name,
       'T' AS table_type,
       '' AS table_description,
       NUM_ROWS AS row_count
FROM ALL_TABLES
WHERE TABLE_NAME = '{{tableName}}'
  AND OWNER IN ({{schemaList}});
