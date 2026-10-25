/**
 * PDF 阅读器桥接：选中文本按高亮快捷键 → 给选区上高亮 / 改选区下已有高亮的颜色。
 *
 * 关键事实（Zotero 10.0.6 静态源码核验）：
 * - PDF.js 在阅读器 UI 的孙级 iframe 里，keydown 不冒泡到阅读器 UI 窗口，
 *   所以监听必须同时挂在 reader UI window 和 view iframe window 上
 * - 所有对象都在阅读器内容分区内操作（win.eval），避免 Xray 跨分区丢属性
 * - 改色走 _annotationManager.updateAnnotations（Zotero 原生右键菜单同款，可撤销）
 * - 新建走 view._getAnnotationFromSelectionRanges + addAnnotation
 */

import { config } from "../../package.json";
import { diagnostics, recordError } from "./diagnostics";
import { comboFromEvent, matchCommand } from "./keymap";
import { getKeymap } from "./keymapStore";

/** Zotero 注解调色板（与 Zotero.Annotations.COLORS 一致） */
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

function applyPdfHighlight(reader: any, colorName: string): boolean {
  const hex = ANNOTATION_COLORS[colorName];
  if (!hex) return false;
  const win = getReaderWindow(reader);
  if (!win?.eval) return false;

  const script = `(() => {
    try {
      const reader = window._reader;
      if (!reader) return false;
      const state = reader._state;
      if (!state || state.readOnly) return false;
      const manager = reader._annotationManager;
      if (!manager || manager._readOnly) return false;

      const hex = ${JSON.stringify(hex)};
      const annotations = (state.annotations && state.annotations.length ? state.annotations : manager._annotations) || [];
      const view = reader._lastView;
      if (!view) return false;

      const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
      const pos = typeof view.getSelectionPosition === "function" ? view.getSelectionPosition() : null;

      const targets = [];
      const addTarget = (annotation) => {
        if (annotation && !annotation.readOnly && !targets.includes(annotation)) targets.push(annotation);
      };

      // 1) 明确点选的批注
      const selected = state.selectedAnnotationIDs || [];
      for (const id of selected) {
        const annotation = annotations.find((x) => x.id === id);
        if (annotation) addTarget(annotation);
      }

      // 2) 选区矩形与现有高亮/下划线相交 → 改色，而不是叠一个新批注
      if (!targets.length && pos && pos.rects && pos.rects.length) {
        for (const annotation of annotations) {
          if (!annotation || annotation.readOnly) continue;
          if (annotation.type !== "highlight" && annotation.type !== "underline") continue;
          if (!annotation.position || annotation.position.pageIndex !== pos.pageIndex) continue;
          const rects = annotation.position.rects || [];
          if (rects.some((r) => pos.rects.some((s) => hit(r, s)))) addTarget(annotation);
        }
      }

      if (targets.length) {
        manager.updateAnnotations(targets.map((a) => ({ id: a.id, color: hex })));
        return true;
      }

      // 3) 纯文本选区 → 新建高亮
      const ranges = view._selectionRanges;
      if (
        ranges &&
        ranges.length &&
        !(ranges[0] && ranges[0].collapsed) &&
        typeof view._getAnnotationFromSelectionRanges === "function"
      ) {
        const annotation = view._getAnnotationFromSelectionRanges(ranges, "highlight", hex);
        if (!annotation) return false;
        manager.addAnnotation(annotation);
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  })()`;

  try {
    return !!win.eval(script);
  } catch (error) {
    recordError("applyPdfHighlight", error);
    return false;
  }
}

function onReaderKeyDown(reader: any, event: any): void {
  try {
    if (!event || event.defaultPrevented || event.isComposing) return;
    if (isTextBoxTarget(event.target)) return;
    const combo = comboFromEvent(event, Zotero.isMac);
    if (!combo) return;
    const command = matchCommand(getKeymap(), combo);
    if (!command) return;
    if (!command.startsWith("backgroundColor.")) return;

    const handled = applyPdfHighlight(reader, command.slice("backgroundColor.".length));
    if (handled) {
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
  // 1) 阅读器 UI 窗口（工具栏/侧栏/弹窗焦点时）
  attachWindow(reader, getReaderWindow(reader));

  // 2) PDF.js 视图 iframe（正文焦点时；这才是绝大多数情况）
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

function attachAllReaders(): void {
  try {
    const readers = (Zotero as any).Reader?._readers ?? [];
    for (const reader of readers) ensureReaderListeners(reader);
  } catch (error) {
    recordError("attachAllReaders", error);
  }
}

export function installPdfBridge(): boolean {
  try {
    const Reader = (Zotero as any).Reader;
    if (!Reader) return false;

    attachAllReaders();

    renderToolbarHandler = (event: any) => {
      try {
        ensureReaderListeners(event?.reader);
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

    // 视图 iframe 晚于 reader 创建，用轮询补齐监听
    if (pollTimer === null) {
      pollTimer = setInterval(attachAllReaders, 2000) as unknown as number;
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
