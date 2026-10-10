import assert from "node:assert/strict";
import test from "node:test";
import {encodeCapturedWav, encodeWavPcm16, floatToPcm16, mergeFloatChunks, resampleMono, VOICE_SAMPLE_RATE} from "./voiceAudio";

test("voice capture resamples a native mono stream to 16 kHz", () => {
  const input = new Float32Array([0, 0.25, 0.5, 0.75, 1, 0.75, 0.5, 0.25]);
  const output = resampleMono(input, 32_000);
  assert.equal(output.length, 4);
  assert.ok(output[0]! < output[1]!);
  assert.ok(output[2]! > output[3]!);
});

test("voice capture validates rates and handles empty or identical-rate audio", () => {
  assert.equal(resampleMono(new Float32Array(), 48_000).length, 0);
  assert.deepEqual(resampleMono(new Float32Array([0.2, -0.2]), VOICE_SAMPLE_RATE), new Float32Array([0.2, -0.2]));
  assert.throws(() => resampleMono(new Float32Array([0]), 0), /采样率/);
});

test("float samples clamp safely to signed 16-bit PCM", () => {
  assert.deepEqual([...floatToPcm16(new Float32Array([-1, -0.5, 0, 0.5, 1, 2]))], [-32768, -16384, 0, 16384, 32767, 32767]);
});

test("WAV output has a 44-byte mono PCM header at 16 kHz", async () => {
  const blob = encodeWavPcm16(new Int16Array([1, -2]));
  const bytes = new DataView(await blob.arrayBuffer());
  assert.equal(blob.type, "audio/wav");
  assert.equal(bytes.getUint32(24, true), 16_000);
  assert.equal(bytes.getUint16(22, true), 1);
  assert.equal(bytes.getUint16(34, true), 16);
  assert.equal(bytes.getUint32(40, true), 4);
  assert.equal(bytes.getInt16(44, true), 1);
  assert.equal(bytes.getInt16(46, true), -2);
});

test("captured chunks are merged before downsampling and encoded", async () => {
  const merged = mergeFloatChunks([new Float32Array([0, 0.5]), new Float32Array([1, 0.5])]);
  assert.deepEqual([...merged], [0, 0.5, 1, 0.5]);
  const blob = encodeCapturedWav([new Float32Array(48_000)], 48_000);
  assert.equal(blob.size, 44 + 16_000 * 2);
});
