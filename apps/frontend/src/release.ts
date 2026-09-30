export const CURRENT_RELEASE = {
  version: "1.2.5",
  date: "2026-09-30",
  title: "Parseo y comparación de campos FLAG",
  changes: [
    "Marcado de columnas FLAG en el diccionario y persistencia SQLite con migración compatible para bases existentes.",
    "Parseo por posición de valores FLAG de origen y destino, con descripciones y valores válidos de AZUFD.",
    "Modal FLAG con filtro entre todos los indicadores y solo diferencias; resalta los valores distintos y conserva posiciones sin definición.",
    "Generación de scripts de homologación y rollback para filas cambiadas, solo en origen y solo en destino.",
    "Resolución del DSN físico de origen y destino en el detalle de comparación.",
  ],
} as const;