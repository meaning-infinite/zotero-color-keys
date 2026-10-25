import { config } from "../../package.json";

type PrefKey = "enable" | "debug" | "keymap";
type PrefValue = string | number | boolean;

const PREFIX = config.prefsPrefix;

function fullKey(key: PrefKey): string {
  return `${PREFIX}.${key}`;
}

export function getPref<T = PrefValue>(key: PrefKey): T {
  return Zotero.Prefs.get(fullKey(key), true) as unknown as T;
}

export function setPref(key: PrefKey, value: PrefValue): void {
  Zotero.Prefs.set(fullKey(key), value, true);
}

export function clearPref(key: PrefKey): void {
  Zotero.Prefs.clear(fullKey(key), true);
}
