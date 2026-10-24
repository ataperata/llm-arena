import { connection } from "next/server";

import { getArenaConfig } from "@/lib/config";
import { jsonError } from "@/lib/http";
import { saveVote } from "@/lib/supabase";
import { isVote } from "@/lib/votes";

export async function POST(request: Request) {
  await connection();
  const config = getArenaConfig();
  if (config.storage !== "supabase") {
    return jsonError("Shared voting is not configured. Votes stay in this browser.", 409);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("The request body must be JSON.", 400);
  }
  if (!isVote(body) || !body.prompt.trim()) {
    return jsonError("That vote is missing a comparison, prompt, or winner.", 400);
  }

  const enabled = new Set(config.models.map((model) => model.id));
  if (!enabled.has(body.winnerModelId) || body.modelIds.some((id) => !enabled.has(id))) {
    return jsonError("That vote names a model that is not enabled.", 400);
  }
  if (!body.modelIds.includes(body.winnerModelId)) {
    return jsonError("The winner has to be one of the models in the comparison.", 400);
  }
  if (body.prompt.length > config.maxPromptChars) {
    return jsonError("That prompt is too long to store.", 400);
  }

  try {
    await saveVote(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The shared leaderboard rejected the vote.";
    return jsonError(message, 502);
  }

  return Response.json({ ok: true });
}
