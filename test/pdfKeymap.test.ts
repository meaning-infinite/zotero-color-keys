import { describe, expect, it } from "vitest";

import { resolvePdfColorCommand } from "../src/modules/pdfKeymap";
import { DEFAULT_KEYMAP } from "../src/modules/keymapDefaults";

const evt = (over: Record<string, unknown>) => ({
  key: "r",
  altKey: false,
  ctrlKey: false,
  shiftKey: false,
  metaKey: false,
  ...over,
});

describe("resolvePdfColorCommand", () => {
  it("maps Alt+letter to underline colors", () => {
    expect(resolvePdfColorCommand(evt({ altKey: true }), false, DEFAULT_KEYMAP)).toEqual({
      type: "underline",
      color: "red",
    });
    expect(
      resolvePdfColorCommand(evt({ key: "y", altKey: true }), false, DEFAULT_KEYMAP),
    ).toEqual({ type: "underline", color: "yellow" });
  });

  it("maps Ctrl+Alt+letter to highlight colors", () => {
    expect(
      resolvePdfColorCommand(evt({ key: "y", ctrlKey: true, altKey: true }), false, DEFAULT_KEYMAP),
    ).toEqual({ type: "highlight", color: "yellow" });
    expect(
      resolvePdfColorCommand(evt({ key: "h", ctrlKey: true, altKey: true }), false, DEFAULT_KEYMAP),
    ).toEqual({ type: "highlight", color: "gray" });
  });

  it("maps Shift+Alt+letter to note colors", () => {
    expect(
      resolvePdfColorCommand(evt({ altKey: true, shiftKey: true }), false, DEFAULT_KEYMAP),
    ).toEqual({ type: "note", color: "red" });
  });

  it("maps Cmd+Option on macOS like Ctrl+Alt on Windows", () => {
    expect(
      resolvePdfColorCommand(evt({ key: "y", metaKey: true, altKey: true }), true, DEFAULT_KEYMAP),
    ).toEqual({ type: "highlight", color: "yellow" });
  });

  it("ignores keys without Alt or unknown letters", () => {
    expect(resolvePdfColorCommand(evt({ ctrlKey: true }), false, DEFAULT_KEYMAP)).toBeNull();
    expect(resolvePdfColorCommand(evt({ altKey: true, key: "z" }), false, DEFAULT_KEYMAP)).toBeNull();
  });
});
