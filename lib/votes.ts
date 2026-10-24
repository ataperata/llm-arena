import type { Vote } from "@/lib/types";

export const VOTE_STORAGE_KEY = "llm-arena.votes.v1";

export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function isVote(value: unknown): value is Vote {
  if (!value || typeof value !== "object") return false;
  const vote = value as Record<string, unknown>;
  return (
    typeof vote.comparisonId === "string" &&
    vote.comparisonId.length > 0 &&
    vote.comparisonId.length <= 80 &&
    typeof vote.prompt === "string" &&
    typeof vote.winnerModelId === "string" &&
    vote.winnerModelId.length > 0 &&
    Array.isArray(vote.modelIds) &&
    vote.modelIds.every((id) => typeof id === "string" && id.length > 0) &&
    typeof vote.createdAt === "string" &&
    vote.createdAt.length > 0
  );
}

export function parseStoredVotes(raw: string | null): Vote[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isVote);
  } catch {
    return [];
  }
}

export function readVotes(store: KeyValueStore | null): Vote[] {
  if (!store) return [];
  try {
    return parseStoredVotes(store.getItem(VOTE_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function writeVotes(store: KeyValueStore, votes: Vote[]): void {
  store.setItem(VOTE_STORAGE_KEY, JSON.stringify(votes));
  if (typeof window !== "undefined") window.dispatchEvent(new Event("arena-votes"));
}
