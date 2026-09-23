INSERT OR IGNORE INTO sys_roles (id, name) VALUES ('role-developer', 'developer');
INSERT OR IGNORE INTO sys_roles (id, name) VALUES ('role-admin', 'admin');
INSERT OR IGNORE INTO sys_roles (id, name) VALUES ('role-readonly', 'solo lectura');

INSERT OR IGNORE INTO sys_modules (id, name, path)
VALUES ('mod-jobs-config', 'JOBS_CONFIG', '/jobs');
INSERT OR IGNORE INTO sys_modules (id, name, path) VALUES ('mod-compare', 'COMPARE', '/compare');
INSERT OR IGNORE INTO sys_modules (id, name, path) VALUES ('mod-dictionary', 'DICTIONARY', '/dictionary');
INSERT OR IGNORE INTO sys_modules (id, name, path) VALUES ('mod-catalog', 'CATALOG', '/catalog');
INSERT OR IGNORE INTO sys_modules (id, name, path) VALUES ('mod-profiles', 'PROFILES', '/profiles');
INSERT OR IGNORE INTO sys_modules (id, name, path) VALUES ('mod-users', 'USERS', '/users');

INSERT OR IGNORE INTO sys_role_permissions (
  role_id, module_id, can_view, can_read, can_write,
  can_create, can_edit, can_delete, can_save
)
SELECT 'role-developer', id, 1, 1, 1, 1, 1, 1, 1 FROM sys_modules;

INSERT OR IGNORE INTO sys_role_permissions (
  role_id, module_id, can_view, can_read, can_write,
  can_create, can_edit, can_delete, can_save
)
SELECT 'role-readonly', id, 1, 1, 0, 0, 0, 0, 0 FROM sys_modules
WHERE name NOT IN ('PROFILES', 'USERS');
