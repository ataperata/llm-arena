import type { PublicModel } from "@/lib/types";

export type TokenPrice = {
  inputPerMillion: number;
  outputPerMillion: number;
};

/**
 * Snapshot of Vercel AI Gateway list prices, converted from USD per token
 * to USD per 1M tokens. Override any entry with ARENA_PRICING.
 */
export const CATALOG: Record<string, TokenPrice & { label: string; provider: string }> = {
  "openai/gpt-5": {
    label: "GPT-5",
    provider: "OpenAI",
    inputPerMillion: 1.25,
    outputPerMillion: 10,
  },
  "openai/gpt-5-mini": {
    label: "GPT-5 mini",
    provider: "OpenAI",
    inputPerMillion: 0.25,
    outputPerMillion: 2,
  },
  "openai/gpt-5-nano": {
    label: "GPT-5 nano",
    provider: "OpenAI",
    inputPerMillion: 0.05,
    outputPerMillion: 0.4,
  },
  "anthropic/claude-haiku-5.5": {
    label: "Claude Haiku 5.5",
    provider: "Anthropic",
    inputPerMillion: 0.1,
    outputPerMillion: 0.5,
  },
  "anthropic/claude-sonnet-5": {
    label: "Claude Sonnet 5",
    provider: "Anthropic",
    inputPerMillion: 2,
    outputPerMillion: 10,
  },
  "anthropic/claude-sonnet-5.5": {
    label: "Claude Sonnet 5.5",
    provider: "Anthropic",
    inputPerMillion: 2,
    outputPerMillion: 10,
  },
  "google/gemini-3-flash": {
    label: "Gemini 3 Flash",
    provider: "Google",
    inputPerMillion: 0.5,
    outputPerMillion: 3,
  },
  "google/gemini-3.8-flash": {
    label: "Gemini 3.8 Flash",
    provider: "Google",
    inputPerMillion: 0.75,
    outputPerMillion: 3.75,
  },
};

export const DEFAULT_MODEL_IDS = [
  "openai/gpt-5-mini",
  "anthropic/claude-haiku-5.5",
  "google/gemini-3.8-flash",
] as const;

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  amazon: "Amazon",
  alibaba: "Alibaba",
  meta: "Meta",
  mistral: "Mistral",
  xai: "xAI",
};

export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export function estimateCostUsd(
  price: TokenPrice | null,
  inputTokens: number,
  outputTokens: number,
): number | null {
  if (!price) return null;
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return null;
  if (inputTokens < 0 || outputTokens < 0) return null;
  const cost =
    (inputTokens / 1_000_000) * price.inputPerMillion +
    (outputTokens / 1_000_000) * price.outputPerMillion;
  if (!Number.isFinite(cost)) return null;
  return cost;
}

export function priceFor(model: Pick<PublicModel, "inputPerMillion" | "outputPerMillion">): TokenPrice | null {
  if (model.inputPerMillion == null || model.outputPerMillion == null) return null;
  return {
    inputPerMillion: model.inputPerMillion,
    outputPerMillion: model.outputPerMillion,
  };
}

export function formatUsd(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value === 0) return "$0";
  if (value < 0.0001) return "<$0.0001";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

export function formatTokens(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

export function formatDuration(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function parsePricingOverride(raw: string | undefined): {
  prices: Record<string, TokenPrice>;
  error: string | null;
} {
  if (!raw?.trim()) return { prices: {}, error: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { prices: {}, error: "ARENA_PRICING is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { prices: {}, error: "ARENA_PRICING must be a JSON object keyed by model id." };
  }

  const prices: Record<string, TokenPrice> = {};
  for (const [id, value] of Object.entries(parsed)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {
        prices: {},
        error: `ARENA_PRICING entry for ${id} must be an object with inputPerMillion and outputPerMillion.`,
      };
    }
    const input = (value as { inputPerMillion?: unknown }).inputPerMillion;
    const output = (value as { outputPerMillion?: unknown }).outputPerMillion;
    if (
      typeof input !== "number" ||
      typeof output !== "number" ||
      !Number.isFinite(input) ||
      !Number.isFinite(output) ||
      input < 0 ||
      output < 0
    ) {
      return {
        prices: {},
        error: `ARENA_PRICING entry for ${id} needs non-negative inputPerMillion and outputPerMillion numbers.`,
      };
    }
    prices[id] = { inputPerMillion: input, outputPerMillion: output };
  }
  return { prices, error: null };
}

export function providerLabel(modelId: string): string {
  const prefix = modelId.includes("/") ? modelId.slice(0, modelId.indexOf("/")) : "";
  if (!prefix) return "Custom";
  return PROVIDER_LABELS[prefix.toLowerCase()] ?? prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

export function modelLabel(modelId: string): string {
  return CATALOG[modelId]?.label ?? modelId;
}
