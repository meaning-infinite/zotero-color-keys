/**
 * Keymap storage: read, cache, observe.
 * Stored at `extensions.zotero.color-keys.keymap` as a JSON string.
 */

import { config } from "../../package.json";
import { validateKeymap, type Keymap } from "./keymap";
import { DEFAULT_KEYMAP, cloneKeymap, mergeWithDefaults } from "./keymapDefaults";
import { getPref, setPref } from "../utils/prefs";

const KEYMAP_PREF = "keymap";
const KEYMAP_PREF_PATH = `${config.prefsPrefix}.${KEYMAP_PREF}`;

let cachedKeymap: Keymap | null = null;

function readRaw(): string {
  try {
    const value = getPref(KEYMAP_PREF as never);
    if (typeof value === "string") return value;
    if (value && typeof value === "object") return JSON.stringify(value);
  } catch {
    /* fall back to defaults */
  }
  return "";
}

export function loadKeymap(): Keymap {
  const raw = readRaw();
  if (!raw) return cloneKeymap(DEFAULT_KEYMAP);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return cloneKeymap(DEFAULT_KEYMAP);
  }
  const result = validateKeymap(parsed);
  if (result.ok && result.keymap) return result.keymap;
  return mergeWithDefaults(parsed);
}

/** Hot path (every keydown): avoid repeated JSON.parse */
export function getKeymap(): Keymap {
  if (!cachedKeymap) cachedKeymap = loadKeymap();
  return cachedKeymap;
}

export function invalidateKeymapCache(): void {
  cachedKeymap = null;
}

export function saveKeymap(keymap: Keymap): boolean {
  const result = validateKeymap(keymap);
  if (!result.ok) return false;
  try {
    setPref(KEYMAP_PREF as never, JSON.stringify(result.keymap) as never);
    cachedKeymap = result.keymap ?? null;
    return true;
  } catch {
    return false;
  }
}

export function resetKeymapToDefaults(): Keymap {
  const defaults = cloneKeymap(DEFAULT_KEYMAP);
  saveKeymap(defaults);
  return defaults;
}

/** Observe keymap changes. Returns observer id or null. */
export function observeKeymap(callback: () => void): symbol | null {
  try {
    return Zotero.Prefs.registerObserver(
      KEYMAP_PREF_PATH,
      () => {
        invalidateKeymapCache();
        callback();
      },
      true,
    );
  } catch {
    return null;
  }
}

export function unobserveKeymap(id: symbol | null): void {
  if (id === null) return;
  try {
    Zotero.Prefs.unregisterObserver(id);
  } catch {
    /* may be gone on shutdown */
  }
}

export { KEYMAP_PREF_PATH };