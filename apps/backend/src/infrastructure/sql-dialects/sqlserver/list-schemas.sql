SELECT name AS schema_name
FROM sys.schemas
WHERE name IN ({{schemaList}})
ORDER BY name;
