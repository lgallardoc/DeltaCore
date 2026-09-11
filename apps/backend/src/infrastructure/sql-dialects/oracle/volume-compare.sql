SELECT '{{patternId}}' AS pattern_id, COUNT(*) AS row_count, 0 AS data_size
FROM {{qualifiedTable}};
