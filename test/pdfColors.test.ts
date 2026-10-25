import { describe, expect, it } from "vitest";

import { ANNOTATION_COLORS } from "../src/modules/pdfBridge";

// Keep in sync with Zotero.Annotations.COLORS (chrome/content/zotero/xpcom/annotations.js)
const ZOTERO_ANNOTATION_PALETTE = [
  "#ffd400",
  "#ff6666",
  "#5fb236",
  "#2ea8e5",
  "#a28ae5",
  "#e56eee",
  "#f19837",
  "#aaaaaa",
];

describe("annotation color palette", () => {
  it("covers the 8 official annotation colors", () => {
    const values = Object.values(ANNOTATION_COLORS).sort();
    expect(values).toEqual([...ZOTERO_ANNOTATION_PALETTE].sort());
  });

  it("maps names to the same hex Zotero uses", () => {
    expect(ANNOTATION_COLORS.yellow).toBe("#ffd400");
    expect(ANNOTATION_COLORS.gray).toBe("#aaaaaa");
  });
});
