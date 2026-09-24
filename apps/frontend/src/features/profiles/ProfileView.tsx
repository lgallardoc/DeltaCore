import { Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { apiClient } from "../../auth/api.client";
import { useStatusNotification } from "../../components/StatusBanner";
import { usePermissions } from "../../auth/usePermissions";

type User = { id: string; ssoId: string; email: string; roles: string[] };
type Permission = {
  moduleId: string;
  moduleName: string;
  canView: boolean;
  canRead: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canSave: boolean;
  canRun: boolean;
};
type Role = { id: string; name: string; permissions: Permission[] };
type Module = { id: string; name: string; path: string };

const ACTIONS = [
  ["canView", "View"],
  ["canCreate", "New"],
  ["canEdit", "Edit"],
  ["canDelete", "Delete"],
  ["canSave", "Save"],
  ["canRun", "Run"],
] as const;

export function ProfileView() {
  const { notify } = useStatusNotification();
  const { canCreate, canEdit, canDelete, canSave } = usePermissions("PROFILES");
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [roleId, setRoleId] = useState("");
  const [roleName, setRoleName] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const response = await apiClient.get<{ users: User[]; roles: Role[]; modules: Module[] }>("/admin/rbac");
      setUsers(response.data.users);
      setRoles(response.data.roles);
      setModules(response.data.modules);
    } catch (error) {
      notify(errorMessage(error, "No se pudieron cargar los perfiles."), "error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const selectedRole = roles.find((role) => role.id === roleId);

  async function saveRole() {
    if (!roleName.trim() || (!roleId && !canCreate) || (roleId && !canEdit)) return;
    setBusy(true);
    try {
      const response = await apiClient.put<{ id: string; name: string }>("/admin/rbac/roles", { id: roleId || undefined, name: roleName });
      setRoleId("");
      setRoleName("");
      await load();
      setRoleId(response.data.id);
      setRoleName(response.data.name);
      notify("Perfil guardado.", "success");
    } catch (error) {
      notify(errorMessage(error, "No se pudo guardar el perfil."), "error");
    } finally {
      setBusy(false);
    }
  }

  async function togglePermission(permission: Permission, action: typeof ACTIONS[number][0]) {
    if (!selectedRole || !canEdit || !canSave) return;
    const nextValue = !permission[action];
    setRoles((current) => current.map((role) => role.id !== selectedRole.id ? role : {
      ...role,
      permissions: role.permissions.map((item) => item.moduleId !== permission.moduleId ? item : { ...item, [action]: nextValue }),
    }));
    try {
      await apiClient.put(`/admin/rbac/roles/${encodeURIComponent(selectedRole.id)}/modules/${encodeURIComponent(permission.moduleId)}`, {
        ...permission,
        ...(action === "canView" ? { canRead: nextValue } : {}),
        [action]: nextValue,
      });
    } catch (error) {
      notify(errorMessage(error, "No se pudo actualizar el permiso."), "error");
      await load();
    }
  }

  async function deleteRole(role: Role) {
    if (!canDelete || !window.confirm(`¿Eliminar el perfil ${role.name}?`)) return;
    setBusy(true);
    try {
      await apiClient.delete(`/admin/rbac/roles/${encodeURIComponent(role.id)}`);
      if (roleId === role.id) {
        setRoleId("");
        setRoleName("");
      }
      await load();
      notify("Perfil eliminado.", "success");
    } catch (error) {
      notify(errorMessage(error, "No se pudo eliminar el perfil."), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold"><ShieldCheck size={22} /> Perfiles</h2>
        <p className="fin-muted text-sm">Administre perfiles y asígnelos a usuarios autenticados.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.3fr]">
        <section className="rounded-lg border bg-white p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-semibold">Perfiles disponibles</h3>
            <button id="btnNew_profiles_role" className="btn btn-sm" type="button" disabled={!canCreate} onClick={() => { setRoleId(""); setRoleName(""); }}>
              <Plus size={14} /> Nuevo
            </button>
          </div>
          <div className="flex gap-2">
            <input className="input input-bordered input-sm min-w-0 flex-1" value={roleName} placeholder="nombre del perfil" onChange={(event) => setRoleName(event.target.value)} />
            <button id="btnSave_profiles_role" className="btn fin-btn-primary btn-sm" disabled={busy || !canSave || (!roleId && !canCreate) || (Boolean(roleId) && !canEdit) || !roleName.trim()} onClick={() => void saveRole()}><Save size={14} /> Guardar</button>
          </div>
          <div className="mt-3 grid gap-1">
            {roles.map((role) => (
              <div key={role.id} className="flex items-center justify-between rounded border px-2 py-1.5 text-sm">
                <button id={`btnEdit_profiles_role_${role.id}`} type="button" disabled={!canEdit} className="text-left font-semibold hover:text-[color:var(--brand)]" onClick={() => { setRoleId(role.id); setRoleName(role.name); }}>{role.name}</button>
                <button id={`btnDel_profiles_role_${role.id}`} className="btn btn-xs" type="button" disabled={busy || !canDelete} title="Eliminar perfil" onClick={() => void deleteRole(role)}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          {selectedRole ? (
            <div className="mt-4 overflow-auto rounded border">
              <table className="table table-xs">
                <thead><tr><th>Módulo</th>{ACTIONS.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead>
                <tbody>{modules.map((module) => {
                  const permission = selectedRole.permissions.find((item) => item.moduleId === module.id) ?? {
                    moduleId: module.id, moduleName: module.name, canView: false, canRead: false, canCreate: false, canEdit: false, canDelete: false, canSave: false, canRun: false,
                  };
                  return <tr key={module.id}><td>{module.name}</td>{ACTIONS.map(([action, label]) => <td key={action}>
                    <input id={`btn${label}_profiles_${selectedRole.id}_${module.id}`} type="checkbox" className="checkbox checkbox-sm" checked={permission[action]} disabled={!canEdit || !canSave} onChange={() => void togglePermission(permission, action)} />
                  </td>)}</tr>;
                })}</tbody>
              </table>
            </div>
          ) : null}
        </section>

      </div>
    </section>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return (error as { response?: { data?: { error?: string } } }).response?.data?.error ??
    (error instanceof Error ? error.message : fallback);
}