SELECT s.name AS schema_name,
       t.name AS table_name,
  'T' AS table_type,
  '' AS table_description,
  SUM(p.rows) AS row_count
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
WHERE (
  ('{{tablePattern}}' <> '' AND t.name LIKE '{{tablePattern}}')
  OR ('{{tablePattern}}' = '' AND ('{{tableName}}' = '' OR t.name IN ({{tableList}})))
)
  AND ('{{limitToPath}}' = '0' OR s.name IN ({{schemaList}}))
GROUP BY s.name, t.name
ORDER BY s.name, t.name;
