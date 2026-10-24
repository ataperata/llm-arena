import { isAbortError, publicErrorMessage } from "@/lib/errors";
import { encodeEvent } from "@/lib/stream";
import type { ArenaEvent } from "@/lib/types";

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export function ndjsonResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export function createEventStream(
  produce: (emit: (event: ArenaEvent) => void, signal: AbortSignal) => Promise<void>,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const emit = (event: ArenaEvent) => {
        if (signal.aborted) return;
        controller.enqueue(encoder.encode(encodeEvent(event)));
      };
      try {
        await produce(emit, signal);
      } catch (error) {
        if (!isAbortError(error) && !signal.aborted) {
          emit({ type: "error", message: publicErrorMessage(error) });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // The client may already have cancelled the stream.
        }
      }
    },
  });
}

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
