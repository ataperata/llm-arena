import {
  CATALOG,
  DEFAULT_MODEL_IDS,
  modelLabel,
  parsePricingOverride,
  providerLabel,
  type TokenPrice,
} from "@/lib/pricing";
import type { ProviderMode, PublicArenaConfig, PublicModel, StorageMode } from "@/lib/types";

export const MAX_PROMPT_CHARS = 4_000;
export const MAX_MODELS = 6;
export const DEFAULT_MAX_OUTPUT_TOKENS = 800;

type Env = Record<string, string | undefined>;

function read(env: Env, name: string): string | undefined {
  const value = env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveProviderMode(env: Env): ProviderMode {
  const explicit = read(env, "ARENA_PROVIDER")?.toLowerCase();
  if (explicit === "demo" || explicit === "gateway" || explicit === "openai-compatible") {
    return explicit;
  }
  if (read(env, "AI_GATEWAY_API_KEY")) return "gateway";
  if (read(env, "OPENAI_COMPATIBLE_BASE_URL") && read(env, "OPENAI_COMPATIBLE_API_KEY")) {
    return "openai-compatible";
  }
  return "demo";
}

export function resolveStorageMode(env: Env): StorageMode {
  if (read(env, "SUPABASE_URL") && read(env, "SUPABASE_SERVICE_ROLE_KEY")) return "supabase";
  return "local";
}

export function resolveBlocker(mode: ProviderMode, env: Env): string | null {
  if (mode === "demo") return null;
  if (mode === "gateway" && !read(env, "AI_GATEWAY_API_KEY") && !read(env, "VERCEL_OIDC_TOKEN")) {
    return "Gateway mode needs AI_GATEWAY_API_KEY, or VERCEL_OIDC_TOKEN on a Vercel deployment.";
  }
  if (
    mode === "openai-compatible" &&
    (!read(env, "OPENAI_COMPATIBLE_BASE_URL") || !read(env, "OPENAI_COMPATIBLE_API_KEY"))
  ) {
    return "OpenAI-compatible mode needs OPENAI_COMPATIBLE_BASE_URL and OPENAI_COMPATIBLE_API_KEY.";
  }
  return null;
}

export function resolveMaxOutputTokens(env: Env): number {
  const raw = read(env, "ARENA_MAX_OUTPUT_TOKENS");
  if (!raw) return DEFAULT_MAX_OUTPUT_TOKENS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 64 || parsed > 4_000) return DEFAULT_MAX_OUTPUT_TOKENS;
  return parsed;
}

function priceForModel(id: string, overrides: Record<string, TokenPrice>): TokenPrice | null {
  const override = overrides[id];
  if (override) return override;
  const catalog = CATALOG[id];
  if (!catalog) return null;
  return { inputPerMillion: catalog.inputPerMillion, outputPerMillion: catalog.outputPerMillion };
}

export function parseModels(env: Env): { models: PublicModel[]; truncated: boolean; pricingWarning: string | null } {
  const raw = read(env, "ARENA_MODELS");
  const ids = (raw ? raw.split(",") : [...DEFAULT_MODEL_IDS])
    .map((id) => id.trim())
    .filter(Boolean);
  const unique: string[] = [];
  for (const id of ids) {
    if (!unique.includes(id)) unique.push(id);
  }
  const truncated = unique.length > MAX_MODELS;
  const selected = unique.slice(0, MAX_MODELS);
  const pricing = parsePricingOverride(read(env, "ARENA_PRICING"));
  const models = selected.map((id) => {
    const price = pricing.error ? priceForModel(id, {}) : priceForModel(id, pricing.prices);
    return {
      id,
      label: modelLabel(id),
      provider: CATALOG[id]?.provider ?? providerLabel(id),
      inputPerMillion: price?.inputPerMillion ?? null,
      outputPerMillion: price?.outputPerMillion ?? null,
    };
  });
  return { models, truncated, pricingWarning: pricing.error };
}

export function getArenaConfig(env: Env = process.env): PublicArenaConfig & { maxOutputTokens: number } {
  const mode = resolveProviderMode(env);
  const { models, truncated, pricingWarning } = parseModels(env);
  return {
    mode,
    storage: resolveStorageMode(env),
    maxPromptChars: MAX_PROMPT_CHARS,
    models,
    modelsTruncated: truncated,
    pricingWarning,
    blocker: resolveBlocker(mode, env),
    maxOutputTokens: resolveMaxOutputTokens(env),
  };
}

export function getPublicConfig(env: Env = process.env): PublicArenaConfig {
  const config = getArenaConfig(env);
  return {
    mode: config.mode,
    storage: config.storage,
    maxPromptChars: config.maxPromptChars,
    models: config.models,
    modelsTruncated: config.modelsTruncated,
    pricingWarning: config.pricingWarning,
    blocker: config.blocker,
  };
}
