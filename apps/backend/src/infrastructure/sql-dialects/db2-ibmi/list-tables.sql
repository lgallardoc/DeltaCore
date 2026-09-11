SELECT
       T.TABLE_SCHEMA AS schema_name,
       T.NAME AS table_name,
       T.TYPE AS table_type,
    COALESCE(TRIM(T.LABEL), '') AS table_description,
    COALESCE(S.NUMBER_ROWS, 0) AS row_count,
    QSYS2.DELIMIT_NAME(T.NAME) AS display_table_name,
    T.SYS_TNAME AS system_table_name,
    T.CREATOR AS owner_name,
    T.DEFINER AS definer_name,
    VARCHAR_FORMAT(T.ALTEREDTS, 'DD-MM-YYYY HH24:MI:SS') AS last_modified_at,
       CASE T.TEMPORAL_TYPE
           WHEN 'S' THEN 'Periodo de sistema'
           WHEN 'H' THEN 'Histórico'
           ELSE
               CASE T.TYPE
                   WHEN 'M' THEN 'Consulta materializada'
                   ELSE ''
               END
    END AS table_type_description,
       CASE T.PART_TABLE
           WHEN 'YES' THEN 'Sí'
           ELSE ''
    END AS is_partitioned,
       CASE P.VERSIONING_STATUS
           WHEN 'E' THEN 'Habilitado'
           WHEN 'D' THEN 'Definido'
           ELSE ''
    END AS historical_version_status,
       CASE
           WHEN T.LABEL IS NULL THEN ''
           ELSE TRIM(T.LABEL)
    END AS descriptive_text
    FROM QSYS2.SYSTABLES T
         LEFT OUTER JOIN QSYS2.SYSTABLESTAT S
             ON T.TABLE_SCHEMA = S.TABLE_SCHEMA AND T.NAME = S.TABLE_NAME AND T.TYPE IN ('T', 'P', 'M')
         LEFT OUTER JOIN QSYS2.SYSPERIODS P
             ON T.TABLE_SCHEMA = P.TABLE_SCHEMA AND T.NAME = P.TABLE_NAME AND T.TYPE IN ('T', 'P', 'M')
    WHERE T.TYPE IN ('T', 'P', 'M')
    AND (
        ('{{tablePattern}}' <> '' AND T.NAME LIKE '{{tablePattern}}')
        OR ('{{tablePattern}}' = '' AND ('{{tableName}}' = '' OR T.NAME IN ({{tableList}})))
    )
      AND ('{{limitToPath}}' = '0' OR T.TABLE_SCHEMA IN ({{schemaList}}))
    ORDER BY 1 ASC, 2 ASC
