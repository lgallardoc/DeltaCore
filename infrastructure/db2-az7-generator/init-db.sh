#!/bin/bash
set -e

DB_NAME=${DBNAME:-AZ7DB}
INSTANCE=${DB2INSTANCE:-db2inst1}

echo "=================================================="
echo "=> Inicializando Catalogo DB2 AZ7 en Base: ${DB_NAME}"
echo "=================================================="

su - ${INSTANCE} -c "db2start" || true

echo "=> Ejecutando 01_create_schema.sql..."
su - ${INSTANCE} -c "db2 -tvf /tmp/sql/01_create_schema.sql"

echo "=> Ejecutando 02_insert_mock_data.sql..."
su - ${INSTANCE} -c "db2 -tvf /tmp/sql/02_insert_mock_data.sql"

echo "=================================================="
echo "=> Carga de AZ7 completada exitosamente."
echo "=================================================="
