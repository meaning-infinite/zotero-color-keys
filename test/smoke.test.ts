import { describe, expect, it } from "vitest";

const DEFAULT_KEYMAP_JSON =
  '{"version":1,"textColor":{"red":"alt,r","orange":"alt,o","yellow":"alt,y","green":"alt,g","blue":"alt,b","purple":"alt,p","magenta":"alt,m","gray":"alt,a"},"backgroundColor":{"yellow":"accel,alt,y","red":"accel,alt,r","gray":"accel,alt,h","green":"accel,alt,g","blue":"accel,alt,b","magenta":"accel,alt,p","orange":"accel,alt,o","purple":"accel,alt,u"},"actions":{"clearTextColor":"alt,d","clearHighlight":"accel,alt,d","clearAll":"accel,alt,shift,d"}}';

interface Keymap {
  version: number;
  textColor: Record<string, string>;
  backgroundColor: Record<string, string>;
  actions: Record<string, string>;
}

describe("default keymap", () => {
  it("parses as JSON", () => {
    expect(() => JSON.parse(DEFAULT_KEYMAP_JSON)).not.toThrow();
  });

  it("contains eight text color and eight highlight color entries", () => {
    const keymap = JSON.parse(DEFAULT_KEYMAP_JSON) as Keymap;

    expect(keymap.version).toBe(1);
    expect(Object.keys(keymap.textColor)).toHaveLength(8);
    expect(Object.keys(keymap.backgroundColor)).toHaveLength(8);
    expect(Object.keys(keymap.actions)).toHaveLength(3);
  });
});
