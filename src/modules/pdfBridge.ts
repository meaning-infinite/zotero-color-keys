/**
 * PDF 阅读器桥接。
 *
 * 快捷键语义（pdfKeymap.ts）：
 * - Alt+字母      → 下划线颜色
 * - Ctrl+Alt+字母 → 高亮颜色
 * - Tab / Shift+Tab：从侧栏注释输入框跳回阅读器正文，之后颜色快捷键可用
 *
 * 另外接管选区弹窗（selection popup）：
 * - 隐藏原生"高亮/下划线"两个 A 按钮，改为一个随 Ctrl 切换的指示图标
 * - 点击颜色块：默认给下划线上色，按住 Ctrl 给高亮上色
 *
 * 实现要点：
 * - PDF.js 在阅读器 UI 的孙级 iframe，keydown 不冒泡，监听必须挂到 view iframe
 * - 批注增改在阅读器内容分区内执行（win.eval），避免 Xray 跨分区
 * - 改色走 _annotationManager.updateAnnotations（原生同款，可撤销）
 */

import { config } from "../../package.json";
import { diagnostics, recordError } from "./diagnostics";
import { comboFromEvent, matchCommand } from "./keymap";
import { getKeymap } from "./keymapStore";
import { resolvePdfColorCommand, type PdfAnnotationType } from "./pdfKeymap";
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

function getViewWindow(reader: any): any {
  try {
    return reader?._internalReader?._lastView?._iframeWindow ?? null;
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

function getLastColors(reader: any): { underline: string; highlight: string } {
  let colors = lastColors.get(reader);
  if (!colors) {
    colors = { underline: ANNOTATION_COLORS.red, highlight: ANNOTATION_COLORS.yellow };
    lastColors.set(reader, colors);
  }
  return colors;
}

/** 给选中批注改色；或给文本选区新建高亮/下划线。 */
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

    // 1) 已点选的批注：直接改色（与 Zotero 原生右键菜单一致）
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

function setCtrlState(reader: any, down: boolean): void {
  ctrlDown.set(reader, down);
  try {
    const doc = getReaderWindow(reader)?.document;
    const root = doc?.documentElement;
    if (root) root.classList.toggle("color-keys-ctrl", down);
  } catch {
    /* ignore */
  }
}

function isAccelPressed(reader: any): boolean {
  return ctrlDown.get(reader) === true;
}

// ---------------------------------------------------------------------------
// 选区弹窗优化
// ---------------------------------------------------------------------------

function injectPopupStyle(reader: any): void {
  try {
    const doc = getReaderWindow(reader)?.document;
    if (!doc?.head) return;
    if (doc.getElementById("color-keys-popup-style")) return;
    const style = doc.createElement("style");
    style.id = "color-keys-popup-style";
    // 1) 隐藏原生的高亮/下划线两个 A 按钮，改成单个模式指示器
    // 2) 指示器默认显示"下划线"，按住 Ctrl/Cmd 显示"高亮"
    style.textContent = `
      .selection-popup .tool-toggle { display: none !important; }
      .color-keys-mode {
        display: flex; align-items: center; gap: 6px;
        padding: 2px 0 4px; font-size: 15px; line-height: 1;
      }
      .color-keys-mode .ck-icon {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: 18px; height: 16px; padding: 0 2px; font-weight: 700;
      }
      .color-keys-mode .ck-underline {
        border-bottom: 3px solid var(--ck-underline-color, #ff6666);
      }
      .color-keys-mode .ck-highlight {
        display: none;
        border-radius: 3px;
        background: var(--ck-highlight-color, #ffd400);
      }
      html.color-keys-ctrl .color-keys-mode .ck-underline { display: none; }
      html.color-keys-ctrl .color-keys-mode .ck-highlight { display: inline-flex; }
      .color-keys-mode .ck-hint { opacity: .65; font-size: 11px; }
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
    let indicator = popup.querySelector(".color-keys-mode");
    if (!indicator) {
      indicator = doc.createElement("div");
      indicator.className = "color-keys-mode";

      const underline = doc.createElement("span");
      underline.className = "ck-icon ck-underline";
      underline.textContent = "Aa";

      const highlight = doc.createElement("span");
      highlight.className = "ck-icon ck-highlight";
      highlight.textContent = "Aa";

      const hint = doc.createElement("span");
      hint.className = "ck-hint";
      hint.textContent = String((Zotero as any).locale ?? "").startsWith("zh")
        ? "Ctrl 切换高亮"
        : "Ctrl for highlight";

      indicator.append(underline, highlight, hint);
      const colors = popup.querySelector(".colors");
      if (colors?.parentElement) {
        colors.parentElement.insertBefore(indicator, colors.nextElementSibling);
      } else {
        popup.appendChild(indicator);
      }
    }

    const colors = getLastColors(reader);
    (indicator as any).style.setProperty("--ck-underline-color", colors.underline);
    (indicator as any).style.setProperty("--ck-highlight-color", colors.highlight);
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
          const target = event.target as any;
          const button = target?.closest?.("button.color-button");
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

    // Tab / Shift+Tab：从侧栏注释输入框跳回阅读器正文
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
    const pdfCommand = resolvePdfColorCommand(event, Zotero.isMac, keymap);
    if (pdfCommand) {
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

export function installPdfBridge(): boolean {
  try {
    const Reader = (Zotero as any).Reader;
    if (!Reader) return false;

    for (const reader of Reader._readers ?? []) ensureReaderListeners(reader);

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
        Reader.unregisterEventListener(
          "renderTextSelectionPopup",
          selectionPopupHandler,
        );
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
