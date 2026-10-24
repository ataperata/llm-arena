"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { ModelCard } from "@/components/model-card";
import { isAbortError, publicErrorMessage } from "@/lib/errors";
import { upsertVote } from "@/lib/leaderboard";
import { estimateCostUsd, estimateTokens, priceFor } from "@/lib/pricing";
import { ARENA_INSTRUCTIONS } from "@/lib/prompt";
import { parseEventLine } from "@/lib/stream";
import { summarizeRound } from "@/lib/summary";
import type { CardSnapshot, PublicArenaConfig, PublicModel } from "@/lib/types";
import { readVotes, writeVotes } from "@/lib/votes";

const EXAMPLES = [
  "Explain CRDTs to a backend engineer in one tight paragraph.",
  "Write a haiku about a deploy that almost failed.",
  "What's a fair way to split a restaurant bill when three people shared one dessert?",
];

const COLORS = ["#c4622d", "#1f7a6b", "#355c9a", "#8d4e7a", "#8a6232", "#3f6b4e"];

const MODE_LABEL = {
  demo: "Demo mode · mocked streams",
  gateway: "Live · Vercel AI Gateway",
  "openai-compatible": "Live · OpenAI-compatible endpoint",
} as const;

function emptyCard(): CardSnapshot {
  return {
    status: "idle",
    text: "",
    ttftMs: null,
    latencyMs: null,
    inputTokens: null,
    outputTokens: null,
    tokenSource: null,
    costUsd: null,
    error: null,
  };
}

export function ArenaApp({ config }: { config: PublicArenaConfig }) {
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [comparisonId, setComparisonId] = useState<string | null>(null);
  const [activePrompt, setActivePrompt] = useState<string | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [voteNote, setVoteNote] = useState<string | null>(null);
  const [cards, setCards] = useState<Record<string, CardSnapshot>>(() =>
    Object.fromEntries(config.models.map((model) => [model.id, emptyCard()])),
  );
  const runRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const summary = useMemo(
    () =>
      summarizeRound(
        config.models.map((model) => ({
          label: model.label,
          status: cards[model.id]?.status ?? "idle",
          ttftMs: cards[model.id]?.ttftMs ?? null,
          costUsd: cards[model.id]?.costUsd ?? null,
        })),
      ),
    [cards, config.models],
  );

  function setCard(runId: number, id: string, update: (card: CardSnapshot) => CardSnapshot) {
    setCards((current) => {
      if (runId !== runRef.current) return current;
      const card = current[id];
      if (!card) return current;
      return { ...current, [id]: update(card) };
    });
  }

  async function consume(model: PublicModel, text: string, runId: number, signal: AbortSignal) {
    const inputTokens = estimateTokens(`${ARENA_INSTRUCTIONS}\n${text}`);
    setCard(runId, model.id, () => ({
      ...emptyCard(),
      status: "streaming",
      inputTokens,
      tokenSource: "estimate",
    }));

    try {
      const response = await fetch("/api/arena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, modelId: model.id }),
        signal,
      });
      if (runId !== runRef.current) return;
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setCard(runId, model.id, (card) => ({
          ...card,
          status: "error",
          error: payload?.error || `The request failed (${response.status}).`,
        }));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const event = parseEventLine(line);
          if (!event || runId !== runRef.current) continue;
          if (event.type === "delta") {
            setCard(runId, model.id, (card) => {
              const nextText = card.text + event.text;
              const outputTokens = estimateTokens(nextText);
              return {
                ...card,
                text: nextText,
                outputTokens,
                costUsd: estimateCostUsd(priceFor(model), card.inputTokens ?? inputTokens, outputTokens),
              };
            });
          } else if (event.type === "done") {
            finished = true;
            setCard(runId, model.id, (card) => ({
              ...card,
              status: "done",
              ttftMs: event.ttftMs,
              latencyMs: event.latencyMs,
              inputTokens: event.inputTokens,
              outputTokens: event.outputTokens,
              tokenSource: event.tokenSource,
              costUsd: event.costUsd,
              error: null,
            }));
          } else {
            finished = true;
            setCard(runId, model.id, (card) => ({
              ...card,
              status: card.text ? "done" : "error",
              error: event.message,
            }));
          }
        }
      }
      if (!finished) {
        setCard(runId, model.id, (card) => ({
          ...card,
          status: card.text ? "done" : "error",
          error: card.text ? "The stream ended early." : "The stream ended before a response arrived.",
        }));
      }
    } catch (error) {
      if (isAbortError(error) || signal.aborted || runId !== runRef.current) return;
      setCard(runId, model.id, (card) => ({
        ...card,
        status: "error",
        error: publicErrorMessage(error),
      }));
    }
  }

  async function compare() {
    const text = prompt.trim();
    if (!text || running || config.blocker || config.models.length === 0) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const runId = runRef.current + 1;
    runRef.current = runId;
    setRunning(true);
    setWinnerId(null);
    setVoteNote(null);
    setActivePrompt(text);
    setComparisonId(crypto.randomUUID());
    setCards(Object.fromEntries(config.models.map((model) => [model.id, { ...emptyCard(), status: "streaming" }])));
    await Promise.all(config.models.map((model) => consume(model, text, runId, controller.signal)));
    if (runRef.current === runId) setRunning(false);
  }

  function stop() {
    runRef.current += 1;
    abortRef.current?.abort();
    setRunning(false);
    setCards((current) => {
      const next = { ...current };
      for (const [id, card] of Object.entries(current)) {
        if (card.status !== "streaming") continue;
        next[id] = {
          ...card,
          status: card.text ? "done" : "idle",
          error: card.text ? "Stopped early." : null,
        };
      }
      return next;
    });
  }

  function vote(modelId: string) {
    if (!comparisonId || !activePrompt) return;
    const nextVote = {
      comparisonId,
      prompt: activePrompt,
      winnerModelId: modelId,
      modelIds: config.models.map((model) => model.id),
      createdAt: new Date().toISOString(),
    };
    try {
      writeVotes(window.localStorage, upsertVote(readVotes(window.localStorage), nextVote));
    } catch {
      setVoteNote("This browser blocked local storage, so the vote was not saved.");
      return;
    }
    setWinnerId(modelId);
    if (config.storage !== "supabase") {
      setVoteNote("Saved on this device.");
      return;
    }
    setVoteNote("Saved on this device. Sharing it…");
    void fetch("/api/votes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextVote),
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          setVoteNote(payload?.error ?? "Saved on this device. The shared board rejected the vote.");
          return;
        }
        setVoteNote("Saved on this device and on the shared board.");
      })
      .catch(() => {
        setVoteNote("Saved on this device. The shared board could not be reached.");
      });
  }

  const gridClass =
    config.models.length === 2 ? "md:grid-cols-2" : config.models.length >= 3 ? "md:grid-cols-2 xl:grid-cols-3" : "";

  return (
    <div className="flex flex-col gap-8">
      <form
        className="rounded-3xl border border-line bg-panel p-4 shadow-[var(--shadow)] sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (running) stop();
          else void compare();
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-ink px-3 py-1 text-xs text-canvas">{MODE_LABEL[config.mode]}</span>
          {config.models.map((model, index) => (
            <span
              key={model.id}
              className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-ink"
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
              {model.label}
            </span>
          ))}
        </div>
        <label htmlFor="prompt" className="mt-4 block text-sm font-medium text-ink">
          Prompt
        </label>
        <textarea
          id="prompt"
          value={prompt}
          maxLength={config.maxPromptChars}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              if (!running) void compare();
            }
          }}
          placeholder="Ask for an explanation, a draft, a plan…"
          rows={5}
          className="mt-2 w-full resize-y bg-transparent text-base leading-7 text-ink outline-none placeholder:text-muted"
        />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                className="rounded-full border border-line px-3 py-1 text-left text-xs text-muted hover:text-ink"
                onClick={() => setPrompt(example)}
              >
                {example.length > 48 ? `${example.slice(0, 45)}…` : example}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <p className="font-mono text-xs text-muted tabular-nums">
              {prompt.trim().length}/{config.maxPromptChars}
            </p>
            <button
              type="submit"
              disabled={!running && (!prompt.trim() || Boolean(config.blocker))}
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              {running ? "Stop" : "Compare"}
            </button>
          </div>
        </div>
        {config.blocker ? <p className="mt-3 text-sm text-accent">{config.blocker}</p> : null}
        {config.pricingWarning ? <p className="mt-3 text-sm text-accent">{config.pricingWarning}</p> : null}
        {config.modelsTruncated ? (
          <p className="mt-3 text-sm text-muted">Only the first {config.models.length} models are shown.</p>
        ) : null}
      </form>

      <section aria-label="Model answers">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-3xl tracking-tight text-ink">This round</h2>
            {activePrompt ? <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">{activePrompt}</p> : null}
          </div>
          {summary.fastestLabel || summary.cheapestLabel ? (
            <p className="text-sm text-muted">
              {summary.fastestLabel ? <>Fastest first token: {summary.fastestLabel}</> : null}
              {summary.fastestLabel && summary.cheapestLabel ? " · " : null}
              {summary.cheapestLabel ? <>Lowest estimate: {summary.cheapestLabel}</> : null}
            </p>
          ) : null}
        </div>
        <div className={`grid grid-cols-1 gap-4 ${gridClass}`} role="radiogroup" aria-label="Preferred answer">
          {config.models.map((model, index) => {
            const card = cards[model.id] ?? emptyCard();
            const canVote = Boolean(comparisonId) && card.status === "done" && card.text.trim().length > 0;
            return (
              <ModelCard
                key={model.id}
                model={model}
                color={COLORS[index % COLORS.length] ?? COLORS[0]}
                card={card}
                selected={winnerId === model.id}
                disabled={!canVote}
                onVote={() => vote(model.id)}
              />
            );
          })}
        </div>
        {voteNote ? (
          <p className="mt-4 text-sm text-muted" role="status">
            {voteNote}{" "}
            <Link href="/leaderboard" className="text-ink underline decoration-accent underline-offset-4">
              See the leaderboard
            </Link>
          </p>
        ) : null}
      </section>
    </div>
  );
}
