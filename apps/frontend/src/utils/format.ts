const DATE_FORMATTER = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "short",
});

const TIME_FORMATTER = new Intl.DateTimeFormat("es-CL", {
  timeStyle: "medium",
  hour12: false,
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "short",
  timeStyle: "medium",
  hour12: false,
});

export function formatDate(value: string | number | Date): string {
  return DATE_FORMATTER.format(new Date(value));
}

export function formatTime(value: string | number | Date): string {
  return TIME_FORMATTER.format(new Date(value));
}

export function formatDateTime(value: string | number | Date): string {
  return DATE_TIME_FORMATTER.format(new Date(value));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-CL").format(value);
}
