import { describe, expect, it } from "vitest";

import {
  comboFromEvent,
  combosEqual,
  findConflicts,
  formatCombo,
  listBindings,
  matchCommand,
  normalizeEventKey,
  parseCombo,
  serializeCombo,
  validateKeymap,
} from "../src/modules/keymap";
import { DEFAULT_KEYMAP, defaultKeymapJson } from "../src/modules/keymapDefaults";

const evt = (over: Partial<Parameters<typeof comboFromEvent>[0]>) => ({
  key: "r",
  altKey: false,
  ctrlKey: false,
  shiftKey: false,
  metaKey: false,
  ...over,
});

describe("parseCombo / serializeCombo", () => {
  it("parses stored bindings", () => {
    expect(parseCombo("alt,r")).toEqual({ mods: ["alt"], key: "r" });
    expect(parseCombo("accel,alt,shift,d")).toEqual({
      mods: ["accel", "alt", "shift"],
      key: "d",
    });
  });

  it("rejects malformed bindings", () => {
    expect(parseCombo("")).toBeNull();
    expect(parseCombo("r")).toBeNull();
    expect(parseCombo("alt")).toBeNull();
    expect(parseCombo("alt,alt,r")).toBeNull();
    expect(parseCombo("alt,shift")).toBeNull();
    expect(parseCombo("nope,r")).toBeNull();
    expect(parseCombo("alt,")).toBeNull();
  });

  it("serializes modifiers in canonical order", () => {
    expect(
      serializeCombo({ mods: ["shift", "alt", "accel"], key: "d" }),
    ).toBe("accel,alt,shift,d");
  });

  it("compares bindings regardless of modifier order", () => {
    expect(combosEqual("alt,accel,y", "accel,alt,y")).toBe(true);
    expect(combosEqual("alt,y", "alt,u")).toBe(false);
    expect(combosEqual("bad", "alt,y")).toBe(false);
  });
});

describe("comboFromEvent", () => {
  it("maps Ctrl to accel on Windows/Linux", () => {
    expect(comboFromEvent(evt({ ctrlKey: true, altKey: true }), false)).toEqual({
      mods: ["accel", "alt"],
      key: "r",
    });
  });

  it("maps Cmd to accel on macOS", () => {
    expect(comboFromEvent(evt({ metaKey: true, altKey: true }), true)).toEqual({
      mods: ["accel", "alt"],
      key: "r",
    });
  });

  it("keeps explicit Ctrl on macOS", () => {
    expect(comboFromEvent(evt({ ctrlKey: true }), true)).toEqual({
      mods: ["ctrl"],
      key: "r",
    });
  });

  it("ignores modifier-only presses", () => {
    expect(comboFromEvent(evt({ key: "Shift", shiftKey: true }), false)).toBeNull();
    expect(comboFromEvent(evt({ key: "Alt", altKey: true }), false)).toBeNull();
    expect(comboFromEvent(evt({ key: "r" }), false)).toBeNull();
  });

  it("ignores IME composition", () => {
    expect(
      comboFromEvent(evt({ altKey: true, isComposing: true }), false),
    ).toBeNull();
  });

  it("falls back to event.code when key becomes a symbol", () => {
    expect(normalizeEventKey({ key: "®", code: "KeyR" })).toBe("r");
    expect(normalizeEventKey({ key: "1", code: "Digit1" })).toBe("1");
  });

  it("normalizes named keys", () => {
    expect(normalizeEventKey({ key: " " })).toBe("space");
    expect(normalizeEventKey({ key: "ArrowUp" })).toBe("arrowup");
    expect(normalizeEventKey({ key: "F5" })).toBe("f5");
  });
});

describe("validateKeymap", () => {
  it("accepts the default keymap", () => {
    const result = validateKeymap(DEFAULT_KEYMAP);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("reports missing colors and invalid bindings", () => {
    const broken = JSON.parse(JSON.stringify(DEFAULT_KEYMAP));
    delete broken.textColor.red;
    broken.backgroundColor.yellow = "y";
    const result = validateKeymap(broken);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("textColor.red");
    expect(result.errors.join("\n")).toContain("backgroundColor.yellow");
  });

  it("rejects non-objects and wrong versions", () => {
    expect(validateKeymap(null).ok).toBe(false);
    expect(validateKeymap({ version: 2 }).ok).toBe(false);
  });
});

describe("bindings", () => {
  it("lists 8 + 8 + 3 bindings", () => {
    expect(listBindings(DEFAULT_KEYMAP)).toHaveLength(19);
  });

  it("matches Windows events", () => {
    expect(
      matchCommand(DEFAULT_KEYMAP, { mods: ["alt"], key: "r" }),
    ).toBe("textColor.red");
    expect(
      matchCommand(DEFAULT_KEYMAP, { mods: ["accel", "alt"], key: "y" }),
    ).toBe("backgroundColor.yellow");
    expect(
      matchCommand(DEFAULT_KEYMAP, { mods: ["accel", "alt", "shift"], key: "d" }),
    ).toBe("actions.clearAll");
  });

  it("returns null for unbound combinations", () => {
    expect(matchCommand(DEFAULT_KEYMAP, { mods: ["alt"], key: "z" })).toBeNull();
  });

  it("has no duplicate bindings in defaults", () => {
    expect(findConflicts(DEFAULT_KEYMAP).size).toBe(0);
  });

  it("detects duplicated bindings", () => {
    const conflicted = JSON.parse(JSON.stringify(DEFAULT_KEYMAP));
    conflicted.textColor.red = "alt,g";
    const conflicts = findConflicts(conflicted);
    expect(conflicts.get("alt,g")?.sort()).toEqual([
      "textColor.green",
      "textColor.red",
    ]);
  });
});

describe("formatCombo", () => {
  it("formats for Windows and macOS", () => {
    expect(formatCombo("accel,alt,y", false)).toBe("Ctrl+Alt+Y");
    expect(formatCombo("accel,alt,y", true)).toBe("Cmd+Option+Y");
    expect(formatCombo("alt,r", false)).toBe("Alt+R");
  });
});

describe("defaults", () => {
  it("matches the JSON shipped in addon/prefs.js", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const path = fileURLToPath(new URL("../addon/prefs.js", import.meta.url));
    const source = await readFile(path, "utf8");
    const match = source.match(/pref\("keymap", '(.+)'\);/);
    expect(match).not.toBeNull();
    expect(JSON.parse(match![1])).toEqual(JSON.parse(defaultKeymapJson()));
  });
});
