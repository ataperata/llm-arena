import { createOpenAI } from "@ai-sdk/openai";
import { gateway } from "ai";

import type { ProviderMode } from "@/lib/types";

type Env = Record<string, string | undefined>;

function read(env: Env, name: string): string | undefined {
  const value = env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function resolveLanguageModel(mode: Exclude<ProviderMode, "demo">, modelId: string, env: Env = process.env) {
  if (mode === "gateway") {
    return gateway(modelId);
  }

  const baseURL = read(env, "OPENAI_COMPATIBLE_BASE_URL");
  const apiKey = read(env, "OPENAI_COMPATIBLE_API_KEY");
  if (!baseURL || !apiKey) {
    throw new Error(
      "OpenAI-compatible mode needs OPENAI_COMPATIBLE_BASE_URL and OPENAI_COMPATIBLE_API_KEY.",
    );
  }

  const client = createOpenAI({
    baseURL: baseURL.replace(/\/$/, ""),
    apiKey,
    name: "openai-compatible",
  });
  // Chat Completions, so OpenAI-compatible gateways do not need the Responses API.
  return client.chat(modelId);
}
