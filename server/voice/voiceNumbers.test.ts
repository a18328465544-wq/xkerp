import assert from "node:assert/strict";
import test from "node:test";
import {parseVoiceAmount, parseVoiceNumber, parseVoiceQuantity} from "./voiceNumbers.ts";

test("voice numeric parser handles common Chinese money and quantity forms", () => {
  const cases: Array<[string, number]> = [
    ["一", 1], ["两", 2], ["十", 10], ["十二", 12], ["二十", 20], ["二十五", 25],
    ["一百", 100], ["一百二", 120], ["一百二十三", 123], ["五百六", 560],
    ["一千", 1_000], ["八千二", 8_200], ["八千零二", 8_002], ["七千八", 7_800],
    ["一万", 10_000], ["一万九", 19_000], ["一万九千五", 19_500], ["1.95万", 19_500],
    ["两张", 2], ["五块", 5], ["￥8,200", 8_200], ["一亿二万三", 100_023_000],
  ];
  for (const [input, expected] of cases) assert.equal(parseVoiceAmount(input), expected, input);
});

test("vague quantities are flagged instead of silently guessed", () => {
  for (const input of ["十来张", "十几件", "几十台", "几张", "若干件"]) {
    assert.equal(parseVoiceQuantity(input).ambiguous, true, input);
    assert.equal(parseVoiceNumber(input).value, undefined, input);
  }
});
