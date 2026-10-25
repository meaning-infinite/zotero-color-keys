/**
 * PDF 阅读器桥接：选中文本后按高亮快捷键，创建/改色 Zotero 高亮注解。
 *
 * 实现方式：所有 ProseMirror 之外的对象都在内容分区内执行，避免 Xray 边界。
 * 通过 reader iframe 内的 `window._reader` 访问 annotation manager
 * （createReader() 会把它挂在该 window 上）。
 *
 * 依据 Zotero 10.0.6 源码：
 * - Zotero.Reader._readers：当前打开的 reader 列表
 * - reader._iframeWindow：reader 应用 iframe
 * - reader._lastView：当前聚焦的 view，含 _selectionRanges / _selectedAnnotationIDs
 * - view._getAnnotationFromSelectionRanges(ranges, type, color)：从选区构造注解
 * - reader._annotationManager.addAnnotation / updateAnnotations：增删改并触发保存
 */

import { config } from "../../package.json";
import { diagnostics, recordError } from "./diagnostics";
import { comboFromEvent, matchCommand } from "./keymap";
import { getKeymap } from "./keymapStore";

/** Zotero 注解调色板（与 Zotero.Annotations.COLORS 一致，6 位 hex） */
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

const attachedReaders = new WeakSet<object>();
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

function applyPdfHighlight(reader: any, colorName: string): boolean {
  const hex = ANNOTATION_COLORS[colorName];
  if (!hex) return false;
  const win = getReaderWindow(reader);
  if (!win?.eval) return false;

  const script = `(() => {
    try {
      const reader = window._reader;
      if (!reader || reader._type !== "pdf") return false;
      const manager = reader._annotationManager;
      if (!manager || manager._readOnly) return false;
      const view = reader._lastView;
      if (!view) return false;
      const hex = ${JSON.stringify(hex)};

      // 1) 选中已有注解：直接改色
      const selected = view._selectedAnnotationIDs;
      if (selected && selected.length) {
        manager.updateAnnotations(selected.map(id => ({ id, color: hex })));
        return true;
      }

      // 2) 选中文本：新建高亮注解
      const ranges = view._selectionRanges;
      if (ranges && ranges.length && !(ranges[0] && ranges[0].collapsed)) {
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

function attachReader(reader: any): boolean {
  if (!reader || attachedReaders.has(reader)) return false;
  const win = getReaderWindow(reader);
  if (!win?.addEventListener) return false;
  try {
    win.addEventListener(
      "keydown",
      (event: any) => onReaderKeyDown(reader, event),
      true,
    );
  } catch (error) {
    recordError("attachReader", error);
    return false;
  }
  attachedReaders.add(reader);
  diagnostics.pdfReaders += 1;
  return true;
}

function attachAllReaders(): void {
  try {
    const readers = (Zotero as any).Reader?._readers ?? [];
    for (const reader of readers) attachReader(reader);
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
        attachReader(event?.reader);
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

    // renderToolbar 只在新 reader 渲染时触发；已打开的 reader 用轮询兜底
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
  try {
    const Reader = (Zotero as any).Reader;
    if (Reader && renderToolbarHandler && typeof Reader.unregisterEventListener === "function") {
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
