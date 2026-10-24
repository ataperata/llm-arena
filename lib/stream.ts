import type { ArenaEvent } from "@/lib/types";

const EVENT_TYPES = new Set(["delta", "done", "error"]);

export function encodeEvent(event: ArenaEvent): string {
  return `${JSON.stringify(event)}\n`;
}

export function parseEventLine(line: string): ArenaEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object") return null;
    const type = (parsed as { type?: unknown }).type;
    if (typeof type !== "string" || !EVENT_TYPES.has(type)) return null;
    return parsed as ArenaEvent;
  } catch {
    return null;
  }
}
