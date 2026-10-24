import { estimateCostUsd, estimateTokens, type TokenPrice } from "@/lib/pricing";
import { ARENA_INSTRUCTIONS } from "@/lib/prompt";
import type { ArenaEvent } from "@/lib/types";
import { encodeEvent } from "@/lib/stream";

type Voice = "decisive" | "essay" | "bullets";

type Notes = {
  gist: string;
  points: [string, string, string];
  caveat: string;
};

const CLOSERS = [
  "Check the answer against one real example before you adopt it.",
  "The useful version is the one you can explain back in a sentence.",
  "If two options look equal, pick the one that is easier to undo.",
  "Stop once the next detail would not change the decision.",
];

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function voiceFor(modelId: string): Voice {
  const id = modelId.toLowerCase();
  if (id.includes("claude") || id.includes("anthropic")) return "essay";
  if (id.includes("gemini") || id.includes("google")) return "bullets";
  if (id.includes("gpt") || id.includes("openai")) return "decisive";
  const voices: Voice[] = ["decisive", "essay", "bullets"];
  return voices[hash(modelId) % voices.length] ?? "decisive";
}

export function demoPacing(modelId: string): { initialMs: number; perChunkMs: number } {
  const voice = voiceFor(modelId);
  if (voice === "bullets") return { initialMs: 160, perChunkMs: 18 };
  if (voice === "essay") return { initialMs: 420, perChunkMs: 28 };
  return { initialMs: 260, perChunkMs: 22 };
}

function snippet(prompt: string): string {
  const clean = prompt.replace(/\s+/g, " ").trim();
  return clean.length > 160 ? `${clean.slice(0, 157)}…` : clean;
}

function notesFor(prompt: string): Notes {
  const text = prompt.toLowerCase();
  if (text.includes("crdt")) {
    return {
      gist: "A CRDT lets replicas apply updates in different orders and still converge, without a central lock.",
      points: [
        "Each update carries enough identity (an id, a counter, or a position) that every replica can merge it.",
        "Operation-based CRDTs send the operation; state-based CRDTs send a mergeable state. Both need an associative, commutative, idempotent merge.",
        "The hard part is the user-facing meaning: tombstones for deletes, stable positions for text, and a bound on metadata growth.",
      ],
      caveat: "Convergence does not mean the merge matches human intent. Concurrent edits can still produce a result nobody typed.",
    };
  }
  if (text.includes("haiku") || text.includes("poem")) {
    return {
      gist: "Keep the image small, the turn in the last line, and the deploy's near-miss as the subject.",
      points: [
        "Five syllables: the green build that was not actually green.",
        "Seven: a flaky test, a timeout, a migration that almost locked the table.",
        "Five: the rollback that made the room quiet again.",
      ],
      caveat: "A haiku can name the incident. It should not invent a postmortem.",
    };
  }
  if (text.includes("bill") || text.includes("split") || text.includes("dessert")) {
    return {
      gist: "Split the shared dish by who agreed to it, then split the rest by what each person ordered.",
      points: [
        "Price the shared dessert once and divide it only across the people who wanted it.",
        "Add tax and tip on the subtotal each person is responsible for, not as a flat fee on the most expensive plate.",
        "Round the last cent onto the largest share so the parts still sum to the check.",
      ],
      caveat: "A fair split is the one the table can audit in a minute. Perfect fairness that needs a spreadsheet will not get used.",
    };
  }
  if (text.includes("sql") || text.includes("index")) {
    return {
      gist: "Index the columns the query filters, joins, and sorts — in an order that matches the most selective predicate first.",
      points: [
        "A btree index helps equality and range filters. It does not help a leading wildcard or a function wrapped around the column unless the index matches that expression.",
        "Composite order matters: the leftmost columns should be the ones you constrain with equality.",
        "Read the plan. If the planner still scans, the index is missing, not selective enough, or losing to a cheaper sequential read on a small table.",
      ],
      caveat: "Every extra index slows writes. Add the one the slow query needs, then stop.",
    };
  }
  const subject = snippet(prompt);
  return {
    gist: `Treat “${subject}” as a decision with a constraint, then answer that decision directly.`,
    points: [
      "Restate the goal in one sentence that someone could mark true or false.",
      "Choose the smallest mechanism that meets the goal, and name what it deliberately does not do.",
      "Give one worked example in the vocabulary of the question, plus the failure that example hides.",
    ],
    caveat: "If the cost of being wrong is high, verify the specific number, API, or policy instead of stopping at a first-pass explanation.",
  };
}

function closer(modelId: string, prompt: string): string {
  return CLOSERS[hash(`${modelId}\n${prompt}`) % CLOSERS.length] ?? CLOSERS[0];
}

export function demoAnswer(modelId: string, prompt: string): string {
  const notes = notesFor(prompt);
  const extra = closer(modelId, prompt);
  const voice = voiceFor(modelId);

  if (voice === "essay") {
    return [
      notes.gist,
      "",
      `${notes.points[0]} ${notes.points[1]} ${notes.points[2]}`,
      "",
      `${notes.caveat} ${extra}`,
    ].join("\n");
  }

  if (voice === "bullets") {
    return [
      notes.gist,
      "",
      ...notes.points.map((point) => `• ${point}`),
      "",
      `Watch-out: ${notes.caveat}`,
      extra,
    ].join("\n");
  }

  return [
    notes.gist,
    "",
    ...notes.points.map((point, index) => `${index + 1}. ${point}`),
    "",
    `Tradeoff: ${notes.caveat} ${extra}`,
  ].join("\n");
}

export function chunkText(text: string, size = 14): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

export function createDemoTranscript(
  modelId: string,
  prompt: string,
  price: TokenPrice | null,
): ArenaEvent[] {
  const answer = demoAnswer(modelId, prompt);
  const pacing = demoPacing(modelId);
  const chunks = chunkText(answer);
  const inputTokens = estimateTokens(`${ARENA_INSTRUCTIONS}\n${prompt}`);
  const outputTokens = estimateTokens(answer);
  const events: ArenaEvent[] = chunks.map((text) => ({ type: "delta", text }));
  events.push({
    type: "done",
    ttftMs: pacing.initialMs,
    latencyMs: pacing.initialMs + Math.max(0, chunks.length - 1) * pacing.perChunkMs,
    inputTokens,
    outputTokens,
    tokenSource: "estimate",
    costUsd: estimateCostUsd(price, inputTokens, outputTokens),
  });
  return events;
}

export function encodeTranscript(events: ArenaEvent[]): string {
  return events.map((event) => encodeEvent(event)).join("");
}
