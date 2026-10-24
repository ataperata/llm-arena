export type RoundCard = {
  label: string;
  status: "idle" | "streaming" | "done" | "error";
  ttftMs: number | null;
  costUsd: number | null;
};

export type RoundSummary = {
  fastestLabel: string | null;
  cheapestLabel: string | null;
};

export function summarizeRound(cards: RoundCard[]): RoundSummary {
  const finished = cards.filter((card) => card.status === "done" || card.status === "error");
  let fastest: RoundCard | null = null;
  let cheapest: RoundCard | null = null;
  for (const card of finished) {
    if (card.ttftMs != null && (fastest?.ttftMs == null || card.ttftMs < fastest.ttftMs)) {
      fastest = card;
    }
    if (card.costUsd != null && (cheapest?.costUsd == null || card.costUsd < cheapest.costUsd)) {
      cheapest = card;
    }
  }
  return {
    fastestLabel: fastest?.label ?? null,
    cheapestLabel: cheapest?.label ?? null,
  };
}
