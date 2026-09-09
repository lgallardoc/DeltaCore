SELECT c.COLUMN_ID AS column_no,
       c.COLUMN_NAME AS column_name,
       c.DATA_TYPE AS data_type,
       c.DATA_LENGTH AS length,
       c.DATA_SCALE AS scale,
       c.NULLABLE AS nullable,
       COALESCE(cc.COMMENTS, '') AS description
FROM ALL_TAB_COLUMNS c
LEFT JOIN ALL_COL_COMMENTS cc
  ON cc.OWNER = c.OWNER
 AND cc.TABLE_NAME = c.TABLE_NAME
 AND cc.COLUMN_NAME = c.COLUMN_NAME
WHERE c.OWNER = '{{schema}}'
  AND c.TABLE_NAME = '{{tableName}}'
ORDER BY c.COLUMN_ID;
