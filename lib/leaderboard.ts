import type { LeaderboardRow, Vote } from "@/lib/types";

export type RosterEntry = {
  id: string;
  label: string;
};

export function latestVotes(votes: Vote[]): Vote[] {
  const sorted = [...votes].sort((a, b) => {
    const byTime = a.createdAt.localeCompare(b.createdAt);
    if (byTime !== 0) return byTime;
    return a.comparisonId.localeCompare(b.comparisonId);
  });
  const byComparison = new Map<string, Vote>();
  for (const vote of sorted) byComparison.set(vote.comparisonId, vote);
  return [...byComparison.values()];
}

export function upsertVote(votes: Vote[], next: Vote): Vote[] {
  return [...votes.filter((vote) => vote.comparisonId !== next.comparisonId), next];
}

export function buildLeaderboard(votes: Vote[], roster: RosterEntry[] = []): LeaderboardRow[] {
  const rows = new Map<string, LeaderboardRow>();

  const ensure = (modelId: string, label?: string) => {
    const existing = rows.get(modelId);
    if (existing) {
      if (label && existing.label === modelId) existing.label = label;
      return existing;
    }
    const row: LeaderboardRow = {
      modelId,
      label: label ?? modelId,
      wins: 0,
      comparisons: 0,
      winRate: 0,
    };
    rows.set(modelId, row);
    return row;
  };

  for (const model of roster) ensure(model.id, model.label);

  for (const vote of latestVotes(votes)) {
    const contenders = new Set(vote.modelIds.filter(Boolean));
    contenders.add(vote.winnerModelId);
    for (const modelId of contenders) {
      const row = ensure(modelId);
      row.comparisons += 1;
      if (modelId === vote.winnerModelId) row.wins += 1;
    }
  }

  for (const row of rows.values()) {
    row.winRate = row.comparisons === 0 ? 0 : row.wins / row.comparisons;
  }

  return [...rows.values()].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    return a.label.localeCompare(b.label);
  });
}
