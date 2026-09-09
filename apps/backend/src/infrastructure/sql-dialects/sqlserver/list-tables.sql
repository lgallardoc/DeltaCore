SELECT s.name AS schema_name,
       t.name AS table_name,
       'T' AS table_type
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
WHERE ('{{tableName}}' = '' OR t.name IN ({{tableList}}))
  AND ('{{limitToPath}}' = '0' OR s.name IN ({{schemaList}}))
ORDER BY s.name, t.name;
