interface DatabaseErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

export function isMissingColumnError(error: unknown, column: string): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as DatabaseErrorLike;
  const text = [candidate.message, candidate.details, candidate.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const normalizedColumn = column.toLowerCase();
  const missingCode = ["42703", "PGRST204"].includes(String(candidate.code || "").toUpperCase());
  const missingText = text.includes("does not exist")
    || text.includes("schema cache")
    || text.includes("could not find");
  return text.includes(normalizedColumn) && (missingCode || missingText);
}
