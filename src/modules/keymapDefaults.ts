/**
 * 默认键位：设计规格 5.4 的唯一事实源。
 * `addon/prefs.js` 里的 JSON 默认值必须与本文件保持一致（有单测校验）。
 */

import type { ColorName } from "./colors";
import type { Keymap } from "./keymap";

export const DEFAULT_KEYMAP: Keymap = {
  version: 1,
  textColor: {
    red: "alt,r",
    orange: "alt,o",
    yellow: "alt,y",
    green: "alt,g",
    blue: "alt,b",
    purple: "alt,p",
    magenta: "alt,m",
    gray: "alt,a",
  },
  backgroundColor: {
    yellow: "accel,alt,y",
    red: "accel,alt,r",
    gray: "accel,alt,h",
    green: "accel,alt,g",
    blue: "accel,alt,b",
    magenta: "accel,alt,p",
    orange: "accel,alt,o",
    purple: "accel,alt,u",
  },
  actions: {
    clearTextColor: "alt,d",
    clearHighlight: "accel,alt,d",
    clearAll: "accel,alt,shift,d",
  },
};

export function cloneKeymap(keymap: Keymap): Keymap {
  return {
    version: 1,
    textColor: { ...keymap.textColor },
    backgroundColor: { ...keymap.backgroundColor },
    actions: { ...keymap.actions },
  };
}

/** 用默认值补齐缺失字段（用于旧配置或部分损坏的配置） */
export function mergeWithDefaults(partial: unknown): Keymap {
  const base = cloneKeymap(DEFAULT_KEYMAP);
  if (!partial || typeof partial !== "object") return base;
  const input = partial as Partial<Keymap>;

  for (const name of Object.keys(base.textColor) as ColorName[]) {
    const value = input.textColor?.[name];
    if (typeof value === "string" && value.trim()) base.textColor[name] = value;
  }
  for (const name of Object.keys(base.backgroundColor) as ColorName[]) {
    const value = input.backgroundColor?.[name];
    if (typeof value === "string" && value.trim()) {
      base.backgroundColor[name] = value;
    }
  }
  for (const action of Object.keys(base.actions) as Array<
    keyof Keymap["actions"]
  >) {
    const value = input.actions?.[action];
    if (typeof value === "string" && value.trim()) base.actions[action] = value;
  }
  return base;
}

export function defaultKeymapJson(): string {
  return JSON.stringify(DEFAULT_KEYMAP);
}
