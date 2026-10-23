/**
 * 键位解析、匹配与校验。
 *
 * 纯函数模块：不 import 任何 Zotero / toolkit API，方便单测。
 * 存储格式与 toolkit `KeyModifier.getRaw()` 对齐：小写、逗号分隔、修饰键在前，
 * 例如 `alt,r`、`accel,alt,shift,d`。`accel` 表示平台主修饰键
 * （macOS = Cmd，Windows/Linux = Ctrl）。
 */

import { COLOR_NAMES, type ColorName, isColorName } from "./colors";

export type Modifier = "accel" | "ctrl" | "alt" | "shift" | "meta";

export type ActionId = "clearTextColor" | "clearHighlight" | "clearAll";

export type CommandId =
  | `textColor.${ColorName}`
  | `backgroundColor.${ColorName}`
  | `actions.${ActionId}`;

export interface Combo {
  mods: Modifier[];
  key: string;
}

export interface KeymapActions {
  clearTextColor: string;
  clearHighlight: string;
  clearAll: string;
}

export interface Keymap {
  version: 1;
  textColor: Record<ColorName, string>;
  backgroundColor: Record<ColorName, string>;
  actions: KeymapActions;
}

export const ACTION_LABEL_KEYS: Record<ActionId, string> = {
  clearTextColor: "action-clear-text",
  clearHighlight: "action-clear-highlight",
  clearAll: "action-clear-all",
};

export const MODIFIER_ORDER: readonly Modifier[] = [
  "accel",
  "ctrl",
  "alt",
  "shift",
  "meta",
];

const MODIFIERS = new Set<Modifier>([
  "accel",
  "ctrl",
  "alt",
  "shift",
  "meta",
]);

/** 允许绑定的命名键（单字符键另外放行） */
const NAMED_KEYS = new Set([
  "space",
  "enter",
  "tab",
  "escape",
  "backspace",
  "delete",
  "insert",
  "home",
  "end",
  "pageup",
  "pagedown",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "/",
  "\\",
  ";",
  "'",
  ".",
  "-",
  "=",
  "[",
  "]",
  "`",
  "f1",
  "f2",
  "f3",
  "f4",
  "f5",
  "f6",
  "f7",
  "f8",
  "f9",
  "f10",
  "f11",
  "f12",
]);

/** 可作为单字符键绑定的标点（逗号因存储格式用逗号分隔，不支持绑定） */
const PUNCTUATION_KEYS = new Set([
  "/",
  "\\",
  ";",
  "'",
  ".",
  "-",
  "=",
  "[",
  "]",
  "`",
]);

export function isValidKeyToken(token: string): boolean {
  if (!token) return false;
  if (/^[a-z0-9]$/.test(token)) return true;
  return NAMED_KEYS.has(token);
}

export function parseCombo(raw: string): Combo | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parts = raw
    .toLowerCase()
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;

  const key = parts[parts.length - 1];
  if (!isValidKeyToken(key)) return null;

  const mods: Modifier[] = [];
  for (const mod of parts.slice(0, -1)) {
    if (!MODIFIERS.has(mod as Modifier)) return null;
    if (mods.includes(mod as Modifier)) return null;
    mods.push(mod as Modifier);
  }
  if (!mods.length) return null;
  return { mods, key };
}

export function serializeCombo(combo: Combo): string {
  const mods = MODIFIER_ORDER.filter((mod) => combo.mods.includes(mod));
  return [...mods, combo.key].join(",");
}

export function combosEqual(a: string, b: string): boolean {
  const pa = parseCombo(a);
  const pb = parseCombo(b);
  if (!pa || !pb) return false;
  return serializeCombo(pa) === serializeCombo(pb);
}

/**
 * 从键盘事件生成组合。
 * @param event 键盘事件
 * @param isMac 是否 macOS（决定 accel 映射）
 */
export function comboFromEvent(
  event: {
    key: string;
    code?: string;
    altKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
    isComposing?: boolean;
  },
  isMac: boolean,
): Combo | null {
  if (event.isComposing) return null;
  const key = normalizeEventKey(event);
  if (!key) return null;

  const mods: Modifier[] = [];
  if (isMac) {
    if (event.metaKey) mods.push("accel");
    if (event.ctrlKey) mods.push("ctrl");
  } else {
    if (event.ctrlKey) mods.push("accel");
    if (event.metaKey) mods.push("meta");
  }
  if (event.altKey) mods.push("alt");
  if (event.shiftKey) mods.push("shift");

  // 只有修饰键按下时不算组合
  if (!mods.length) return null;
  return { mods, key };
}

export function normalizeEventKey(event: {
  key: string;
  code?: string;
}): string | null {
  const raw = String(event.key ?? "");
  if (/^(shift|control|alt|meta|altgraph|os|win|super)$/i.test(raw)) return null;

  if (raw === " ") return "space";
  if (raw.length === 1) {
    const lower = raw.toLowerCase();
    if (/[a-z0-9]/.test(lower)) return lower;
    if (PUNCTUATION_KEYS.has(lower)) return lower;
    // 含 AltGr/输入法干扰的符号继续走 event.code 回退
  }

  if (/^f\d{1,2}$/i.test(raw)) return raw.toLowerCase();

  const byKey: Record<string, string> = {
    Enter: "enter",
    Tab: "tab",
    Escape: "escape",
    Backspace: "backspace",
    Delete: "delete",
    Insert: "insert",
    Home: "home",
    End: "end",
    PageUp: "pageup",
    PageDown: "pagedown",
    ArrowUp: "arrowup",
    ArrowDown: "arrowdown",
    ArrowLeft: "arrowleft",
    ArrowRight: "arrowright",
  };
  if (byKey[raw]) return byKey[raw];

  // Alt/AltGr 组合下 event.key 可能变成符号，退回 code
  const code = String(event.code ?? "");
  const letter = code.match(/^Key([A-Z])$/);
  if (letter) return letter[1].toLowerCase();
  const digit = code.match(/^Digit([0-9])$/);
  if (digit) return digit[1];

  return null;
}

export interface ParsedBindings {
  command: CommandId;
  combo: Combo;
  raw: string;
}

export function listBindings(keymap: Keymap): ParsedBindings[] {
  const bindings: ParsedBindings[] = [];
  for (const name of COLOR_NAMES) {
    bindings.push({
      command: `textColor.${name}`,
      combo: parseCombo(keymap.textColor[name]) ?? { mods: [], key: "" },
      raw: keymap.textColor[name],
    });
    bindings.push({
      command: `backgroundColor.${name}`,
      combo: parseCombo(keymap.backgroundColor[name]) ?? { mods: [], key: "" },
      raw: keymap.backgroundColor[name],
    });
  }
  (Object.keys(keymap.actions) as ActionId[]).forEach((action) => {
    bindings.push({
      command: `actions.${action}`,
      combo: parseCombo(keymap.actions[action]) ?? { mods: [], key: "" },
      raw: keymap.actions[action],
    });
  });
  return bindings;
}

export function matchCommand(keymap: Keymap, event: Combo): CommandId | null {
  const target = serializeCombo(event);
  for (const binding of listBindings(keymap)) {
    if (!binding.raw) continue;
    if (serializeCombo(binding.combo) === target) return binding.command;
  }
  return null;
}

export function findConflicts(keymap: Keymap): Map<string, CommandId[]> {
  const map = new Map<string, CommandId[]>();
  for (const binding of listBindings(keymap)) {
    if (!binding.raw) continue;
    const serialized = serializeCombo(binding.combo);
    if (!serialized.includes(",")) continue;
    const existing = map.get(serialized) ?? [];
    existing.push(binding.command);
    map.set(serialized, existing);
  }
  for (const [key, commands] of map) {
    if (commands.length < 2) map.delete(key);
  }
  return map;
}

export interface ValidationResult {
  ok: boolean;
  keymap?: Keymap;
  errors: string[];
}

export function validateKeymap(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!value || typeof value !== "object") {
    return { ok: false, errors: ["keymap is not an object"] };
  }
  const input = value as Record<string, unknown>;
  if (input.version !== 1) errors.push("version must be 1");

  const textColor = input.textColor as Record<string, unknown> | undefined;
  const backgroundColor = input.backgroundColor as
    | Record<string, unknown>
    | undefined;
  const actions = input.actions as Record<string, unknown> | undefined;

  const readGroup = (
    group: Record<string, unknown> | undefined,
    label: string,
    names: readonly string[],
  ): Record<string, string> => {
    const result: Record<string, string> = {};
    if (!group) {
      errors.push(`${label} missing`);
      return result;
    }
    for (const name of names) {
      const raw = group[name];
      if (typeof raw !== "string") {
        errors.push(`${label}.${name} missing`);
        continue;
      }
      // 空字符串表示用户主动解绑（该命令不再触发）
      if (!raw.trim()) {
        result[name] = "";
        continue;
      }
      if (!parseCombo(raw)) {
        errors.push(`${label}.${name} invalid binding: ${raw}`);
        continue;
      }
      result[name] = raw.toLowerCase();
    }
    return result;
  };

  const text = readGroup(textColor, "textColor", COLOR_NAMES);
  const highlight = readGroup(backgroundColor, "backgroundColor", COLOR_NAMES);
  const actionBindings: Record<string, string> = {};
  for (const action of ["clearTextColor", "clearHighlight", "clearAll"]) {
    const raw = actions?.[action];
    if (typeof raw !== "string") {
      errors.push(`actions.${action} invalid`);
      continue;
    }
    if (!raw.trim()) {
      actionBindings[action] = "";
      continue;
    }
    if (!parseCombo(raw)) {
      errors.push(`actions.${action} invalid`);
      continue;
    }
    actionBindings[action] = raw.toLowerCase();
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    keymap: {
      version: 1,
      textColor: text as Record<ColorName, string>,
      backgroundColor: highlight as Record<ColorName, string>,
      actions: actionBindings as unknown as KeymapActions,
    },
  };
}

export function isCommandId(value: string): value is CommandId {
  if (value.startsWith("textColor.")) {
    return isColorName(value.slice("textColor.".length));
  }
  if (value.startsWith("backgroundColor.")) {
    return isColorName(value.slice("backgroundColor.".length));
  }
  return /^actions\.(clearTextColor|clearHighlight|clearAll)$/.test(value);
}

/** 格式化组合用于展示；accel/alt 按平台替换为 Cmd/Ctrl、Option。 */
export function formatCombo(raw: string, isMac: boolean): string {
  const combo = parseCombo(raw);
  if (!combo) return "";
  const labels: Record<Modifier, string> = {
    accel: isMac ? "Cmd" : "Ctrl",
    ctrl: "Ctrl",
    alt: isMac ? "Option" : "Alt",
    shift: "Shift",
    meta: isMac ? "Cmd" : "Win",
  };
  const parts = MODIFIER_ORDER.filter((mod) => combo.mods.includes(mod)).map(
    (mod) => labels[mod],
  );
  const keyLabel =
    combo.key.length === 1 ? combo.key.toUpperCase() : combo.key.toUpperCase();
  return [...parts, keyLabel].join("+");
}

/** 把解析后的组合序列化回存储格式（供录制器使用） */
export function serializeEvent(event: Combo): string {
  return serializeCombo(event);
}
