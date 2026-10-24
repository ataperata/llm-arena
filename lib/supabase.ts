import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { latestVotes } from "@/lib/leaderboard";
import type { Vote } from "@/lib/types";

type Env = Record<string, string | undefined>;

function read(env: Env, name: string): string | undefined {
  const value = env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

type VoteRow = {
  comparison_id: string;
  prompt: string;
  winner_model_id: string;
  model_ids: string[];
  created_at: string;
};

export function getSupabase(env: Env = process.env): SupabaseClient {
  const url = read(env, "SUPABASE_URL");
  const key = read(env, "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function voteToRow(vote: Vote): VoteRow {
  return {
    comparison_id: vote.comparisonId,
    prompt: vote.prompt,
    winner_model_id: vote.winnerModelId,
    model_ids: vote.modelIds,
    created_at: vote.createdAt,
  };
}

export function rowToVote(row: VoteRow): Vote {
  return {
    comparisonId: row.comparison_id,
    prompt: row.prompt,
    winnerModelId: row.winner_model_id,
    modelIds: row.model_ids ?? [],
    createdAt: row.created_at,
  };
}

export async function saveVote(vote: Vote, env: Env = process.env): Promise<void> {
  const supabase = getSupabase(env);
  const { error } = await supabase.from("arena_votes").upsert(voteToRow(vote), {
    onConflict: "comparison_id",
  });
  if (error) throw new Error(error.message);
}

export async function listVotes(env: Env = process.env): Promise<Vote[]> {
  const supabase = getSupabase(env);
  const { data, error } = await supabase
    .from("arena_votes")
    .select("comparison_id, prompt, winner_model_id, model_ids, created_at")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);
  const votes = (data ?? []).map((row) => rowToVote(row as VoteRow));
  return latestVotes(votes);
}
