export interface VoiceVadOptions {
  threshold?: number;
  silenceMs?: number;
}

/**
 * Silence stop is deliberately gated on hearing speech once, so a quiet room
 * or slow start does not immediately cancel a toggle recording.
 */
export function createVoiceVad({threshold = 0.025, silenceMs = 1_500}: VoiceVadOptions = {}) {
  let speechDetected = false;
  let quietSince: number | null = null;

  return {
    update(level: number, elapsedMs: number) {
      if (!Number.isFinite(level) || !Number.isFinite(elapsedMs)) return false;
      if (level >= threshold) {
        speechDetected = true;
        quietSince = null;
        return false;
      }
      if (!speechDetected) return false;
      quietSince ??= elapsedMs;
      return elapsedMs - quietSince >= silenceMs;
    },
    reset() {
      speechDetected = false;
      quietSince = null;
    },
  };
}
