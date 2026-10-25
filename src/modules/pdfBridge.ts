/**
 * PDF 阅读器桥接。
 *
 * 快捷键（pdfKeymap.ts）：
 * - Alt+字母      → 下划线颜色
 * - Ctrl+Alt+字母 → 高亮颜色
 * - 焦点在侧栏注释输入框时同样生效（不拦截普通输入，仅拦截含 Alt 的组合）
 *
 * 选区弹窗精简：
 * - 隐藏原生"高亮/下划线"两个 A 按钮
 * - 第一行颜色行最左侧叠加一个模式指示器（默认下划线，按住 Ctrl/Cmd 变高亮色块）
 * - 第二行只保留一行灰色极简说明，行距压缩
 * - 点颜色：默认下划线；按住 Ctrl/Cmd 点 = 高亮
 */

import { config } from "../../package.json";
import { diagnostics, recordError } from "./diagnostics";
import { comboFromEvent, matchCommand } from "./keymap";
import { getKeymap } from "./keymapStore";
import { resolvePdfColorCommand, type PdfAnnotationType } from "./pdfKeymap";

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

const COLOR_NAMES = Object.keys(ANNOTATION_COLORS);

const attachedReaders = new Set<object>();
const attachedWindows = new WeakMap<object, Set<any>>();
const ctrlDown = new WeakMap<object, boolean>();
const lastColors = new WeakMap<object, { underline: string; highlight: string }>();
let pollTimer: number | null = null;
let renderToolbarHandler: ((event: any) => void) | null = null;
let selectionPopupHandler: ((event: any) => void) | null = null;

function getReaderWindow(reader: any): any {
  try {
    return reader?._iframeWindow?.wrappedJSObject ?? reader?._iframeWindow ?? null;
  } catch {
    return null;
  }
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

function getLastColors(reader: any): { underline: string; highlight: string } {
  let colors = lastColors.get(reader);
  if (!colors) {
    colors = { underline: ANNOTATION_COLORS.red, highlight: ANNOTATION_COLORS.yellow };
    lastColors.set(reader, colors);
  }
  return colors;
}

function applyColor(reader: any, type: PdfAnnotationType, colorName: string): boolean {
  const hex = ANNOTATION_COLORS[colorName];
  if (!hex) return false;
  const ok = execInReader(
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
      if (view._onSetSelectionPopup) view._onSetSelectionPopup();
      return true;
    }

    // 2) 文本选区：新建高亮/下划线
    const ranges = view._selectionRanges;
    if (
      ranges && ranges.length &&
      !(ranges[0] && ranges[0].collapsed) &&
      typeof view._getAnnotationFromSelectionRanges === "function"
    ) {
      const annotation = view._getAnnotationFromSelectionRanges(ranges, type, hex);
      if (!annotation) return false;
      manager.addAnnotation(annotation);
      if (view._onSetSelectionPopup) view._onSetSelectionPopup();
      return true;
    }
    return false;
    `,
  );
  if (ok) {
    const colors = getLastColors(reader);
    if (type === "highlight") colors.highlight = hex;
    else colors.underline = hex;
    updatePopupIndicator(reader);
  }
  return ok;
}

function setCtrlState(reader: any, down: boolean): void {
  ctrlDown.set(reader, down);
  try {
    const doc = getReaderWindow(reader)?.document;
    doc?.documentElement?.classList.toggle("color-keys-ctrl", down);
  } catch {
    /* ignore */
  }
}

function isAccelPressed(reader: any): boolean {
  return ctrlDown.get(reader) === true;
}

// ---------------------------------------------------------------------------
// 选区弹窗
// ---------------------------------------------------------------------------

function injectPopupStyle(reader: any): void {
  try {
    const doc = getReaderWindow(reader)?.document;
    if (!doc?.head) return;
    if (doc.getElementById("color-keys-popup-style")) return;
    const style = doc.createElement("style");
    style.id = "color-keys-popup-style";
    style.textContent = `
      .selection-popup { padding: 6px 8px !important; }
      .selection-popup .tool-toggle { display: none !important; }
      .selection-popup .colors {
        display: flex; align-items: center; gap: 4px;
        padding: 0 0 2px 0; margin: 0;
      }
      .selection-popup .color-keys-mode-badge {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: 16px; height: 14px; padding: 0 2px;
        font-size: 12px; font-weight: 700; line-height: 1;
        border-radius: 3px;
        border-bottom: 2px solid var(--ck-underline-color, #ff6666);
      }
      html.color-keys-ctrl .selection-popup .color-keys-mode-badge {
        background: var(--ck-highlight-color, #ffd400);
        border-bottom: none;
      }
      .selection-popup .color-keys-hint {
        font-size: 10px; line-height: 1.1; opacity: .55;
        margin: 0 0 2px 0; padding: 0 0 0 2px;
      }
    `;
    doc.head.appendChild(style);
  } catch (error) {
    recordError("injectPopupStyle", error);
  }
}

function updatePopupIndicator(reader: any): void {
  try {
    const doc = getReaderWindow(reader)?.document;
    const popup = doc?.querySelector(".selection-popup");
    if (!doc || !popup) return;
    const colors = popup.querySelector(".colors");
    if (!colors) return;

    let badge = colors.querySelector(".color-keys-mode-badge");
    if (!badge) {
      badge = doc.createElement("span");
      badge.className = "color-keys-mode-badge";
      badge.textContent = "Aa";
      badge.setAttribute(
        "title",
        String((Zotero as any).locale ?? "").startsWith("zh")
          ? "默认下划线，按住 Ctrl 切换高亮"
          : "Underline by default, hold Ctrl for highlight",
      );
      colors.insertBefore(badge, colors.firstChild);
    }

    const last = getLastColors(reader);
    (badge as any).style.setProperty("--ck-underline-color", last.underline);
    (badge as any).style.setProperty("--ck-highlight-color", last.highlight);

    let hint = popup.querySelector(".color-keys-hint");
    if (!hint) {
      hint = doc.createElement("div");
      hint.className = "color-keys-hint";
      hint.textContent = String((Zotero as any).locale ?? "").startsWith("zh")
        ? "按住 Ctrl 点色 = 高亮"
        : "Hold Ctrl + click a color for highlight";
      colors.insertAdjacentElement("afterend", hint);
    }
  } catch (error) {
    recordError("updatePopupIndicator", error);
  }
}

function installSelectionPopup(reader: any, doc: any): void {
  try {
    if (!doc) return;
    injectPopupStyle(reader);
    updatePopupIndicator(reader);
    const popup = doc.querySelector(".selection-popup");
    if (!popup || (popup as any).__colorKeysEnhanced) return;
    (popup as any).__colorKeysEnhanced = true;

    popup.addEventListener(
      "click",
      (event: any) => {
        try {
          const button = (event.target as any)?.closest?.("button.color-button");
          if (!button) return;
          const row = button.closest(".colors");
          if (!row) return;
          const buttons = [...row.querySelectorAll("button.color-button")];
          const index = buttons.indexOf(button);
          const name = COLOR_NAMES[index];
          if (!name) return;
          const type: PdfAnnotationType = isAccelPressed(reader)
            ? "highlight"
            : "underline";
          if (applyColor(reader, type, name)) {
            event.preventDefault();
            event.stopPropagation();
          }
        } catch (error) {
          recordError("popupClick", error);
        }
      },
      true,
    );
  } catch (error) {
    recordError("installSelectionPopup", error);
  }
}

// ---------------------------------------------------------------------------
// 键盘
// ---------------------------------------------------------------------------

function onReaderKeyDown(reader: any, event: any): void {
  try {
    if (!event || event.defaultPrevented || event.isComposing) return;

    const accelKey = Zotero.isMac ? "Meta" : "Control";
    if (event.key === accelKey) setCtrlState(reader, true);

    const keymap = getKeymap();
    const pdfCommand = resolvePdfColorCommand(event, Zotero.isMac, keymap);
    if (pdfCommand) {
      // 注释输入框聚焦时也生效；由于组合键必含 Alt，不会干扰普通输入
      if (applyColor(reader, pdfCommand.type, pdfCommand.color)) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    // 兼容：键位表被改成非常规组合时，仍按高亮命令处理
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

function onReaderKeyUp(reader: any, event: any): void {
  try {
    const accelKey = Zotero.isMac ? "Meta" : "Control";
    if (event?.key === accelKey) setCtrlState(reader, false);
  } catch (error) {
    recordError("readerKeyUp", error);
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
    win.addEventListener("keydown", (event: any) => onReaderKeyDown(reader, event), true);
    win.addEventListener("keyup", (event: any) => onReaderKeyUp(reader, event), true);
    windows.add(win);
    attachedReaders.add(reader);
  } catch (error) {
    recordError("attachWindow", error);
  }
}

function syncReaderCount(): void {
  try {
    const readers = (Zotero as any).Reader?._readers ?? [];
    diagnostics.pdfReaders = readers.length;
  } catch {
    diagnostics.pdfReaders = 0;
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

export function installPdfBridge(): boolean {
  try {
    const Reader = (Zotero as any).Reader;
    if (!Reader) return false;

    for (const reader of Reader._readers ?? []) ensureReaderListeners(reader);
    syncReaderCount();

    renderToolbarHandler = (event: any) => {
      try {
        ensureReaderListeners(event?.reader);
        injectPopupStyle(event?.reader);
      } catch (error) {
        recordError("renderToolbar", error);
      }
    };
    selectionPopupHandler = (event: any) => {
      try {
        installSelectionPopup(event?.reader, event?.doc);
      } catch (error) {
        recordError("renderTextSelectionPopup", error);
      }
    };

    if (typeof Reader.registerEventListener === "function") {
      Reader.registerEventListener("renderToolbar", renderToolbarHandler, config.addonID);
      Reader.registerEventListener(
        "renderTextSelectionPopup",
        selectionPopupHandler,
        config.addonID,
      );
    }

    if (pollTimer === null) {
      pollTimer = setInterval(() => {
        try {
          for (const reader of (Zotero as any).Reader?._readers ?? []) {
            ensureReaderListeners(reader);
          }
          syncReaderCount();
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
    if (Reader && typeof Reader.unregisterEventListener === "function") {
      if (renderToolbarHandler) {
        Reader.unregisterEventListener("renderToolbar", renderToolbarHandler);
      }
      if (selectionPopupHandler) {
        Reader.unregisterEventListener("renderTextSelectionPopup", selectionPopupHandler);
      }
    }
  } catch {
    /* ignore */
  }
  renderToolbarHandler = null;
  selectionPopupHandler = null;
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
