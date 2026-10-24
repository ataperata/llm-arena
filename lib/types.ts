export type ProviderMode = "demo" | "gateway" | "openai-compatible";

export type StorageMode = "local" | "supabase";

export type TokenSource = "provider" | "estimate";

export type PublicModel = {
  id: string;
  label: string;
  provider: string;
  inputPerMillion: number | null;
  outputPerMillion: number | null;
};

export type PublicArenaConfig = {
  mode: ProviderMode;
  storage: StorageMode;
  maxPromptChars: number;
  models: PublicModel[];
  modelsTruncated: boolean;
  pricingWarning: string | null;
  blocker: string | null;
};

export type Vote = {
  comparisonId: string;
  prompt: string;
  winnerModelId: string;
  modelIds: string[];
  createdAt: string;
};

export type LeaderboardRow = {
  modelId: string;
  label: string;
  wins: number;
  comparisons: number;
  winRate: number;
};

export type ArenaDeltaEvent = {
  type: "delta";
  text: string;
};

export type ArenaDoneEvent = {
  type: "done";
  ttftMs: number | null;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  tokenSource: TokenSource;
  costUsd: number | null;
};

export type ArenaErrorEvent = {
  type: "error";
  message: string;
};

export type ArenaEvent = ArenaDeltaEvent | ArenaDoneEvent | ArenaErrorEvent;

export type CardStatus = "idle" | "streaming" | "done" | "error";

export type CardSnapshot = {
  status: CardStatus;
  text: string;
  ttftMs: number | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  tokenSource: TokenSource | null;
  costUsd: number | null;
  error: string | null;
};
