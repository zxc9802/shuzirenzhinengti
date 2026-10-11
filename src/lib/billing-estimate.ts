export const CHARACTERS_PER_SECOND = 4.4;

export function estimateScriptDuration(scriptText: string): number {
  const text = (scriptText || "").trim();
  if (!text) return 0;
  return Math.max(3, Math.ceil(text.length / CHARACTERS_PER_SECOND));
}
