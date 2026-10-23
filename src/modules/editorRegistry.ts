/**
 * 编辑器挂载：包装 Zotero.Notes.registerEditorInstance，等 init 完成后
 * 在笔记编辑器 iframe 上挂捕获阶段的 keydown 监听。
 *
 * Spike 结论（docs/spike/2026-10-23-editor-hook.md）：
 * - 该方法在 EditorInstance.init() 第一行被调用，此时 _iframeWindow 尚不存在
 * - 就绪后 view 位于 iframeWindow._currentEditorInstance._editorCore.view
 * - 同一笔记存在 pane + tab 两个实例
 */

import { diagnostics, recordError } from "./diagnostics";
import { comboFromEvent, matchCommand } from "./keymap";
import { getKeymap } from "./keymapStore";
import { executeCommand } from "./colorCommands";

export interface EditorHandle {
  instance: Record<string, any>;
  iframeWindow: any;
  view: any;
  itemID: number | null;
  listener: ((event: any) => void) | null;
}

const READY_POLL_INTERVAL_MS = 500;
const READY_POLL_MAX_ATTEMPTS = 40;

const handles = new Map<string, EditorHandle>();
let hookInstalled = false;
let originalRegister: ((instance: any) => void) | null = null;
let originalUnregister: ((instance: any) => Promise<void>) | null = null;

function instanceKey(instance: Record<string, any>): string {
  return String(
    instance.instanceID ??
      `${instance._item?.id ?? "unknown"}:${instance._viewMode ?? ""}:${instance._tabID ?? ""}`,
  );
}

function getIframeWindow(instance: Record<string, any>): any {
  try {
    return (
      instance._iframeWindow?.wrappedJSObject ?? instance._iframeWindow ?? null
    );
  } catch {
    return null;
  }
}

function getView(instance: Record<string, any>): any {
  const win = getIframeWindow(instance);
  try {
    return win?._currentEditorInstance?._editorCore?.view ?? null;
  } catch {
    return null;
  }
}

async function waitForEditor(instance: Record<string, any>): Promise<void> {
  for (let attempt = 0; attempt < READY_POLL_MAX_ATTEMPTS; attempt += 1) {
    await Zotero.Promise.delay(READY_POLL_INTERVAL_MS);
    try {
      const win = getIframeWindow(instance);
      const view = getView(instance);
      if (win && view) {
        attachEditor(instance, win, view);
        return;
      }
    } catch {
      /* 实例可能在轮询期间被销毁 */
    }
  }
  recordError("waitForEditor", "editor iframe not ready within 20s");
}

function isEditableTarget(target: any): boolean {
  try {
    let element = target as any;
    while (element && element.nodeType !== 9 /* document */) {
      const tag = String(element.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") {
        return true;
      }
      if (element.isContentEditable === false && tag !== "body") {
        // 非可编辑容器（例如链接编辑/引用弹层）不拦截
        element = element.parentElement;
        continue;
      }
      if (tag === "body" || tag === "html") break;
      element = element.parentElement;
    }
    return false;
  } catch {
    return false;
  }
}

function isMarkdownMode(instance: Record<string, any>): boolean {
  try {
    const api = (Zotero as any).BetterNotes?.api?.editor;
    if (api?.isMarkdownMode) {
      return !!api.isMarkdownMode(instance);
    }
  } catch {
    /* BN 不存在或版本不支持时忽略 */
  }
  return false;
}

function onKeyDown(handle: EditorHandle, event: any): void {
  try {
    if (!event || event.defaultPrevented) return;
    if (event.isComposing) return;
    if (handle.instance._readOnly) return;
    if (isMarkdownMode(handle.instance)) return;
    if (isEditableTarget(event.target)) return;

    const combo = comboFromEvent(event, Zotero.isMac);
    if (!combo) return;

    const command = matchCommand(getKeymap(), combo);
    if (!command) return;

    const handled = executeCommand(handle, command);
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  } catch (error) {
    recordError("onKeyDown", error);
  }
}

function attachEditor(
  instance: Record<string, any>,
  iframeWindow: any,
  view: any,
): void {
  const key = instanceKey(instance);
  if (handles.has(key)) return;

  const handle: EditorHandle = {
    instance,
    iframeWindow,
    view,
    itemID: instance._item?.id ?? null,
    listener: null,
  };
  const listener = (event: any) => onKeyDown(handle, event);
  handle.listener = listener;

  try {
    iframeWindow.addEventListener("keydown", listener, true);
  } catch (error) {
    recordError("attachEditor", error);
    return;
  }

  handles.set(key, handle);
  diagnostics.attachedEditors = handles.size;
}

export function detachEditor(instance: Record<string, any>): void {
  const key = instanceKey(instance);
  const handle = handles.get(key);
  if (!handle) return;
  try {
    handle.iframeWindow?.removeEventListener("keydown", handle.listener, true);
  } catch {
    /* iframe 已销毁 */
  }
  handles.delete(key);
  diagnostics.attachedEditors = handles.size;
}

export function detachAllEditors(): void {
  for (const handle of [...handles.values()]) {
    try {
      handle.iframeWindow?.removeEventListener("keydown", handle.listener, true);
    } catch {
      /* ignore */
    }
  }
  handles.clear();
  diagnostics.attachedEditors = 0;
}

export function getEditorHandles(): EditorHandle[] {
  return [...handles.values()];
}

export function installEditorHook(): boolean {
  if (hookInstalled) return true;
  const notes = (Zotero as any).Notes;
  if (typeof notes?.registerEditorInstance !== "function") {
    recordError("installEditorHook", "Zotero.Notes.registerEditorInstance missing");
    return false;
  }

  originalRegister = notes.registerEditorInstance;
  originalUnregister = notes.unregisterEditorInstance ?? null;

  notes.registerEditorInstance = function (this: unknown, instance: any) {
    const result = originalRegister?.apply(this, arguments as any);
    diagnostics.registeredEditors += 1;
    try {
      void waitForEditor(instance);
    } catch (error) {
      recordError("registerEditorInstance", error);
    }
    return result;
  };

  if (typeof originalUnregister === "function") {
    notes.unregisterEditorInstance = function (this: unknown, instance: any) {
      try {
        detachEditor(instance);
      } catch (error) {
        recordError("unregisterEditorInstance", error);
      }
      return originalUnregister?.apply(this, arguments as any);
    };
  }

  hookInstalled = true;
  return true;
}

export function uninstallEditorHook(): void {
  detachAllEditors();
  try {
    const notes = (Zotero as any).Notes;
    if (!notes) return;
    if (originalRegister) notes.registerEditorInstance = originalRegister;
    if (originalUnregister) notes.unregisterEditorInstance = originalUnregister;
  } catch (error) {
    recordError("uninstallEditorHook", error);
  }
  originalRegister = null;
  originalUnregister = null;
  hookInstalled = false;
}
