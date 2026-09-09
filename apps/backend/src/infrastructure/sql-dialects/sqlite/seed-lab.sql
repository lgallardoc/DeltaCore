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
