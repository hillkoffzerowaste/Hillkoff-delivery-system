const SERVICE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidServiceDate(value) {
  const dateKey = String(value || "");
  if (!SERVICE_DATE_PATTERN.test(dateKey)) return false;

  const parsed = new Date(`${dateKey}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === dateKey;
}
