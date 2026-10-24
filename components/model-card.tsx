import { AnswerText } from "@/components/answer-text";
import { formatDuration, formatTokens, formatUsd } from "@/lib/pricing";
import type { CardSnapshot, PublicModel } from "@/lib/types";

const STATUS_LABEL = {
  idle: "Ready",
  streaming: "Streaming",
  done: "Complete",
  error: "Needs attention",
} as const;

export function ModelCard({
  model,
  color,
  card,
  selected,
  disabled,
  onVote,
}: {
  model: PublicModel;
  color: string;
  card: CardSnapshot;
  selected: boolean;
  disabled: boolean;
  onVote: () => void;
}) {
  const tokenNote = card.tokenSource === "provider" ? "reported" : card.tokenSource === "estimate" ? "estimated" : null;

  return (
    <article
      className="flex min-h-[28rem] flex-col overflow-hidden rounded-3xl border bg-panel shadow-[var(--shadow)]"
      style={{
        borderColor: selected ? color : "var(--line)",
        boxShadow: selected ? `inset 0 0 0 1px ${color}, var(--shadow)` : "var(--shadow)",
      }}
    >
      <div className="h-1.5" style={{ backgroundColor: color }} />
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div>
          <p className="font-display text-2xl leading-none tracking-tight text-ink">{model.label}</p>
          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted">{model.provider}</p>
        </div>
        <p className="inline-flex items-center gap-2 text-sm text-muted">
          <span
            className={`h-1.5 w-1.5 rounded-full ${card.status === "streaming" ? "animate-pulse" : ""}`}
            style={{ backgroundColor: card.status === "error" ? "var(--accent)" : color }}
          />
          {STATUS_LABEL[card.status]}
        </p>
      </div>

      <div className="flex-1 px-5 py-5">
        {card.text ? (
          <div className={card.status === "streaming" ? "stream-caret" : undefined}>
            <AnswerText text={card.text} />
          </div>
        ) : (
          <p className="text-sm leading-6 text-muted">
            {card.status === "streaming" ? "Waiting for the first token…" : "This answer will stream here."}
          </p>
        )}
        {card.error ? <p className="mt-4 text-sm leading-6 text-accent">{card.error}</p> : null}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line px-5 py-4 font-mono text-xs text-muted">
        <Metric label="First token" value={formatDuration(card.ttftMs)} />
        <Metric label="Total" value={formatDuration(card.latencyMs)} />
        <Metric label="In tokens" value={formatTokens(card.inputTokens)} note={tokenNote} />
        <Metric label="Out tokens" value={formatTokens(card.outputTokens)} note={tokenNote} />
        <div className="col-span-2 flex items-baseline justify-between">
          <dt>Estimated cost</dt>
          <dd className="text-sm text-ink">{formatUsd(card.costUsd)}</dd>
        </div>
      </dl>

      <div className="px-5 pb-5">
        <button
          type="button"
          role="radio"
          aria-checked={selected}
          disabled={disabled}
          onClick={onVote}
          className="w-full rounded-full border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
          style={
            selected
              ? { backgroundColor: color, borderColor: color, color: "#fffdf8" }
              : { borderColor: "var(--line)", color: "var(--ink)", backgroundColor: "transparent" }
          }
        >
          {selected ? "Your pick" : "Prefer this answer"}
        </button>
      </div>
    </article>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <dt>
        {label}
        {note ? <span className="text-[10px] uppercase tracking-wider"> · {note}</span> : null}
      </dt>
      <dd className="text-sm text-ink tabular-nums">{value}</dd>
    </div>
  );
}
