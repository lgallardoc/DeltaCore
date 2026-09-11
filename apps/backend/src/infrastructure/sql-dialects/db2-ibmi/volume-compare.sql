SELECT '{{patternId}}' AS pattern_id,
			 COUNT(*) AS row_count,
			 COALESCE((
				 SELECT S.DATA_SIZE
				 FROM QSYS2.SYSTABLESTAT S
				 WHERE S.TABLE_SCHEMA = '{{schema}}'
					 AND S.TABLE_NAME = '{{tableName}}'
			 ), 0) AS data_size
FROM {{qualifiedTable}};
