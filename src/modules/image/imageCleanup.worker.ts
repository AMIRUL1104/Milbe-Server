import { retryPendingImageCleanup } from "./image.service.js";

const POLL_INTERVAL_MS = 60_000;

export const startImageCleanupWorker = (): (() => void) => {
  let stopped = false;
  let running = false;

  const poll = async (): Promise<void> => {
    if (stopped || running) return;
    running = true;
    try {
      await retryPendingImageCleanup();
    } catch (error) {
      console.error("[image-assets] Cleanup worker polling failed.", error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void poll();
  }, POLL_INTERVAL_MS);
  timer.unref();
  void poll();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
};
