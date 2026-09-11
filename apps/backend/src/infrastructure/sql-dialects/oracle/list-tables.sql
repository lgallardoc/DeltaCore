SELECT OWNER AS schema_name,
       TABLE_NAME AS table_name,
  'T' AS table_type,
  '' AS table_description,
  NUM_ROWS AS row_count
FROM ALL_TABLES
WHERE (
  ('{{tablePattern}}' <> '' AND TABLE_NAME LIKE '{{tablePattern}}')
  OR ('{{tablePattern}}' = '' AND ('{{tableName}}' = '' OR TABLE_NAME IN ({{tableList}})))
)
  AND ('{{limitToPath}}' = '0' OR OWNER IN ({{schemaList}}))
ORDER BY OWNER, TABLE_NAME;
