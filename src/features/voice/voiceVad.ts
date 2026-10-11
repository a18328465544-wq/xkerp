export interface VoiceVadOptions {
  threshold?: number;
  silenceMs?: number;
  calibrationMs?: number;
}

export const VOICE_VAD_CALIBRATION_MS = 400;
const VOICE_VAD_SETTLE_MS = 80;
const VOICE_VAD_MIN_THRESHOLD = 0.045;
const VOICE_VAD_MAX_THRESHOLD = 0.16;

export function estimateVoiceVadThreshold(noiseLevels: readonly number[]) {
  const sorted = noiseLevels.filter((level) => Number.isFinite(level) && level >= 0).map((level) => Math.min(1, level)).sort((left, right) => left - right);
  const position = (sorted.length - 1) * 0.25;
  const lowerIndex = Math.floor(position);
  const lower = sorted[lowerIndex] ?? 0;
  const upper = sorted[Math.min(lowerIndex + 1, sorted.length - 1)] ?? lower;
  const noiseFloor = lower + (upper - lower) * (position - lowerIndex);
  return Math.min(VOICE_VAD_MAX_THRESHOLD, Math.max(VOICE_VAD_MIN_THRESHOLD, noiseFloor * 1.7 + 0.025));
}

/**
 * Calibrates against the lower quartile of the first 400ms so steady fan and
 * test-device noise does not become speech. Speech silence is only tracked
 * after the calibrated threshold has been crossed at least once.
 */
export function createVoiceVad({threshold, silenceMs = 1_500, calibrationMs = VOICE_VAD_CALIBRATION_MS}: VoiceVadOptions = {}) {
  let speechDetected = false;
  let quietSince: number | null = null;
  let activeThreshold = threshold;
  let noiseSamples: number[] = [];

  return {
    update(level: number, elapsedMs: number) {
      if (!Number.isFinite(level) || level < 0 || !Number.isFinite(elapsedMs) || elapsedMs < 0) return false;
      if (activeThreshold === undefined) {
        if (elapsedMs >= VOICE_VAD_SETTLE_MS) noiseSamples.push(Math.min(1, level));
        if (elapsedMs < calibrationMs) return false;
        activeThreshold = estimateVoiceVadThreshold(noiseSamples);
        noiseSamples = [];
      }
      if (level >= activeThreshold) {
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
      activeThreshold = threshold;
      noiseSamples = [];
    },
  };
}
