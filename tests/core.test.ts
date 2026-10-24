import { describe, expect, it } from "vitest";

import { getPublicConfig, resolveProviderMode, resolveStorageMode } from "@/lib/config";
import { createDemoTranscript, demoAnswer, voiceFor } from "@/lib/demo";
import { publicErrorMessage } from "@/lib/errors";
import { buildLeaderboard, latestVotes, upsertVote } from "@/lib/leaderboard";
import { estimateCostUsd, estimateTokens, formatDuration, formatUsd, parsePricingOverride } from "@/lib/pricing";
import { parseEventLine } from "@/lib/stream";
import { summarizeRound } from "@/lib/summary";
import { rowToVote, voteToRow } from "@/lib/supabase";
import type { Vote } from "@/lib/types";
import { isVote, readVotes, VOTE_STORAGE_KEY, writeVotes, type KeyValueStore } from "@/lib/votes";

const roster = [
  { id: "openai/gpt-5-mini", label: "GPT-5 mini" },
  { id: "anthropic/claude-haiku-5.5", label: "Claude Haiku 5.5" },
  { id: "google/gemini-3.8-flash", label: "Gemini 3.8 Flash" },
];

function vote(partial: Partial<Vote> & Pick<Vote, "comparisonId" | "winnerModelId">): Vote {
  return {
    prompt: "Explain indexes",
    modelIds: roster.map((model) => model.id),
    createdAt: "2026-10-23T00:00:00.000Z",
    ...partial,
  };
}

describe("provider and storage mode", () => {
  it("stays in demo when no credentials are set", () => {
    expect(resolveProviderMode({})).toBe("demo");
    expect(resolveProviderMode({ VERCEL_OIDC_TOKEN: "present-on-every-vercel-deploy" })).toBe("demo");
  });

  it("uses the gateway when an API key is present", () => {
    expect(resolveProviderMode({ AI_GATEWAY_API_KEY: "gateway-key" })).toBe("gateway");
  });

  it("uses an OpenAI-compatible endpoint when that pair is set and no gateway key is", () => {
    expect(
      resolveProviderMode({
        OPENAI_COMPATIBLE_BASE_URL: "https://example.test/v1",
        OPENAI_COMPATIBLE_API_KEY: "compat-key",
      }),
    ).toBe("openai-compatible");
  });

  it("lets an explicit provider override auto detection", () => {
    expect(resolveProviderMode({ ARENA_PROVIDER: "demo", AI_GATEWAY_API_KEY: "gateway-key" })).toBe("demo");
    expect(resolveProviderMode({ ARENA_PROVIDER: "gateway" })).toBe("gateway");
  });

  it("enables Supabase only when both server env vars are set", () => {
    expect(resolveStorageMode({})).toBe("local");
    expect(resolveStorageMode({ SUPABASE_URL: "https://example.supabase.co" })).toBe("local");
    expect(
      resolveStorageMode({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
      }),
    ).toBe("supabase");
  });

  it("does not copy secrets into the public config", () => {
    const config = getPublicConfig({
      AI_GATEWAY_API_KEY: "super-secret-gateway",
      OPENAI_COMPATIBLE_API_KEY: "super-secret-compat",
      SUPABASE_SERVICE_ROLE_KEY: "super-secret-service",
      SUPABASE_URL: "https://example.supabase.co",
    });
    expect(JSON.stringify(config)).not.toContain("super-secret");
    expect(config.mode).toBe("gateway");
    expect(config.storage).toBe("supabase");
    expect(config.models.map((model) => model.id)).toEqual([
      "openai/gpt-5-mini",
      "anthropic/claude-haiku-5.5",
      "google/gemini-3.8-flash",
    ]);
  });

  it("parses model overrides and reports bad pricing JSON", () => {
    const config = getPublicConfig({
      ARENA_MODELS: "custom/tiny, openai/gpt-5-mini, custom/tiny",
      ARENA_PRICING: JSON.stringify({
        "custom/tiny": { inputPerMillion: 1, outputPerMillion: 2 },
      }),
    });
    expect(config.models.map((model) => model.id)).toEqual(["custom/tiny", "openai/gpt-5-mini"]);
    expect(config.models[0]).toMatchObject({ inputPerMillion: 1, outputPerMillion: 2, provider: "Custom" });
    expect(getPublicConfig({ ARENA_PRICING: "{nope" }).pricingWarning).toMatch(/valid JSON/);
  });
});

describe("pricing", () => {
  it("estimates tokens from trimmed length", () => {
    expect(estimateTokens("    ")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("prices a known model from per-million rates", () => {
    expect(estimateCostUsd({ inputPerMillion: 0.25, outputPerMillion: 2 }, 800, 200)).toBeCloseTo(0.0006);
    expect(estimateCostUsd(null, 10, 10)).toBeNull();
    expect(estimateCostUsd({ inputPerMillion: 1, outputPerMillion: 1 }, -1, 1)).toBeNull();
  });

  it("formats money and duration for the cards", () => {
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(0.00004)).toBe("<$0.0001");
    expect(formatUsd(0.0006)).toBe("$0.0006");
    expect(formatUsd(1.2)).toBe("$1.20");
    expect(formatDuration(180)).toBe("180 ms");
    expect(formatDuration(1240)).toBe("1.24 s");
  });

  it("rejects a pricing entry with a negative rate", () => {
    expect(parsePricingOverride('{"m":{"inputPerMillion":-1,"outputPerMillion":1}}').error).toMatch(/non-negative/);
  });
});

describe("leaderboard", () => {
  it("counts one win per comparison and replaces a changed vote", () => {
    const first = vote({ comparisonId: "round-1", winnerModelId: "openai/gpt-5-mini", createdAt: "2026-10-23T00:00:00.000Z" });
    const changed = vote({
      comparisonId: "round-1",
      winnerModelId: "google/gemini-3.8-flash",
      createdAt: "2026-10-23T00:01:00.000Z",
    });
    const second = vote({
      comparisonId: "round-2",
      winnerModelId: "google/gemini-3.8-flash",
      createdAt: "2026-10-23T00:02:00.000Z",
    });
    const rows = buildLeaderboard(upsertVote(upsertVote([first], changed), second), roster);
    const gemini = rows.find((row) => row.modelId === "google/gemini-3.8-flash");
    const gpt = rows.find((row) => row.modelId === "openai/gpt-5-mini");
    expect(gemini).toMatchObject({ wins: 2, comparisons: 2, winRate: 1 });
    expect(gpt).toMatchObject({ wins: 0, comparisons: 2, winRate: 0 });
    expect(rows[0]?.modelId).toBe("google/gemini-3.8-flash");
    expect(latestVotes([changed, first])).toHaveLength(1);
  });

  it("keeps an empty roster visible with zero wins", () => {
    expect(buildLeaderboard([], roster)).toHaveLength(3);
    expect(buildLeaderboard([], roster).every((row) => row.wins === 0)).toBe(true);
  });

  it("breaks equal win counts by win rate", () => {
    const rows = buildLeaderboard(
      [
        vote({
          comparisonId: "a",
          winnerModelId: "beta",
          modelIds: ["alpha", "beta"],
          createdAt: "2026-10-23T00:00:00.000Z",
        }),
        vote({
          comparisonId: "b",
          winnerModelId: "alpha",
          modelIds: ["alpha", "other"],
          createdAt: "2026-10-23T00:01:00.000Z",
        }),
      ],
      [
        { id: "alpha", label: "Alpha" },
        { id: "beta", label: "Beta" },
      ],
    );
    expect(rows.find((row) => row.modelId === "beta")).toMatchObject({ wins: 1, comparisons: 1, winRate: 1 });
    expect(rows.find((row) => row.modelId === "alpha")).toMatchObject({ wins: 1, comparisons: 2, winRate: 0.5 });
    expect(rows.map((row) => row.modelId)).toEqual(["beta", "alpha", "other"]);
  });
});

describe("local votes", () => {
  it("drops corrupt records and round-trips a valid vote", () => {
    const memory = new Map<string, string>();
    const store: KeyValueStore = {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => {
        memory.set(key, value);
      },
    };
    expect(readVotes(store)).toEqual([]);
    memory.set(VOTE_STORAGE_KEY, "{");
    expect(readVotes(store)).toEqual([]);
    const stored = vote({ comparisonId: "round-9", winnerModelId: "openai/gpt-5-mini" });
    writeVotes(store, [stored, { ...stored, comparisonId: "" } as Vote]);
    expect(readVotes(store)).toEqual([stored]);
    expect(isVote({ comparisonId: "ok", prompt: "", winnerModelId: "m", modelIds: ["m"], createdAt: "t" })).toBe(true);
  });
});

describe("demo transcript", () => {
  it("gives the default models different voices that include the prompt", () => {
    const prompt = "Explain CRDTs to a backend engineer.";
    const answers = ["openai/gpt-5-mini", "anthropic/claude-haiku-5.5", "google/gemini-3.8-flash"].map((id) =>
      demoAnswer(id, prompt),
    );
    expect(new Set(answers).size).toBe(3);
    expect(voiceFor("anthropic/claude-haiku-5.5")).toBe("essay");
    expect(voiceFor("google/gemini-3.8-flash")).toBe("bullets");
    expect(answers.every((answer) => answer.toLowerCase().includes("crdt"))).toBe(true);
  });

  it("ends a demo transcript with estimated usage", () => {
    const events = createDemoTranscript("openai/gpt-5-mini", "Write a haiku about a flaky deploy.", {
      inputPerMillion: 0.25,
      outputPerMillion: 2,
    });
    const done = events.at(-1);
    const text = events
      .filter((event) => event.type === "delta")
      .map((event) => (event.type === "delta" ? event.text : ""))
      .join("");
    expect(text).toBe(demoAnswer("openai/gpt-5-mini", "Write a haiku about a flaky deploy."));
    expect(done).toMatchObject({ type: "done", tokenSource: "estimate" });
    if (done?.type === "done") expect(done.costUsd).toBeGreaterThan(0);
  });
});

describe("stream events", () => {
  it("round-trips a delta that contains a newline", () => {
    const line = JSON.stringify({ type: "delta", text: "one\ntwo" });
    expect(line.includes("\n")).toBe(false);
    expect(parseEventLine(line)).toEqual({ type: "delta", text: "one\ntwo" });
    expect(parseEventLine("")).toBeNull();
    expect(parseEventLine("{")).toBeNull();
    expect(parseEventLine('{"type":"nope"}')).toBeNull();
  });
});

describe("round summary", () => {
  it("names the fastest first token and the cheapest estimate", () => {
    expect(
      summarizeRound([
        { label: "Slow", status: "done", ttftMs: 400, costUsd: 0.01 },
        { label: "Quick", status: "done", ttftMs: 120, costUsd: 0.02 },
        { label: "Cheap", status: "done", ttftMs: 200, costUsd: 0.001 },
        { label: "Waiting", status: "streaming", ttftMs: 10, costUsd: 0 },
      ]),
    ).toEqual({ fastestLabel: "Quick", cheapestLabel: "Cheap" });
  });
});

describe("errors and supabase rows", () => {
  it("redacts bearer tokens and long secrets", () => {
    expect(publicErrorMessage(new Error("denied Bearer sk-live-secret-value"))).not.toContain("secret-value");
    expect(publicErrorMessage("nope")).toBe("nope");
  });

  it("maps a vote to the arena_votes row and back", () => {
    const stored = vote({ comparisonId: "round-3", winnerModelId: "openai/gpt-5-mini" });
    expect(rowToVote(voteToRow(stored))).toEqual(stored);
  });
});
