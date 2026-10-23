/**
 * Zotero 颜色表与颜色归一化。
 *
 * 颜色值来源：Zotero note-editor `src/core/schema/colors.js`
 * （Zotero 10 安装包内 `resource/note-editor/editor.js` 同样内置该表）。
 * 只使用 Zotero 官方 8 色，不引入自定义色。
 */

export type ColorName =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "purple"
  | "magenta"
  | "blue"
  | "gray";

export interface ColorDef {
  name: ColorName;
  hex: string;
}

/** 文字颜色（6 位 hex） */
export const TEXT_COLORS: readonly ColorDef[] = [
  { name: "red", hex: "#ff2020" },
  { name: "orange", hex: "#ff7700" },
  { name: "yellow", hex: "#ffcb00" },
  { name: "green", hex: "#4eb31c" },
  { name: "purple", hex: "#7953e3" },
  { name: "magenta", hex: "#eb52f7" },
  { name: "blue", hex: "#05a2ef" },
  { name: "gray", hex: "#7e8386" },
] as const;

/** 高亮颜色（8 位 hex，末两位 80 = 50% alpha） */
export const HIGHLIGHT_COLORS: readonly ColorDef[] = [
  { name: "red", hex: "#ff666680" },
  { name: "orange", hex: "#f1983780" },
  { name: "yellow", hex: "#ffd40080" },
  { name: "green", hex: "#5fb23680" },
  { name: "purple", hex: "#a28ae580" },
  { name: "magenta", hex: "#e56eee80" },
  { name: "blue", hex: "#2ea8e580" },
  { name: "gray", hex: "#aaaaaa80" },
] as const;

export const COLOR_NAMES: readonly ColorName[] = TEXT_COLORS.map(
  (c) => c.name,
);

const TEXT_MAP = new Map<ColorName, string>(TEXT_COLORS.map((c) => [c.name, c.hex]));
const HIGHLIGHT_MAP = new Map<ColorName, string>(
  HIGHLIGHT_COLORS.map((c) => [c.name, c.hex]),
);

export function isColorName(value: unknown): value is ColorName {
  return typeof value === "string" && TEXT_MAP.has(value as ColorName);
}

export function textColorHex(name: ColorName): string {
  return TEXT_MAP.get(name) as string;
}

export function highlightColorHex(name: ColorName): string {
  return HIGHLIGHT_MAP.get(name) as string;
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseColor(value: string): Rgba | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;

  const hex = raw.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      const r = parseInt(digits[0] + digits[0], 16);
      const g = parseInt(digits[1] + digits[1], 16);
      const b = parseInt(digits[2] + digits[2], 16);
      const a = digits.length === 4 ? parseInt(digits[3] + digits[3], 16) / 255 : 1;
      return { r, g, b, a };
    }
    if (digits.length === 6 || digits.length === 8) {
      const r = parseInt(digits.slice(0, 2), 16);
      const g = parseInt(digits.slice(2, 4), 16);
      const b = parseInt(digits.slice(4, 6), 16);
      const a = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
    return null;
  }

  const rgb = raw.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const parts = rgb[1].split(",").map((p) => p.trim());
    if (parts.length < 3) return null;
    const channel = (part: string): number => {
      if (part.endsWith("%")) return (parseFloat(part) / 100) * 255;
      return parseFloat(part);
    };
    const r = channel(parts[0]);
    const g = channel(parts[1]);
    const b = channel(parts[2]);
    let a = parts.length > 3 ? parseFloat(parts[3]) : 1;
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    if (Number.isNaN(a)) a = 1;
    if (a > 1) a = a / 255;
    return { r, g, b, a };
  }

  return null;
}

/**
 * 归一化成可直接比较的字符串。
 *
 * Zotero 读取笔记时会把 `#ff2020` 还原成 `rgb(255, 32, 32)`，
 * 高亮则可能是 `rgba(255, 212, 0, 0.5)`，所以颜色比较不能直接比 hex 字符串。
 */
export function normalizeColor(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = parseColor(value);
  if (!parsed) return String(value).trim().toLowerCase();
  return `${clampByte(parsed.r)},${clampByte(parsed.g)},${clampByte(parsed.b)},${parsed.a.toFixed(2)}`;
}

export function colorsEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeColor(a);
  const nb = normalizeColor(b);
  return !!na && na === nb;
}
