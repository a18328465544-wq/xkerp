/** Append a recognized utterance without erasing or joining it to existing draft text. */
export function appendVoiceTranscript(current: string, recognized: string) {
  const existing = current.trimEnd();
  const addition = recognized.trim();
  if (!addition) return existing;
  return existing ? `${existing}\n${addition}` : addition;
}
