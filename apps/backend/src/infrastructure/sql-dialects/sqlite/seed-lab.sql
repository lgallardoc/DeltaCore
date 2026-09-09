INSERT OR IGNORE INTO biz_data_sources (
  id, name, engine, odbc_dsn, is_active, search_path
) VALUES (
  'ds-az7-lab',
  'AZ7 lab',
  'db2',
  'AZ7DB',
  1,
  '["AZBASWQA","AZLOSWQACL","AXSWQACL"]'
);

INSERT OR IGNORE INTO biz_data_sources (
  id, name, engine, odbc_dsn, is_active, search_path
) VALUES (
  'ds-az7-prdcl',
  'AZ7 PRDCL',
  'db2',
  'AZ7DBPRDCL',
  1,
  '["AXSW1PDCL","AZBASWQA","AZLOSWQACL"]'
);
