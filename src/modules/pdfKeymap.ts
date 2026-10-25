/**
 * PDF 快捷键语义解析（纯函数，可单测）。
 *
 * 阅读器里没有"文字颜色"，只有批注颜色。用修饰键区分批注类型：
 * - `Alt+字母`      → 下划线（underline）颜色
 * - `Ctrl+Alt+字母` → 高亮（highlight）颜色（macOS `Cmd+Option`）
 *
 * 字母与颜色的对应关系沿用键位表：下划线读 textColor 表，高亮读 backgroundColor 表。
 */

import { COLOR_NAMES, type ColorName } from "./colors";
import { comboFromEvent, parseCombo, type Keymap } from "./keymap";

export type PdfAnnotationType = "highlight" | "underline";

export interface PdfColorCommand {
  type: PdfAnnotationType;
  color: ColorName;
}

export function resolvePdfColorCommand(
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
  keymap: Keymap,
): PdfColorCommand | null {
  const combo = comboFromEvent(event, isMac);
  if (!combo) return null;
  if (!combo.mods.includes("alt")) return null;
  if (combo.mods.includes("shift")) return null;

  const accel = combo.mods.includes("accel");
  const type: PdfAnnotationType = accel ? "highlight" : "underline";
  const table = accel ? keymap.backgroundColor : keymap.textColor;
  for (const name of COLOR_NAMES) {
    const parsed = parseCombo(table[name]);
    if (parsed && parsed.key === combo.key) {
      return { type, color: name };
    }
  }
  return null;
}
