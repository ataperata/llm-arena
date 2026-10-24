import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";

import { LeaderboardApp } from "@/components/leaderboard-app";
import { getPublicConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: "Leaderboard",
};

export default function LeaderboardPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <section>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Standings</p>
        <h1 className="mt-3 font-display text-4xl tracking-tight text-ink sm:text-6xl">Leaderboard</h1>
      </section>
      <Suspense fallback={<div className="h-48 animate-pulse rounded-3xl border border-line bg-panel" aria-hidden="true" />}>
        <LeaderboardLoader />
      </Suspense>
    </div>
  );
}

async function LeaderboardLoader() {
  await connection();
  return <LeaderboardApp config={getPublicConfig()} />;
}
