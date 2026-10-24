import { streamText } from "ai";

import { getArenaConfig } from "@/lib/config";
import { chunkText, demoAnswer, demoPacing } from "@/lib/demo";
import { publicErrorMessage } from "@/lib/errors";
import { createEventStream, delay, jsonError, ndjsonResponse } from "@/lib/http";
import { estimateCostUsd, estimateTokens, priceFor } from "@/lib/pricing";
import { ARENA_INSTRUCTIONS } from "@/lib/prompt";
import { resolveLanguageModel } from "@/lib/provider";
import type { ArenaEvent } from "@/lib/types";

export const maxDuration = 60;

type ArenaRequest = {
  prompt?: unknown;
  modelId?: unknown;
};

function readBody(value: ArenaRequest, maxPromptChars: number): { prompt: string; modelId: string } | string {
  if (typeof value.prompt !== "string" || typeof value.modelId !== "string") {
    return "Send a prompt and a modelId.";
  }
  const prompt = value.prompt.trim();
  const modelId = value.modelId.trim();
  if (!prompt) return "Write a prompt before comparing.";
  if (prompt.length > maxPromptChars) return `Keep the prompt under ${maxPromptChars} characters.`;
  if (!modelId) return "Choose a model.";
  return { prompt, modelId };
}

export async function POST(request: Request) {
  let body: ArenaRequest;
  try {
    body = (await request.json()) as ArenaRequest;
  } catch {
    return jsonError("The request body must be JSON.", 400);
  }

  const config = getArenaConfig();
  const parsed = readBody(body, config.maxPromptChars);
  if (typeof parsed === "string") return jsonError(parsed, 400);

  const model = config.models.find((item) => item.id === parsed.modelId);
  if (!model) return jsonError("That model is not enabled.", 400);
  if (config.blocker) return jsonError(config.blocker, 503);

  const price = priceFor(model);
  const started = Date.now();
  const mode = config.mode;

  if (mode === "demo") {
    const stream = createEventStream(async (emit, signal) => {
      const answer = demoAnswer(model.id, parsed.prompt);
      const pacing = demoPacing(model.id);
      const chunks = chunkText(answer);
      let ttftMs: number | null = null;
      for (const text of chunks) {
        await delay(ttftMs == null ? pacing.initialMs : pacing.perChunkMs, signal);
        if (ttftMs == null) ttftMs = Date.now() - started;
        emit({ type: "delta", text });
      }
      const inputTokens = estimateTokens(`${ARENA_INSTRUCTIONS}\n${parsed.prompt}`);
      const outputTokens = estimateTokens(answer);
      emit({
        type: "done",
        ttftMs,
        latencyMs: Date.now() - started,
        inputTokens,
        outputTokens,
        tokenSource: "estimate",
        costUsd: estimateCostUsd(price, inputTokens, outputTokens),
      });
    }, request.signal);
    return ndjsonResponse(stream);
  }

  const stream = createEventStream(async (emit, signal) => {
    const result = streamText({
      model: resolveLanguageModel(mode, model.id),
      instructions: ARENA_INSTRUCTIONS,
      prompt: parsed.prompt,
      maxOutputTokens: config.maxOutputTokens,
      maxRetries: 0,
      abortSignal: signal,
      timeout: { totalMs: 50_000, firstChunkMs: 25_000 },
    });

    let text = "";
    let ttftMs: number | null = null;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;

    for await (const part of result.stream) {
      if (signal.aborted) return;
      if (part.type === "text-delta") {
        if (ttftMs == null) ttftMs = Date.now() - started;
        text += part.text;
        emit({ type: "delta", text: part.text });
      } else if (part.type === "error") {
        emit({ type: "error", message: publicErrorMessage(part.error) });
        return;
      } else if (part.type === "finish") {
        inputTokens = part.totalUsage.inputTokens;
        outputTokens = part.totalUsage.outputTokens;
      }
    }

    const resolvedInput = inputTokens ?? estimateTokens(`${ARENA_INSTRUCTIONS}\n${parsed.prompt}`);
    const resolvedOutput = outputTokens ?? estimateTokens(text);
    const tokenSource = inputTokens != null && outputTokens != null ? "provider" : "estimate";
    const done: ArenaEvent = {
      type: "done",
      ttftMs,
      latencyMs: Date.now() - started,
      inputTokens: resolvedInput,
      outputTokens: resolvedOutput,
      tokenSource,
      costUsd: estimateCostUsd(price, resolvedInput, resolvedOutput),
    };
    emit(done);
  }, request.signal);

  return ndjsonResponse(stream);
}
