import { runnableSmartStatuses } from "../../domain/smart-generation.js";
import type { SmartGenerationService } from "./smart-generation-service.js";

/** Backend production worker. Closing a browser tab does not stop a persisted run. */
export function startSmartGenerationWorker(service: SmartGenerationService, options: {
  intervalMs?: number; onError?: (error: unknown) => void
} = {}): () => void {
  let stopped = false, working = false;
  const tick = async () => {
    if (stopped || working) return;
    working = true;
    try {
      for (const original of await service.list()) {
        if (stopped) break;
        let run = original;
        // Advance bounded non-paid planning stages promptly, but poll the provider only once per tick.
        for (let steps = 0; steps < 20 && runnableSmartStatuses.includes(run.status) && !stopped; steps++) {
          const generation = run.status === "GENERATING";
          try { run = await service.advance(run.projectId, run.id); }
          catch (error) { options.onError?.(error); break; }
          if (generation) break;
        }
      }
    } catch (error) { options.onError?.(error); }
    finally { working = false; }
  };
  const timer = setInterval(() => { void tick(); }, Math.max(1000, options.intervalMs ?? 5000));
  timer.unref();
  void service.recoverAbandoned().then(tick).catch((error) => options.onError?.(error));
  return () => { stopped = true; clearInterval(timer); };
}
