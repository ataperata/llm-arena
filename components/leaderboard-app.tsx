"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { buildLeaderboard } from "@/lib/leaderboard";
import type { LeaderboardRow, PublicArenaConfig } from "@/lib/types";
import { parseStoredVotes, VOTE_STORAGE_KEY, writeVotes } from "@/lib/votes";

function subscribeVotes(onStoreChange: () => void) {
  window.addEventListener("arena-votes", onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener("arena-votes", onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function voteSnapshot() {
  try {
    return localStorage.getItem(VOTE_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function LeaderboardApp({ config }: { config: PublicArenaConfig }) {
  const stored = useSyncExternalStore(subscribeVotes, voteSnapshot, () => "");
  const roster = useMemo(
    () => config.models.map((model) => ({ id: model.id, label: model.label })),
    [config.models],
  );
  const localRows = useMemo(() => buildLeaderboard(parseStoredVotes(stored), roster), [stored, roster]);
  const [remoteRows, setRemoteRows] = useState<LeaderboardRow[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const modelKey = roster.map((model) => model.id).join("|");

  useEffect(() => {
    if (config.storage !== "supabase") return;
    let cancelled = false;
    void fetch("/api/leaderboard")
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | { rows?: LeaderboardRow[]; error?: string }
          | null;
        if (!response.ok || !payload?.rows) {
          throw new Error(payload?.error || "The shared leaderboard is unavailable.");
        }
        return payload.rows;
      })
      .then((rows) => {
        if (!cancelled) setRemoteRows(rows);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setNotice(error instanceof Error ? error.message : "Showing votes saved on this device.");
      });
    return () => {
      cancelled = true;
    };
  }, [config.storage, modelKey]);

  const showingShared = config.storage === "supabase" && remoteRows !== null;
  const rows = showingShared ? remoteRows : localRows;
  const ranked = rows.filter((row) => row.comparisons > 0);
  const maxWins = ranked.reduce((max, row) => Math.max(max, row.wins), 0);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="text-base leading-7 text-muted">
          {showingShared
            ? "Wins from the shared board. A changed vote replaces the earlier one for that round."
            : config.storage === "supabase"
              ? "Checking the shared board. Votes on this device are shown until it responds."
              : "Wins saved in this browser. Nothing is sent to a server unless shared storage is configured."}
        </p>
        {notice ? <p className="mt-3 text-sm text-accent">{notice}</p> : null}
      </section>

      {ranked.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line bg-panel px-6 py-12 text-center">
          <p className="font-display text-3xl text-ink">No votes yet.</p>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
            Run a comparison and prefer an answer. The model you pick takes the round.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink"
          >
            Compare a prompt
          </Link>
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {ranked.map((row, index) => (
            <li key={row.modelId} className="rounded-3xl border border-line bg-panel px-5 py-4">
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted">#{index + 1}</p>
                  <h2 className="font-display text-2xl tracking-tight text-ink">{row.label}</h2>
                </div>
                <p className="font-mono text-sm text-ink tabular-nums">
                  {row.wins} {row.wins === 1 ? "win" : "wins"} · {Math.round(row.winRate * 100)}%
                </p>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${maxWins === 0 ? 0 : (row.wins / maxWins) * 100}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted">
                Appeared in {row.comparisons} {row.comparisons === 1 ? "comparison" : "comparisons"}.
              </p>
            </li>
          ))}
        </ol>
      )}

      {config.storage === "local" && ranked.length > 0 ? (
        <button
          type="button"
          className="self-start text-sm text-muted underline decoration-line underline-offset-4"
          onClick={() => {
            if (!confirmClear) {
              setConfirmClear(true);
              return;
            }
            writeVotes(window.localStorage, []);
            setConfirmClear(false);
          }}
        >
          {confirmClear ? "Clear every vote on this device" : "Clear local votes"}
        </button>
      ) : null}
    </div>
  );
}
