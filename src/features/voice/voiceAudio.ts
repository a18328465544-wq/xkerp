export const VOICE_SAMPLE_RATE = 16_000;

/**
 * Resample mono float audio with a small box filter. Averaging the samples in
 * each target interval attenuates high-frequency aliasing when reducing a
 * browser's native 44.1/48 kHz capture to the ASR contract's 16 kHz.
 */
export function resampleMono(samples: Float32Array, sourceRate: number, targetRate = VOICE_SAMPLE_RATE) {
  if (!Number.isFinite(sourceRate) || sourceRate <= 0 || !Number.isFinite(targetRate) || targetRate <= 0) {
    throw new RangeError("音频采样率无效");
  }
  if (samples.length === 0) return new Float32Array();
  if (sourceRate === targetRate) return samples.slice();

  const ratio = sourceRate / targetRate;
  const output = new Float32Array(Math.floor(samples.length / ratio));
  for (let outputIndex = 0; outputIndex < output.length; outputIndex++) {
    const start = outputIndex * ratio;
    const end = Math.min(samples.length, (outputIndex + 1) * ratio);
    let weightedTotal = 0;
    let weightTotal = 0;
    for (let sourceIndex = Math.floor(start); sourceIndex < end; sourceIndex++) {
      const weight = Math.min(end, sourceIndex + 1) - Math.max(start, sourceIndex);
      weightedTotal += (samples[sourceIndex] ?? 0) * weight;
      weightTotal += weight;
    }
    output[outputIndex] = weightTotal > 0 ? weightedTotal / weightTotal : 0;
  }
  return output;
}

export function mergeFloatChunks(chunks: readonly Float32Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const merged = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

export function floatToPcm16(samples: Float32Array) {
  const pcm = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index++) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    pcm[index] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
  }
  return pcm;
}

export function encodeWavPcm16(samples: Int16Array, sampleRate = VOICE_SAMPLE_RATE) {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) throw new RangeError("音频采样率无效");
  const dataBytes = samples.length * Int16Array.BYTES_PER_ELEMENT;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let index = 0; index < samples.length; index++) view.setInt16(44 + index * 2, samples[index] ?? 0, true);
  return new Blob([buffer], {type: "audio/wav"});
}

export function encodeCapturedWav(chunks: readonly Float32Array[], sourceRate: number) {
  const merged = mergeFloatChunks(chunks);
  const resampled = resampleMono(merged, sourceRate, VOICE_SAMPLE_RATE);
  return encodeWavPcm16(floatToPcm16(resampled), VOICE_SAMPLE_RATE);
}
