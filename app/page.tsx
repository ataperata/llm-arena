import { Suspense } from "react";
import { connection } from "next/server";

import { ArenaApp } from "@/components/arena-app";
import { getPublicConfig } from "@/lib/config";

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <section className="max-w-3xl">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">One prompt, several models</p>
        <h1 className="mt-3 font-display text-4xl leading-[0.95] tracking-tight text-balance text-ink sm:text-6xl">
          Compare answers, <span className="italic text-accent">side by side.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted sm:text-lg">
          The same prompt streams from each model at once, with time to first token, total time, token counts, and a
          rough cost. Then pick the answer you would actually use.
        </p>
      </section>
      <Suspense fallback={<ComposerSkeleton />}>
        <ArenaLoader />
      </Suspense>
    </div>
  );
}

async function ArenaLoader() {
  await connection();
  return <ArenaApp config={getPublicConfig()} />;
}

function ComposerSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="h-64 animate-pulse rounded-3xl border border-line bg-panel" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="h-80 animate-pulse rounded-3xl border border-line bg-panel" />
        <div className="h-80 animate-pulse rounded-3xl border border-line bg-panel" />
        <div className="hidden h-80 animate-pulse rounded-3xl border border-line bg-panel xl:block" />
      </div>
    </div>
  );
}
