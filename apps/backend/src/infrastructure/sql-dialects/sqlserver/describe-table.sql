SELECT c.ORDINAL_POSITION AS column_no,
       c.COLUMN_NAME AS column_name,
       c.DATA_TYPE AS data_type,
       c.CHARACTER_MAXIMUM_LENGTH AS length,
       c.NUMERIC_SCALE AS scale,
       c.IS_NULLABLE AS nullable,
       ISNULL(CONVERT(nvarchar(255), ep.value), '') AS description
FROM INFORMATION_SCHEMA.COLUMNS c
LEFT JOIN sys.extended_properties ep
  ON ep.major_id = OBJECT_ID(QUOTENAME(c.TABLE_SCHEMA) + '.' + QUOTENAME(c.TABLE_NAME))
 AND ep.minor_id = c.ORDINAL_POSITION
 AND ep.name = 'MS_Description'
WHERE c.TABLE_SCHEMA = '{{schema}}'
  AND c.TABLE_NAME = '{{tableName}}'
ORDER BY c.ORDINAL_POSITION;
