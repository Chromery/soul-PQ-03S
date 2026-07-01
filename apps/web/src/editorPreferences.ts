export type EditorSheetSize = "A3" | "A4";

export type EditorPreferences = {
  scale: {
    sheetSize: EditorSheetSize;
    denominator: number;
  };
  smartSelection: {
    threshold: number;
    inflate: number;
    gap: number;
    dash: number;
    wallInclusionRadius: number | null;
  };
};

export const EDITOR_PREFERENCES_STORAGE_KEY = "pq-editor-preferences-v1";

export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
  scale: {
    sheetSize: "A3",
    denominator: 500,
  },
  smartSelection: {
    threshold: 236,
    inflate: 1,
    gap: 3,
    dash: 42,
    wallInclusionRadius: 3,
  },
};

export function readEditorPreferences(): EditorPreferences {
  if (typeof window === "undefined") return DEFAULT_EDITOR_PREFERENCES;
  try {
    const serialized = window.localStorage.getItem(EDITOR_PREFERENCES_STORAGE_KEY);
    if (!serialized) return DEFAULT_EDITOR_PREFERENCES;
    return normalizeEditorPreferences(JSON.parse(serialized));
  } catch {
    return DEFAULT_EDITOR_PREFERENCES;
  }
}

export function writeEditorPreferences(preferences: EditorPreferences) {
  const normalized = normalizeEditorPreferences(preferences);
  window.localStorage.setItem(EDITOR_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function resetEditorPreferences() {
  window.localStorage.removeItem(EDITOR_PREFERENCES_STORAGE_KEY);
  return DEFAULT_EDITOR_PREFERENCES;
}

export function normalizeEditorPreferences(value: unknown): EditorPreferences {
  const record = isRecord(value) ? value : {};
  const scale = isRecord(record.scale) ? record.scale : {};
  const smartSelection = isRecord(record.smartSelection) ? record.smartSelection : {};

  return {
    scale: {
      sheetSize: scale.sheetSize === "A4" ? "A4" : DEFAULT_EDITOR_PREFERENCES.scale.sheetSize,
      denominator: clampInteger(scale.denominator, 20, 20000, DEFAULT_EDITOR_PREFERENCES.scale.denominator),
    },
    smartSelection: {
      threshold: clampInteger(smartSelection.threshold, 0, 255, DEFAULT_EDITOR_PREFERENCES.smartSelection.threshold),
      inflate: clampInteger(smartSelection.inflate, 0, 12, DEFAULT_EDITOR_PREFERENCES.smartSelection.inflate),
      gap: clampInteger(smartSelection.gap, 0, 24, DEFAULT_EDITOR_PREFERENCES.smartSelection.gap),
      dash: clampInteger(smartSelection.dash, 0, 120, DEFAULT_EDITOR_PREFERENCES.smartSelection.dash),
      wallInclusionRadius:
        smartSelection.wallInclusionRadius === null
          ? null
          : clampInteger(
              smartSelection.wallInclusionRadius,
              0,
              8,
              DEFAULT_EDITOR_PREFERENCES.smartSelection.wallInclusionRadius ?? 3,
            ),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}
