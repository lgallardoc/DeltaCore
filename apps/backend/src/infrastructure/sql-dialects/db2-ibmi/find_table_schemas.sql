/*************************************************************************************************
 * IBM i 7.4+ / Db2 for i (QSYS2). Loaded when DB2_CATALOG=ibmi.
 * Lab Docker Db2 LUW uses sql-dialects/db2/find_table_schemas.sql (SYSCAT).
 *
 * SchemaResolver requires a column alias schema_name (winning *LIBL* schema).
 *************************************************************************************************/

SELECT
    T.TABLE_SCHEMA AS schema_name,
    T.NAME AS table_name,
    T.TYPE AS table_type,
    COALESCE(TRIM(T.LABEL), '') AS table_description,
    COALESCE(S.NUMBER_ROWS, 0) AS row_count,
    T.TABLE_SCHEMA AS display_schema,
    QSYS2.DELIMIT_NAME(T.NAME) AS display_table_name,
    T.SYS_TNAME AS system_table_name,
    T.CREATOR AS owner_name,
    T.DEFINER AS definer_name,
    COALESCE(NULLIF(TRIM(T.LABEL), ''), 'Sin Descripción') AS descriptive_text,
    CASE T.TEMPORAL_TYPE
        WHEN 'S' THEN 'Periodo de sistema'
        WHEN 'H' THEN 'Histórico'
        ELSE CASE T.TYPE
                 WHEN 'M' THEN 'Consulta materializada (MQT)'
                 WHEN 'P' THEN 'Particionada'
                 WHEN 'T' THEN 'Tabla Estándar'
                 ELSE T.TYPE
             END
    END AS table_type_description,
    CASE T.PART_TABLE
        WHEN 'YES' THEN 'Sí'
        ELSE 'No'
    END AS is_partitioned,
    CASE P.VERSIONING_STATUS
        WHEN 'E' THEN 'Habilitado'
        WHEN 'D' THEN 'Definido'
        ELSE 'No aplica'
    END AS historical_version_status,
    DECIMAL(ROUND(FLOAT(COALESCE(S.DATA_SIZE, 0)) / 1024 / 1024, 2), 15, 2) AS data_size_mb,
    DECIMAL(ROUND(FLOAT(COALESCE(S.DATA_SIZE, 0)) / 1024 / 1024 / 1024, 2), 15, 2) AS data_size_gb,
    TRIM(VARCHAR_FORMAT(COALESCE(S.DATA_SIZE, 0), '999G999G999G999G999G999G999G999')) AS data_size_bytes,
    TRIM(VARCHAR_FORMAT(COALESCE(S.NUMBER_ROWS, 0), '999G999G999G999G999G999G999G999')) AS active_row_count,
    TRIM(VARCHAR_FORMAT(COALESCE(S.NUMBER_DELETED_ROWS, 0), '999G999G999G999G999G999G999G999')) AS deleted_row_count,
    TRIM(VARCHAR_FORMAT(COALESCE(S.NUMBER_PARTITIONS, 0), '999G999G999G999G999G999G999G999')) AS partition_count,
    VARCHAR_FORMAT(T.ALTEREDTS, 'DD-MM-YYYY HH24:MI:SS') AS definition_last_modified,
    VARCHAR_FORMAT(S.LAST_CHANGE_TIMESTAMP, 'DD-MM-YYYY HH24:MI:SS') AS data_last_changed,
    VARCHAR_FORMAT(S.LAST_USED_TIMESTAMP, 'DD-MM-YYYY') AS last_used_date,
    TRIM(VARCHAR_FORMAT(COALESCE(S.DAYS_USED_COUNT, 0), '999G999G999G999G999G999G999G999')) AS days_used_count,
    VARCHAR_FORMAT(S.LAST_RESET_TIMESTAMP, 'DD-MM-YYYY HH24:MI:SS') AS days_used_reset_at,
    VARCHAR_FORMAT(M.LQU, 'DD-MM-YYYY HH24:MI:SS') AS last_query_used_at,
    VARCHAR_FORMAT(M.LSU, 'DD-MM-YYYY HH24:MI:SS') AS last_statistics_used_at,
    TRIM(VARCHAR_FORMAT(COALESCE(M.QUC, 0), '999G999G999G999G999G999G999G999')) AS query_use_count,
    TRIM(VARCHAR_FORMAT(COALESCE(M.QSC, 0), '999G999G999G999G999G999G999G999')) AS query_statistics_count
FROM QSYS2.SYSTABLES T
LEFT OUTER JOIN QSYS2.SYSTABLESTAT S
    ON T.TABLE_SCHEMA = S.TABLE_SCHEMA
   AND T.NAME = S.TABLE_NAME
   AND T.TYPE IN ('T', 'P', 'M')
LEFT OUTER JOIN QSYS2.SYSPERIODS P
    ON T.TABLE_SCHEMA = P.TABLE_SCHEMA
   AND T.NAME = P.TABLE_NAME
   AND T.TYPE IN ('T', 'P', 'M')
LEFT OUTER JOIN LATERAL (
    SELECT
        X.MQT_SCHEMA,
        X.MQT_NAME,
        MAX(X.LAST_QUERY_USE) AS LQU,
        MAX(X.LAST_STATISTICS_USE) AS LSU,
        SUM(X.QUERY_USE_COUNT) AS QUC,
        SUM(X.QUERY_STATISTICS_COUNT) AS QSC
    FROM QSYS2.SYSMQTSTAT X
    WHERE T.TYPE = 'M'
      AND X.MQT_SCHEMA = T.TABLE_SCHEMA
      AND X.MQT_NAME = T.NAME
    GROUP BY X.MQT_SCHEMA, X.MQT_NAME
) AS M
    ON T.TABLE_SCHEMA = M.MQT_SCHEMA
   AND T.NAME = M.MQT_NAME
WHERE T.TYPE IN ('T', 'P', 'M')
  AND T.TABLE_SCHEMA IN ({{schemaList}})
  AND T.NAME = '{{tableName}}'
  AND T.TABLE_SCHEMA NOT LIKE 'Q%'
  AND T.TABLE_SCHEMA NOT LIKE 'SYS%'
  AND T.TABLE_SCHEMA NOT IN ('SYSIBM', 'SYSIBMADM', 'SYSFUN', 'SYSPROC', 'SYSIBMTS')
ORDER BY T.TABLE_SCHEMA ASC, S.DATA_SIZE DESC
WITH UR;
