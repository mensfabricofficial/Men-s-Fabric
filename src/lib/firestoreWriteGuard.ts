// Global lightweight circuit-breaker & error helper for Firestore write rate limits
// Prevents background telemetry, heartbeats, and duplicate feed mirrors from
// piling onto Firestore's write queue if the database reports `resource-exhausted`.

let writeBackoffUntilMs = 0;

export const isFirestoreRateLimitError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  const code = String(e.code || '').toLowerCase();
  const msg = String(e.message || '').toLowerCase();
  return (
    code.includes('resource-exhausted') ||
    msg.includes('resource-exhausted') ||
    msg.includes('maximum bandwidth for writes') ||
    msg.includes('quota exceeded')
  );
};

export const isFirestoreWriteBackedOff = (): boolean => {
  return Date.now() < writeBackoffUntilMs;
};

export const markFirestoreWriteError = (err: unknown, cooldownMs = 180_000): boolean => {
  if (isFirestoreRateLimitError(err)) {
    const nextUntil = Date.now() + cooldownMs;
    if (nextUntil > writeBackoffUntilMs) {
      writeBackoffUntilMs = nextUntil;
    }
    return true;
  }
  return false;
};

export const resetFirestoreWriteBackoff = (): void => {
  writeBackoffUntilMs = 0;
};
