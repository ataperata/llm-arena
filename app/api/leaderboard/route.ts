import { connection } from "next/server";

import { getArenaConfig } from "@/lib/config";
import { buildLeaderboard } from "@/lib/leaderboard";
import { jsonError } from "@/lib/http";
import { listVotes } from "@/lib/supabase";

export async function GET() {
  await connection();
  const config = getArenaConfig();
  if (config.storage !== "supabase") {
    return Response.json({ storage: "local", rows: null });
  }

  try {
    const votes = await listVotes();
    const rows = buildLeaderboard(
      votes,
      config.models.map((model) => ({ id: model.id, label: model.label })),
    );
    return Response.json({ storage: "supabase", rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The shared leaderboard is unavailable.";
    return jsonError(message, 502);
  }
}
