export const CURRENT_RELEASE = {
  version: "1.1.2",
  date: "2026-09-24",
  title: "Operación IBM i y diccionarios de datos",
  changes: [
    "Administración de perfiles con permisos por módulo y acción: View, New, Edit, Delete y Save.",
    "Perfiles predeterminados admin y solo lectura, con asignación desde la opción Usuarios.",
    "Registro automático de usuarios autenticados y edición de sus datos locales.",
    "Persistencia de catálogos con nombre asignado, DSN y esquemas de búsqueda.",
    "Carga de diccionarios por nombre lógico de catálogo y selección de origen y destino.",
    "Comparación de esquema, volumen y filas entre entornos con resolución de DSN físico.",
    "Corrección de assets y fallback SPA para despliegues bajo /deltacore/ en IBM i.",
    "Asignación exclusiva de un perfil por usuario y menú filtrado por permisos.",
    "Logout local determinista y validación de acceso para usuarios de solo lectura.",
    "Conexión IBM i mediante la configuración ODBC del sistema y diagnósticos SQL/ODBC en backend.",
    "Carga de diccionarios guardados por DSN y tabla, sin consultas automáticas al escribir.",
    "Mensajes informativos visibles durante cinco segundos y arranque PM2 compatible con Node en IBM i.",
  ],
} as const;