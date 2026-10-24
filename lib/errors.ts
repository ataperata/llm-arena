const SECRET = /(sk-|Bearer\s+|eyJ)[A-Za-z0-9._\-]+/gi;

export function publicErrorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "The model request failed.";
  const redacted = message.replace(SECRET, "$1[redacted]").replace(/\s+/g, " ").trim();
  if (!redacted) return "The model request failed.";
  return redacted.slice(0, 400);
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
