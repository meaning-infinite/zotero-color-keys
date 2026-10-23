/**
 * 颜色命令：把快捷键命令落到 ProseMirror transaction。
 *
 * 关键约束（spike 结论）：
 * - mark attrs 必须在编辑器 iframe realm 内创建，否则 Xray 会吞掉属性，
 *   抛 `RangeError: No value supplied for attribute color`
 * - Zotero 读取笔记后颜色可能变成 rgb()/rgba()，比较前必须 normalize
 * - 有选区作用选区；无选区作用当前段落（文本块）
 */

import {
  colorsEqual,
  highlightColorHex,
  isColorName,
  textColorHex,
} from "./colors";
import { recordError } from "./diagnostics";
import type { EditorHandle } from "./editorRegistry";

type MarkName = "textColor" | "backgroundColor";

function getView(handle: EditorHandle): any {
  try {
    return (
      handle.instance._iframeWindow?.wrappedJSObject?._currentEditorInstance
        ?._editorCore?.view ?? handle.view
    );
  } catch {
    return null;
  }
}

function getIframeWindow(handle: EditorHandle): any {
  try {
    return (
      handle.instance._iframeWindow?.wrappedJSObject ??
      handle.instance._iframeWindow ??
      null
    );
  } catch {
    return null;
  }
}

function resolveRange(state: any): { from: number; to: number } | null {
  const selection = state.selection;
  if (!selection.empty && selection.from !== selection.to) {
    return { from: selection.from, to: selection.to };
  }
  // 无选区：当前文本块（段落/列表项/标题）
  const $from = selection.$from;
  try {
    const from = $from.start();
    const to = $from.end();
    if (to > from) return { from, to };
  } catch {
    /* 光标不在文本块内时忽略 */
  }
  return null;
}

function createAttrs(handle: EditorHandle, hex: string): any {
  const iframeWindow = getIframeWindow(handle);
  if (!iframeWindow?.Object) {
    // 理论上不会走到这里；保留 chrome 侧对象作为最后手段
    return { color: hex };
  }
  const attrs = new iframeWindow.Object();
  attrs.color = hex;
  return attrs;
}

function rangeHasUniformMark(
  state: any,
  from: number,
  to: number,
  markName: MarkName,
  hex: string,
): { seenText: boolean; uniformSame: boolean } {
  let seenText = false;
  let uniformSame = true;
  state.doc.nodesBetween(from, to, (node: any) => {
    if (!node.isText) return true;
    seenText = true;
    const mark = node.marks?.find((item: any) => item.type?.name === markName);
    if (!mark || !colorsEqual(mark.attrs?.color, hex)) {
      uniformSame = false;
    }
    return true;
  });
  return { seenText, uniformSame };
}

function applyMark(handle: EditorHandle, markName: MarkName, hex: string): boolean {
  const view = getView(handle);
  if (!view) return false;
  const state = view.state;
  const range = resolveRange(state);
  if (!range) return false;

  const markType = state.schema?.marks?.[markName];
  if (!markType) {
    recordError("applyMark", `schema.marks.${markName} missing`);
    return false;
  }

  const { from, to } = range;
  const { seenText, uniformSame } = rangeHasUniformMark(
    state,
    from,
    to,
    markName,
    hex,
  );
  const tr = state.tr;
  tr.removeMark(from, to, markType);
  // 同色再按一次 = 取消（toggle）
  if (!(seenText && uniformSame)) {
    tr.addMark(from, to, markType.create(createAttrs(handle, hex)));
  }
  view.dispatch(tr);
  return true;
}

function clearMark(handle: EditorHandle, markName: MarkName): boolean {
  const view = getView(handle);
  if (!view) return false;
  const state = view.state;
  const range = resolveRange(state);
  if (!range) return false;

  const markType = state.schema?.marks?.[markName];
  if (!markType) return false;

  const tr = state.tr.removeMark(range.from, range.to, markType);
  view.dispatch(tr);
  return true;
}

export function applyTextColor(handle: EditorHandle, color: string): boolean {
  if (!isColorName(color)) return false;
  return applyMark(handle, "textColor", textColorHex(color));
}

export function applyHighlight(handle: EditorHandle, color: string): boolean {
  if (!isColorName(color)) return false;
  return applyMark(handle, "backgroundColor", highlightColorHex(color));
}

export function clearTextColor(handle: EditorHandle): boolean {
  return clearMark(handle, "textColor");
}

export function clearHighlight(handle: EditorHandle): boolean {
  return clearMark(handle, "backgroundColor");
}

export function clearAll(handle: EditorHandle): boolean {
  const first = clearTextColor(handle);
  const second = clearHighlight(handle);
  return first || second;
}

export function executeCommand(handle: EditorHandle, command: string): boolean {
  try {
    if (command.startsWith("textColor.")) {
      return applyTextColor(handle, command.slice("textColor.".length));
    }
    if (command.startsWith("backgroundColor.")) {
      return applyHighlight(handle, command.slice("backgroundColor.".length));
    }
    if (command === "actions.clearTextColor") return clearTextColor(handle);
    if (command === "actions.clearHighlight") return clearHighlight(handle);
    if (command === "actions.clearAll") return clearAll(handle);
    return false;
  } catch (error) {
    recordError(`executeCommand(${command})`, error);
    return false;
  }
}
