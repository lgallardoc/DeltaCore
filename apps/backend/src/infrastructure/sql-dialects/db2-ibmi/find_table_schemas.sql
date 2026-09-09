/*************************************************************************************************
 * IBM i 7.4+ / Db2 for i (QSYS2). Loaded when DB2_CATALOG=ibmi.
 * Lab Docker Db2 LUW uses sql-dialects/db2/find_table_schemas.sql (SYSCAT).
 *
 * SchemaResolver requires a column alias schema_name (winning *LIBL* schema).
 *************************************************************************************************/

SELECT
    T.TABLE_SCHEMA AS schema_name,
    T.TABLE_SCHEMA AS "Esquema",
    QSYS2.DELIMIT_NAME(T.NAME) AS "Nombre Tabla",
    T.SYS_TNAME AS "Nombre Sistema",
    T.CREATOR AS "Propietario",
    T.DEFINER AS "Definidor",
    COALESCE(NULLIF(TRIM(T.LABEL), ''), 'Sin Descripción') AS "Texto Descriptivo",
    CASE T.TEMPORAL_TYPE
        WHEN 'S' THEN 'Periodo de sistema'
        WHEN 'H' THEN 'Histórico'
        ELSE CASE T.TYPE
                 WHEN 'M' THEN 'Consulta materializada (MQT)'
                 WHEN 'P' THEN 'Particionada'
                 WHEN 'T' THEN 'Tabla Estándar'
                 ELSE T.TYPE
             END
    END AS "Tipo Tabla",
    CASE T.PART_TABLE
        WHEN 'YES' THEN 'Sí'
        ELSE 'No'
    END AS "Particionada",
    CASE P.VERSIONING_STATUS
        WHEN 'E' THEN 'Habilitado'
        WHEN 'D' THEN 'Definido'
        ELSE 'No aplica'
    END AS "Versión Histórica",
    DECIMAL(ROUND(FLOAT(COALESCE(S.DATA_SIZE, 0)) / 1024 / 1024, 2), 15, 2) AS "Tamaño (MB)",
    DECIMAL(ROUND(FLOAT(COALESCE(S.DATA_SIZE, 0)) / 1024 / 1024 / 1024, 2), 15, 2) AS "Tamaño (GB)",
    TRIM(VARCHAR_FORMAT(COALESCE(S.DATA_SIZE, 0), '999G999G999G999G999G999G999G999')) AS "Tamaño (Bytes)",
    TRIM(VARCHAR_FORMAT(COALESCE(S.NUMBER_ROWS, 0), '999G999G999G999G999G999G999G999')) AS "Filas Activas",
    TRIM(VARCHAR_FORMAT(COALESCE(S.NUMBER_DELETED_ROWS, 0), '999G999G999G999G999G999G999G999')) AS "Filas Suprimidas",
    TRIM(VARCHAR_FORMAT(COALESCE(S.NUMBER_PARTITIONS, 0), '999G999G999G999G999G999G999G999')) AS "Cantidad Particiones",
    VARCHAR_FORMAT(T.ALTEREDTS, 'DD-MM-YYYY HH24:MI:SS') AS "Última Modificación Def",
    VARCHAR_FORMAT(S.LAST_CHANGE_TIMESTAMP, 'DD-MM-YYYY HH24:MI:SS') AS "Último Cambio Datos",
    VARCHAR_FORMAT(S.LAST_USED_TIMESTAMP, 'DD-MM-YYYY') AS "Última Utilización",
    TRIM(VARCHAR_FORMAT(COALESCE(S.DAYS_USED_COUNT, 0), '999G999G999G999G999G999G999G999')) AS "Días Utilizado",
    VARCHAR_FORMAT(S.LAST_RESET_TIMESTAMP, 'DD-MM-YYYY HH24:MI:SS') AS "Fecha Reset Días Uso",
    VARCHAR_FORMAT(M.LQU, 'DD-MM-YYYY HH24:MI:SS') AS "Último Uso Consulta",
    VARCHAR_FORMAT(M.LSU, 'DD-MM-YYYY HH24:MI:SS') AS "Último Uso Estadísticas",
    TRIM(VARCHAR_FORMAT(COALESCE(M.QUC, 0), '999G999G999G999G999G999G999G999')) AS "Cuenta Uso Consulta",
    TRIM(VARCHAR_FORMAT(COALESCE(M.QSC, 0), '999G999G999G999G999G999G999G999')) AS "Cuenta Uso Estadísticas"
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
