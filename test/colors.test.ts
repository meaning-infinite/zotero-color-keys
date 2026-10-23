import { describe, expect, it } from "vitest";

import {
  COLOR_NAMES,
  HIGHLIGHT_COLORS,
  TEXT_COLORS,
  colorsEqual,
  highlightColorHex,
  normalizeColor,
  textColorHex,
} from "../src/modules/colors";

describe("color table", () => {
  it("exposes Zotero's 8 official text colors", () => {
    expect(TEXT_COLORS.map((c) => c.name)).toEqual([
      "red",
      "orange",
      "yellow",
      "green",
      "purple",
      "magenta",
      "blue",
      "gray",
    ]);
    expect(textColorHex("red")).toBe("#ff2020");
    expect(textColorHex("blue")).toBe("#05a2ef");
  });

  it("highlights are 8-digit hex with 50% alpha", () => {
    for (const color of HIGHLIGHT_COLORS) {
      expect(color.hex).toMatch(/^#[0-9a-f]{6}80$/);
    }
    expect(highlightColorHex("yellow")).toBe("#ffd40080");
  });

  it("keeps both tables aligned with COLOR_NAMES", () => {
    expect(COLOR_NAMES).toEqual(TEXT_COLORS.map((c) => c.name));
    expect(COLOR_NAMES).toEqual(HIGHLIGHT_COLORS.map((c) => c.name));
  });
});

describe("normalizeColor", () => {
  it("normalizes hex, rgb() and rgba() to one comparable form", () => {
    const red = "255,32,32,1.00";
    expect(normalizeColor("#ff2020")).toBe(red);
    expect(normalizeColor("#FF2020")).toBe(red);
    expect(normalizeColor("rgb(255, 32, 32)")).toBe(red);
    expect(normalizeColor("rgb(255,32,32)")).toBe(red);
  });

  it("normalizes 8-digit hex and rgba with alpha", () => {
    const yellow = "255,212,0,0.50";
    expect(normalizeColor("#ffd40080")).toBe(yellow);
    expect(normalizeColor("rgba(255, 212, 0, 0.5)")).toBe(yellow);
  });

  it("normalizes shorthand hex", () => {
    expect(normalizeColor("#f00")).toBe(normalizeColor("#ff0000"));
  });

  it("returns empty string for empty input", () => {
    expect(normalizeColor("")).toBe("");
    expect(normalizeColor(undefined)).toBe("");
    expect(normalizeColor(null)).toBe("");
  });

  it("falls back to raw lowercase for unknown formats", () => {
    expect(normalizeColor("VAR(--X)")).toBe("var(--x)");
  });
});

describe("colorsEqual", () => {
  it("matches hex against rgb() from stored note HTML", () => {
    expect(colorsEqual("#ff2020", "rgb(255, 32, 32)")).toBe(true);
    expect(colorsEqual("#ffd40080", "rgba(255, 212, 0, 0.5)")).toBe(true);
  });

  it("rejects different colors and empty values", () => {
    expect(colorsEqual("#ff2020", "rgb(1, 2, 3)")).toBe(false);
    expect(colorsEqual("", "#ff2020")).toBe(false);
    expect(colorsEqual(undefined, undefined)).toBe(false);
  });
});
