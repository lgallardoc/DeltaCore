SELECT COLNAME AS column_name,
       TYPENAME AS data_type,
       LENGTH AS length,
       SCALE AS scale
FROM SYSCAT.COLUMNS
WHERE TABSCHEMA = '{{schema}}'
  AND TABNAME IN ({{tables}})
ORDER BY TABNAME, COLNO;
