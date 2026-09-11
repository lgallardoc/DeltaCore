SELECT TABLE_SCHEMA AS schema_name,
       TABLE_NAME AS table_name,
       TABLE_TYPE AS table_type,
       '' AS table_description,
       0 AS row_count
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_NAME = '{{tableName}}'
  AND TABLE_SCHEMA IN ({{schemaList}});
