SELECT ORDINAL_POSITION AS column_no,
       COLUMN_NAME AS column_name,
       DATA_TYPE AS data_type,
       LENGTH AS length,
       NUMERIC_SCALE AS scale,
       IS_NULLABLE AS nullable,
       COALESCE(
         NULLIF(TRIM(COLUMN_TEXT), ''),
         NULLIF(TRIM(COLUMN_HEADING), ''),
         ''
       ) AS description
FROM QSYS2.SYSCOLUMNS
WHERE TABLE_SCHEMA = '{{schema}}'
  AND TABLE_NAME = '{{tableName}}'
ORDER BY ORDINAL_POSITION;
