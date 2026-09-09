SELECT COLNO AS column_no,
       COLNAME AS column_name,
       TYPENAME AS data_type,
       LENGTH AS length,
       SCALE AS scale,
       NULLS AS nullable,
       COALESCE(REMARKS, '') AS description
FROM SYSCAT.COLUMNS
WHERE TABSCHEMA = '{{schema}}'
  AND TABNAME = '{{tableName}}'
ORDER BY COLNO;
