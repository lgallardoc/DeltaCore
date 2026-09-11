SELECT COLUMN_NAME AS column_name,
       DATA_TYPE AS data_type,
       DATA_LENGTH AS length,
       DATA_SCALE AS scale
FROM ALL_TAB_COLUMNS
WHERE OWNER = '{{schema}}'
  AND TABLE_NAME IN ({{tables}})
ORDER BY TABLE_NAME, COLUMN_ID;
