INSERT OR IGNORE INTO sys_roles (id, name) VALUES ('role-developer', 'developer');

INSERT OR IGNORE INTO sys_modules (id, name, path)
VALUES ('mod-jobs-config', 'JOBS_CONFIG', '/jobs');

INSERT OR IGNORE INTO sys_role_permissions (
  role_id, module_id, can_view, can_read, can_write
) VALUES ('role-developer', 'mod-jobs-config', 1, 1, 1);
