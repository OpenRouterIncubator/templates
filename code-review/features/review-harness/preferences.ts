// Behavior the user can set conversationally (e.g. "don't post comments by
// default"). Preferences are kept in-memory for the daemon's lifetime, keyed by
// chat session, and reset on restart. The prompt parser is pure and tested.

export interface Preferences {
  readonly autopost: boolean;
}

const DEFAULT_PREFERENCES: Preferences = { autopost: true };
const bySession = new Map<string, Preferences>();

// "stop posting", "don't post comments", "report only", "no auto-post" → disable.
const DISABLE_POST =
  /\b(?:do not|don'?t|never|stop|disable|no longer|quit)\b[^.?!\n]*\bpost(?:ing|s|ed)?\b|\breport[-\s]?only\b|\bno\s+auto[-\s]?post\b/i;
// "post by default", "auto-post", "always post", "enable/resume posting" → enable.
const ENABLE_POST =
  /\bauto[-\s]?post\b|\bpost(?:ing|s|ed)?\s+(?:by default|automatically|comments|reviews|the review)\b|\b(?:enable|resume|start|always)\b[^.?!\n]*\bpost(?:ing|s|ed)?\b/i;

export function getPreferences(sessionId: string | undefined): Preferences {
  return bySession.get(key(sessionId)) ?? DEFAULT_PREFERENCES;
}

export function setPreferences(
  sessionId: string | undefined,
  patch: Partial<Preferences>
): Preferences {
  const next = { ...getPreferences(sessionId), ...patch };
  bySession.set(key(sessionId), next);
  return next;
}

// Pure: a standing instruction to enable/disable auto-posting, or null if none.
export function parsePostingPreference(prompt: string): boolean | null {
  if (DISABLE_POST.test(prompt)) {
    return false;
  }
  if (ENABLE_POST.test(prompt)) {
    return true;
  }
  return null;
}

function key(sessionId: string | undefined): string {
  return sessionId === undefined || sessionId.length === 0
    ? "default"
    : sessionId;
}
