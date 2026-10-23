/**
 * Better Notes 可选增强：把颜色命令注册到 BN 的 Magic Key 命令面板。
 *
 * 仅在 Zotero.BetterNotes.api.editor.registerMagicKeyCommand 存在时生效；
 * BN 缺席时静默跳过，不影响主功能。
 */

import { COLOR_NAMES } from "./colors";
import { executeCommand } from "./colorCommands";
import { diagnostics, recordError } from "./diagnostics";
import type { EditorHandle } from "./editorRegistry";
import { ACTION_LABEL_KEYS, type ActionId, type CommandId } from "./keymap";
import { getString } from "../utils/locale";

const registeredIds: string[] = [];

function commandLabel(command: CommandId): string {
  if (command.startsWith("textColor.")) {
    return getString(`color-${command.slice("textColor.".length)}`);
  }
  if (command.startsWith("backgroundColor.")) {
    return getString(`color-${command.slice("backgroundColor.".length)}`);
  }
  const action = command.slice("actions.".length) as ActionId;
  return getString(ACTION_LABEL_KEYS[action]);
}

function buildCommands(): CommandId[] {
  const commands: CommandId[] = [];
  for (const name of COLOR_NAMES) {
    commands.push(`textColor.${name}`);
    commands.push(`backgroundColor.${name}`);
  }
  commands.push("actions.clearTextColor");
  commands.push("actions.clearHighlight");
  commands.push("actions.clearAll");
  return commands;
}

function handleFromBnEditor(editor: any): EditorHandle | null {
  try {
    const iframeWindow =
      editor?._iframeWindow?.wrappedJSObject ?? editor?._iframeWindow;
    const view = iframeWindow?._currentEditorInstance?._editorCore?.view;
    if (!view) return null;
    return {
      instance: editor,
      iframeWindow,
      view,
      itemID: editor?._item?.id ?? null,
      listener: null,
    };
  } catch {
    return null;
  }
}

export function installBetterNotesBridge(): boolean {
  try {
    const api = (Zotero as any).BetterNotes?.api?.editor;
    diagnostics.betterNotes = !!api;
    if (typeof api?.registerMagicKeyCommand !== "function") {
      diagnostics.betterNotesBridge = false;
      return false;
    }

    for (const command of buildCommands()) {
      const id = `color-keys.${command}`;
      try {
        api.registerMagicKeyCommand({
          id,
          title: commandLabel(command),
          handler: (editor: any) => {
            const handle = handleFromBnEditor(editor);
            if (!handle) return;
            executeCommand(handle, command);
          },
        });
        registeredIds.push(id);
      } catch (error) {
        recordError(`registerMagicKeyCommand(${id})`, error);
      }
    }

    diagnostics.betterNotesBridge = registeredIds.length > 0;
    return diagnostics.betterNotesBridge;
  } catch (error) {
    recordError("installBetterNotesBridge", error);
    diagnostics.betterNotesBridge = false;
    return false;
  }
}

export function uninstallBetterNotesBridge(): void {
  const api = (Zotero as any).BetterNotes?.api?.editor;
  const unregister = api?.unregisterMagicKeyCommand;
  if (typeof unregister === "function") {
    for (const id of registeredIds) {
      try {
        unregister(id);
      } catch {
        /* 插件卸载顺序不确定，忽略 */
      }
    }
  }
  registeredIds.length = 0;
  diagnostics.betterNotesBridge = false;
}
