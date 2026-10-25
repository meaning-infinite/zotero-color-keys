/**
 * PDF 阅读器桥接。
 *
 * 快捷键语义（与 pdfKeymap.ts 一致）：
 * - Alt+字母       → 下划线颜色
 * - Ctrl+Alt+字母  → 高亮颜色
 * - Shift+Alt+字母 → 注释颜色（仅选中已有注释时生效）
 *
 * 实现要点（Zotero 10.0.6 源码核验）：
 * - PDF.js 在阅读器 UI 的孙级 iframe，keydown 不冒泡，监听必须挂到 view iframe
 * - 批注增改在阅读器内容分区内执行（win.eval），避免 Xray 跨分区
 * - 改色走 _annotationManager.updateAnnotations（原生右键菜单同款，可撤销）
 * - 选区压在已有高亮/下划线上时改色，不叠加新批注
 * - Tab：焦点在侧栏注释输入框时按 Tab 跳回阅读器，让颜色快捷键可用（可关）
 * - 工具栏颜色块：renderToolbar 追加，点击行为可配置（应用颜色 / 只设当前工具颜色）
 */

import { config } from "../../package.json";
import { diagnostics, recordError } from "./diagnostics";
import { comboFromEvent, matchCommand } from "./keymap";
import { getKeymap } from "./keymapStore";
import { resolvePdfColorCommand } from "./pdfKeymap";
import { getPref } from "../utils/prefs";

export const ANNOTATION_COLORS: Record<string, string> = {
  yellow: "#ffd400",
  red: "#ff6666",
  green: "#5fb236",
  blue: "#2ea8e5",
  purple: "#a28ae5",
  magenta: "#e56eee",
  orange: "#f19837",
  gray: "#aaaaaa",
};

const attachedReaders = new Set<object>();
const attachedWindows = new WeakMap<object, Set<any>>();
let pollTimer: number | null = null;
let renderToolbarHandler: ((event: any) => void) | null = null;

function getReaderWindow(reader: any): any {
  try {
    return (
      reader?._iframeWindow?.wrappedJSObject ?? reader?._iframeWindow ?? null
    );
  } catch {
    return null;
  }
}

function getViewWindow(reader: any): any {
  try {
    return (
      reader?._internalReader?._lastView?._iframeWindow ?? null
    );
  } catch {
    return null;
  }
}

function isTextBoxTarget(target: any): boolean {
  try {
    const tag = String(target?.tagName ?? "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (target?.isContentEditable) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function execInReader(reader: any, body: string): boolean {
  const win = getReaderWindow(reader);
  if (!win?.eval) return false;
  const script = `(() => { try { ${body} } catch (e) { return false; } })()`;
  try {
    return !!win.eval(script);
  } catch (error) {
    recordError("execInReader", error);
    return false;
  }
}

/** 给选区/选中批注上色；type 决定高亮、下划线还是注释。 */
function applyColor(reader: any, type: string, colorName: string): boolean {
  const hex = ANNOTATION_COLORS[colorName];
  if (!hex) return false;
  return execInReader(
    reader,
    `
    const reader = window._reader;
    if (!reader) return false;
    const state = reader._state;
    if (!state || state.readOnly) return false;
    const manager = reader._annotationManager;
    if (!manager || manager._readOnly) return false;
    const type = ${JSON.stringify(type)};
    const hex = ${JSON.stringify(hex)};
    const annotations = (state.annotations && state.annotations.length ? state.annotations : manager._annotations) || [];
    const view = reader._lastView;
    if (!view) return false;

    // 1) 已点选的批注：直接改色
    const selected = state.selectedAnnotationIDs || [];
    const selectedTargets = [];
    for (const id of selected) {
      const annotation = annotations.find((x) => x.id === id);
      if (annotation && !annotation.readOnly) selectedTargets.push(annotation);
    }
    if (selectedTargets.length) {
      manager.updateAnnotations(selectedTargets.map((a) => ({ id: a.id, color: hex })));
      return true;
    }

    // 2) 选区与已有同类批注相交：改色而不是新建
    const pos = typeof view.getSelectionPosition === "function" ? view.getSelectionPosition() : null;
    if (pos && pos.rects && pos.rects.length) {
      const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
      const targets = annotations.filter((a) =>
        a && !a.readOnly &&
        a.type === type &&
        a.position && a.position.pageIndex === pos.pageIndex &&
        (a.position.rects || []).some((r) => pos.rects.some((s) => hit(r, s)))
      );
      if (targets.length) {
        manager.updateAnnotations(targets.map((a) => ({ id: a.id, color: hex })));
        return true;
      }
    }

    // 3) 纯文本选区：新建高亮/下划线（note/text 需要点击位置，不能由选区创建）
    if (type === "note" || type === "text") return false;
    const ranges = view._selectionRanges;
    if (
      ranges && ranges.length &&
      !(ranges[0] && ranges[0].collapsed) &&
      typeof view._getAnnotationFromSelectionRanges === "function"
    ) {
      const annotation = view._getAnnotationFromSelectionRanges(ranges, type, hex);
      if (!annotation) return false;
      manager.addAnnotation(annotation);
      return true;
    }
    return false;
    `,
  );
}

function focusReaderView(reader: any): void {
  const viewWin = getViewWindow(reader);
  try {
    if (viewWin) {
      viewWin.focus();
      viewWin.document?.body?.focus?.();
      return;
    }
    execInReader(reader, "window._reader && window._reader.focusView && window._reader.focusView(true); return true;");
  } catch (error) {
    recordError("focusReaderView", error);
  }
}

function onReaderKeyDown(reader: any, event: any): void {
  try {
    if (!event || event.defaultPrevented || event.isComposing) return;

    // Tab：从侧栏注释输入框跳回阅读器正文，让颜色快捷键可用
    if (
      event.key === "Tab" &&
      isTextBoxTarget(event.target) &&
      getPref("pdfTabRefocus") !== false
    ) {
      event.preventDefault();
      event.stopPropagation();
      focusReaderView(reader);
      return;
    }

    if (isTextBoxTarget(event.target)) return;

    const keymap = getKeymap();
    // 先按 PDF 专用语义解析（Alt=下划线、Ctrl+Alt=高亮、Shift+Alt=注释）
    const pdfCommand = resolvePdfColorCommand(event, Zotero.isMac, keymap);
    if (pdfCommand) {
      if (applyColor(reader, pdfCommand.type, pdfCommand.color)) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    // 兼容：键位表里被改成非常规组合时，仍按普通高亮命令处理
    const combo = comboFromEvent(event, Zotero.isMac);
    if (!combo) return;
    const command = matchCommand(keymap, combo);
    if (!command || !command.startsWith("backgroundColor.")) return;
    if (applyColor(reader, "highlight", command.slice("backgroundColor.".length))) {
      event.preventDefault();
      event.stopPropagation();
    }
  } catch (error) {
    recordError("readerKeyDown", error);
  }
}

function attachWindow(reader: any, win: any): void {
  if (!win?.addEventListener) return;
  let windows = attachedWindows.get(reader);
  if (!windows) {
    windows = new Set();
    attachedWindows.set(reader, windows);
  }
  if (windows.has(win)) return;
  try {
    win.addEventListener(
      "keydown",
      (event: any) => onReaderKeyDown(reader, event),
      true,
    );
    windows.add(win);
    attachedReaders.add(reader);
    diagnostics.pdfReaders = attachedReaders.size;
  } catch (error) {
    recordError("attachWindow", error);
  }
}

function ensureReaderListeners(reader: any): void {
  if (!reader) return;
  attachWindow(reader, getReaderWindow(reader));
  try {
    const internal = reader._internalReader;
    if (!internal) return;
    for (const view of [internal._primaryView, internal._secondaryView]) {
      try {
        attachWindow(reader, view?._iframeWindow ?? null);
      } catch {
        /* view 尚未就绪 */
      }
    }
  } catch {
    /* ignore */
  }
}

function installToolbarSwatches(event: any): void {
  try {
    if (getPref("pdfShowToolbarColors") === false) return;
    const { reader, doc, append } = event;
    if (!doc || !append) return;

    const row = doc.createElement("div");
    row.className = "color-keys-swatches";
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "3px";
    row.style.marginLeft = "6px";

    for (const [name, hex] of Object.entries(ANNOTATION_COLORS)) {
      const button = doc.createElement("button");
      button.className = "toolbar-button color-keys-swatch";
      button.title = name;
      button.style.width = "16px";
      button.style.height = "16px";
      button.style.minWidth = "16px";
      button.style.padding = "0";
      button.style.borderRadius = "4px";
      button.style.border = "1px solid rgba(0,0,0,0.25)";
      button.style.background = hex;
      button.addEventListener("click", (clickEvent: any) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        clickToolbarColor(reader, name);
      });
      row.appendChild(button);
    }
    append(row);
  } catch (error) {
    recordError("installToolbarSwatches", error);
  }
}

function clickToolbarColor(reader: any, colorName: string): void {
  const hex = ANNOTATION_COLORS[colorName];
  if (!hex) return;
  const action = String(getPref("pdfColorClickAction") ?? "apply");
  if (action === "set-tool") {
    execInReader(
      reader,
      `
      const reader = window._reader;
      if (!reader || !reader._state || reader._state.readOnly) return false;
      reader.setTool({ color: ${JSON.stringify(hex)} });
      return true;
      `,
    );
    return;
  }

  // 默认：按当前工具决定批注类型（高亮/下划线/注释），否则按高亮处理
  let toolType = "";
  try {
    const win = getReaderWindow(reader);
    toolType = String(
      win?.eval(
        `(() => {
          const reader = window._reader;
          return (reader && reader._state && reader._state.tool && reader._state.tool.type) || "";
        })()`,
      ) ?? "",
    );
  } catch {
    toolType = "";
  }
  const type =
    toolType === "underline" || toolType === "note" || toolType === "highlight"
      ? toolType
      : "highlight";
  applyColor(reader, type, colorName);
}

export function installPdfBridge(): boolean {
  try {
    const Reader = (Zotero as any).Reader;
    if (!Reader) return false;

    const readers = Reader._readers ?? [];
    for (const reader of readers) ensureReaderListeners(reader);

    renderToolbarHandler = (event: any) => {
      try {
        ensureReaderListeners(event?.reader);
        installToolbarSwatches(event);
      } catch (error) {
        recordError("renderToolbar", error);
      }
    };
    if (typeof Reader.registerEventListener === "function") {
      Reader.registerEventListener(
        "renderToolbar",
        renderToolbarHandler,
        config.addonID,
      );
    }

    if (pollTimer === null) {
      pollTimer = setInterval(() => {
        try {
          for (const reader of ((Zotero as any).Reader?._readers ?? [])) {
            ensureReaderListeners(reader);
          }
        } catch (error) {
          recordError("pollReaders", error);
        }
      }, 2000) as unknown as number;
    }
    diagnostics.pdfBridge = true;
    return true;
  } catch (error) {
    recordError("installPdfBridge", error);
    return false;
  }
}

export function uninstallPdfBridge(): void {
  diagnostics.pdfBridge = false;
  diagnostics.pdfReaders = 0;
  attachedReaders.clear();
  try {
    const Reader = (Zotero as any).Reader;
    if (
      Reader &&
      renderToolbarHandler &&
      typeof Reader.unregisterEventListener === "function"
    ) {
      Reader.unregisterEventListener("renderToolbar", renderToolbarHandler);
    }
  } catch {
    /* ignore */
  }
  renderToolbarHandler = null;
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
