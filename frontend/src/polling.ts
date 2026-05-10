// ── Polling manager ───────────────────────────────────────────────
// 10s interval when tab visible and user active.
// 30s interval after 5 minutes of user inactivity.
// Paused when tab hidden (Page Visibility API).
// Stops permanently when session is finalized.

export interface PollingOptions {
  onFetch: () => Promise<void>;
  onStop?: () => void;
}

const ACTIVE_INTERVAL_MS = 10_000;
const INACTIVE_INTERVAL_MS = 30_000;
const INACTIVITY_THRESHOLD_MS = 5 * 60 * 1000;

export function createPoller(options: PollingOptions) {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let lastActivityAt = Date.now();

  function updateActivity(): void {
    lastActivityAt = Date.now();
  }

  function isInactive(): boolean {
    return Date.now() - lastActivityAt >= INACTIVITY_THRESHOLD_MS;
  }

  function getInterval(): number {
    return isInactive() ? INACTIVE_INTERVAL_MS : ACTIVE_INTERVAL_MS;
  }

  function scheduleNext(): void {
    if (stopped) return;
    timerId = setTimeout(async () => {
      if (stopped || document.hidden) {
        scheduleNext();
        return;
      }
      try { await options.onFetch(); } catch { /* errors handled by caller */ }
      scheduleNext();
    }, getInterval());
  }

  function start(): void {
    if (stopped) return;
    scheduleNext();
    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('mousemove', updateActivity);
    document.addEventListener('keydown', updateActivity);
    document.addEventListener('touchstart', updateActivity);
  }

  function stop(): void {
    stopped = true;
    if (timerId !== null) { clearTimeout(timerId); timerId = null; }
    document.removeEventListener('visibilitychange', handleVisibility);
    document.removeEventListener('mousemove', updateActivity);
    document.removeEventListener('keydown', updateActivity);
    document.removeEventListener('touchstart', updateActivity);
    options.onStop?.();
  }

  function handleVisibility(): void {
    if (!document.hidden && !stopped) {
      // Tab became visible — fetch immediately then resume schedule
      options.onFetch().catch(() => {});
    }
  }

  return { start, stop, updateActivity };
}
