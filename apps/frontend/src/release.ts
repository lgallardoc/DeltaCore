export const CURRENT_RELEASE = {
  version: "1.1.0",
  date: "2026-09-23",
  title: "Administración, permisos y comparación multi-entorno",
  changes: [
    "Administración de perfiles con permisos por módulo y acción: View, New, Edit, Delete y Save.",
    "Perfiles predeterminados admin y solo lectura, con asignación desde la opción Usuarios.",
    "Registro automático de usuarios autenticados y edición de sus datos locales.",
    "Persistencia de catálogos con nombre asignado, DSN y esquemas de búsqueda.",
    "Carga de diccionarios por nombre lógico de catálogo y selección de origen y destino.",
    "Comparación de esquema, volumen y filas entre entornos con resolución de DSN físico.",
    "Corrección de assets y fallback SPA para despliegues bajo /deltacore/ en IBM i.",
  ],
} as const;