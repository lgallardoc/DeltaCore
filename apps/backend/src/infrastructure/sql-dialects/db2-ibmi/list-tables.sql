SELECT
       T.TABLE_SCHEMA AS schema_name,
       T.NAME AS table_name,
       T.TYPE AS table_type,
       QSYS2.DELIMIT_NAME(T.NAME) AS "Nombre",
       T.SYS_TNAME AS "Nombre de sistema",
       T.CREATOR AS "Propietario",
       T.DEFINER AS "Definidor",
       VARCHAR_FORMAT(T.ALTEREDTS, 'DD-MM-YYYY HH24:MI:SS') AS "Última modificación",
       CASE T.TEMPORAL_TYPE
           WHEN 'S' THEN 'Periodo de sistema'
           WHEN 'H' THEN 'Histórico'
           ELSE
               CASE T.TYPE
                   WHEN 'M' THEN 'Consulta materializada'
                   ELSE ''
               END
       END AS "Tipo",
       CASE T.PART_TABLE
           WHEN 'YES' THEN 'Sí'
           ELSE ''
       END AS "Particionada",
       CASE P.VERSIONING_STATUS
           WHEN 'E' THEN 'Habilitado'
           WHEN 'D' THEN 'Definido'
           ELSE ''
       END AS "Versión histórica",
       CASE
           WHEN T.LABEL IS NULL THEN ''
           ELSE TRIM(T.LABEL)
       END AS "Texto"
    FROM QSYS2.SYSTABLES T
         LEFT OUTER JOIN QSYS2.SYSTABLESTAT S
             ON T.TABLE_SCHEMA = S.TABLE_SCHEMA AND T.NAME = S.TABLE_NAME AND T.TYPE IN ('T', 'P', 'M')
         LEFT OUTER JOIN QSYS2.SYSPERIODS P
             ON T.TABLE_SCHEMA = P.TABLE_SCHEMA AND T.NAME = P.TABLE_NAME AND T.TYPE IN ('T', 'P', 'M')
    WHERE T.TYPE IN ('T', 'P', 'M')
      AND ('{{tableName}}' = '' OR T.NAME IN ({{tableList}}))
      AND ('{{limitToPath}}' = '0' OR T.TABLE_SCHEMA IN ({{schemaList}}))
    ORDER BY 1 ASC, 2 ASC
