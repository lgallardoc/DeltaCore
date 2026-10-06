export const CURRENT_RELEASE = {
  version: "1.2.7",
  date: "2026-10-06",
  title: "Contexto de comparación y resguardo SQL",
  changes: [
    "Todas las categorías de detalle de filas muestran los DSN y nombres seleccionados de origen y destino.",
    "Aviso de responsabilidad visible en el resultado del comparador y en el encabezado comentado de cada script SQL.",
    "Los archivos SQL descargados incluyen contexto origen vs. destino y entregan el bloque rollback comentado por defecto.",
  ],
} as const;