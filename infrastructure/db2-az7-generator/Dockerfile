FROM icr.io/db2_community/db2

RUN mkdir -p /tmp/sql /var/custom
COPY sql/01_create_schema.sql /tmp/sql/
COPY sql/02_insert_mock_data.sql /tmp/sql/

COPY init-db.sh /var/custom/init-db.sh
RUN chmod +x /var/custom/init-db.sh
