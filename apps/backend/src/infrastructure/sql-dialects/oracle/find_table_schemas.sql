SELECT OWNER AS schema_name
FROM ALL_TABLES
WHERE TABLE_NAME = '{{tableName}}'
  AND OWNER IN ({{schemaList}});
