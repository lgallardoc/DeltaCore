import { Edit3, Save, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { apiClient } from "../../auth/api.client";
import { usePermissions } from "../../auth/usePermissions";
import { useStatusNotification } from "../../components/StatusBanner";

type User = { id: string; ssoId: string; email: string; roles: string[] };
type Role = { id: string; name: string };

export function UserView() {
  const { notify } = useStatusNotification();
  const { canEdit, canSave } = usePermissions("USERS");
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const response = await apiClient.get<{ users: User[]; roles: Role[] }>("/admin/rbac");
      setUsers(response.data.users);
      setRoles(response.data.roles);
      setSelectedId((current) => current || response.data.users[0]?.id || "");
      const selected = response.data.users.find((user) => user.id === selectedId) ?? response.data.users[0];
      setEmail(selected?.email ?? "");
    } catch (error) {
      notify(errorMessage(error, "No se pudieron cargar los usuarios."), "error");
    }
  }

  useEffect(() => { void load(); }, []);

  const selectedUser = users.find((user) => user.id === selectedId);

  function selectUser(id: string) {
    setSelectedId(id);
    setEmail(users.find((user) => user.id === id)?.email ?? "");
  }

  async function save() {
    if (!selectedUser || !canEdit || !canSave) return;
    setBusy(true);
    try {
      await apiClient.put(`/admin/rbac/users/${encodeURIComponent(selectedUser.id)}`, { email });
      await load();
      notify("Usuario actualizado.", "success");
    } catch (error) {
      notify(errorMessage(error, "No se pudo actualizar el usuario."), "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveRoles() {
    if (!selectedUser || !canEdit || !canSave) return;
    setBusy(true);
    try {
      const roleIds = roles
        .filter((role) => selectedUser.roles.includes(role.name))
        .map((role) => role.id);
      await apiClient.put(`/admin/rbac/users/${encodeURIComponent(selectedUser.id)}/roles`, { roleIds });
      await load();
      notify("Perfiles del usuario actualizados.", "success");
    } catch (error) {
      notify(errorMessage(error, "No se pudieron actualizar los perfiles."), "error");
    } finally {
      setBusy(false);
    }
  }

  function toggleRole(roleName: string) {
    setUsers((current) => current.map((user) => {
      if (user.id !== selectedId) return user;
      const assigned = user.roles.includes(roleName);
      return {
        ...user,
        roles: assigned ? user.roles.filter((name) => name !== roleName) : [...user.roles, roleName],
      };
    }));
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold"><Users size={22} /> Usuarios</h2>
        <p className="fin-muted text-sm">Administre los datos locales de usuarios registrados por SSO.</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_1.5fr]">
        <section className="rounded-lg border bg-white p-3">
          <h3 className="mb-3 font-semibold">Usuarios registrados</h3>
          <div className="grid gap-1">
            {users.map((user) => (
              <button
                id={`btnEdit_users_${user.id}`}
                key={user.id}
                type="button"
                disabled={!canEdit}
                className={["rounded border px-2 py-2 text-left text-sm", selectedId === user.id ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]" : "bg-white"].join(" ")}
                onClick={() => selectUser(user.id)}
              >
                <span className="block font-semibold">{user.email}</span>
                <span className="fin-muted block text-xs">{user.roles.join(", ") || "sin perfil"}</span>
              </button>
            ))}
          </div>
          {users.length === 0 ? <p className="fin-muted text-sm">Aún no hay usuarios autenticados.</p> : null}
        </section>
        <section className="rounded-lg border bg-white p-3">
          <h3 className="mb-3 flex items-center gap-2 font-semibold"><Edit3 size={15} /> Datos locales</h3>
          {selectedUser ? (
            <>
              <p className="fin-muted mb-3 text-xs">SSO: {selectedUser.ssoId}</p>
              <label className="fin-field max-w-xl"><span>Correo local</span><input className="input input-bordered input-sm" value={email} disabled={!canEdit} onChange={(event) => setEmail(event.target.value)} /></label>
              <button id="btnSave_users" className="btn fin-btn-primary btn-sm mt-4" disabled={busy || !canEdit || !canSave} onClick={() => void save()}><Save size={14} /> Guardar usuario</button>
              <div className="mt-5 border-t pt-4">
                <h4 className="font-semibold">Perfiles asignados</h4>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {roles.map((role) => (
                    <label key={role.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="checkbox checkbox-sm" disabled={!canEdit} checked={selectedUser.roles.includes(role.name)} onChange={() => toggleRole(role.name)} />
                      {role.name}
                    </label>
                  ))}
                </div>
                <button id="btnSave_users_roles" className="btn fin-btn-primary btn-sm mt-4" disabled={busy || !canEdit || !canSave} onClick={() => void saveRoles()}><Save size={14} /> Guardar perfiles</button>
              </div>
            </>
          ) : <p className="fin-muted text-sm">Seleccione un usuario.</p>}
        </section>
      </div>
    </section>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return (error as { response?: { data?: { error?: string } } }).response?.data?.error ??
    (error instanceof Error ? error.message : fallback);
}