/**
 * 设置面板：渲染颜色/高亮/清除三组键位行，处理录制、冲突提示、恢复默认、诊断。
 */

import { config } from "../../package.json";
import { COLOR_NAMES, type ColorName, highlightColorHex, textColorHex } from "./colors";
import { diagnostics } from "./diagnostics";
import { attachRecorder } from "./hotkeyRecorder";
import { getString } from "../utils/locale";
import {
  ACTION_LABEL_KEYS,
  findConflicts,
  type ActionId,
  type CommandId,
  type Keymap,
} from "./keymap";
import { DEFAULT_KEYMAP, cloneKeymap } from "./keymapDefaults";
import {
  getKeymap,
  resetKeymapToDefaults,
  saveKeymap,
} from "./keymapStore";
import { getPref, setPref } from "../utils/prefs";

const HTML_NS = "http://www.w3.org/1999/xhtml";

let resetAllBound = false;

function prefixed(id: string): string {
  return `${config.addonRef}-${id}`;
}

function createEl(doc: Document, tag: string, className?: string): HTMLElement {
  const element = doc.createElementNS(HTML_NS, tag) as HTMLElement;
  if (className) element.className = className;
  return element;
}

function setTextColor(keymap: Keymap, color: ColorName, raw: string): void {
  keymap.textColor[color] = raw;
}

function setHighlightColor(keymap: Keymap, color: ColorName, raw: string): void {
  keymap.backgroundColor[color] = raw;
}

function setAction(keymap: Keymap, action: ActionId, raw: string): void {
  keymap.actions[action] = raw;
}

function commandLabel(command: CommandId): string {
  if (command.startsWith("textColor.")) {
    return `${getString(`color-${command.slice("textColor.".length)}`)}`;
  }
  if (command.startsWith("backgroundColor.")) {
    return `${getString(`color-${command.slice("backgroundColor.".length)}`)}`;
  }
  const action = command.slice("actions.".length) as ActionId;
  return getString(ACTION_LABEL_KEYS[action]);
}

function normalizeCommandLabel(command: CommandId): string {
  return commandLabel(command).replace(/^color-keys-/, "");
}

export function initPrefsPane(win: Window): void {
  try {
    renderPane(win as any);
  } catch (error) {
    addon.data.ztoolkit.log("Failed to render prefs pane", error);
  }
}

function renderPane(win: any): void {
  const doc: Document = win.document;
  const textRows = doc.getElementById(prefixed("text-rows"));
  const highlightRows = doc.getElementById(prefixed("highlight-rows"));
  const actionRows = doc.getElementById(prefixed("action-rows"));
  const status = doc.getElementById(prefixed("status"));
  const diagnosticsEl = doc.getElementById(prefixed("diagnostics"));
  const resetAll = doc.getElementById(prefixed("reset-all"));
  if (!textRows || !highlightRows || !actionRows) return;

  for (const container of [textRows, highlightRows, actionRows]) {
    while (container.firstChild) container.removeChild(container.firstChild);
  }

  const keymap = getKeymap();

  const commit = (mutate: (target: Keymap) => void): void => {
    const next = cloneKeymap(getKeymap());
    mutate(next);
    if (saveKeymap(next)) {
      renderPane(win);
    }
  };

  const addRow = (
    container: Element,
    label: string,
    raw: string,
    defaultRaw: string,
    swatchHex: string | null,
    onRecord: (raw: string) => void,
  ): void => {
    const row = createEl(doc, "div", "color-keys-row");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.margin = "3px 0";

    if (swatchHex) {
      const swatch = createEl(doc, "span", "color-keys-swatch");
      swatch.style.display = "inline-block";
      swatch.style.width = "14px";
      swatch.style.height = "14px";
      swatch.style.borderRadius = "3px";
      swatch.style.border = "1px solid rgba(0,0,0,0.25)";
      swatch.style.backgroundColor = swatchHex;
      row.appendChild(swatch);
    }

    const labelEl = createEl(doc, "span", "color-keys-label");
    labelEl.textContent = label;
    labelEl.style.minWidth = "170px";
    row.appendChild(labelEl);

    const input = createEl(doc, "input", "color-keys-recorder") as HTMLInputElement;
    input.readOnly = true;
    input.style.width = "190px";
    row.appendChild(input);

    const reset = createEl(doc, "button", "color-keys-reset") as HTMLButtonElement;
    reset.textContent = getString("reset");
    reset.addEventListener("click", () => onRecord(defaultRaw));
    row.appendChild(reset);

    container.appendChild(row);

    attachRecorder(input, {
      isMac: Zotero.isMac,
      raw,
      unsetText: getString("unset"),
      recordingText: getString("recording"),
      onRecord,
    });
  };

  for (const color of COLOR_NAMES) {
    addRow(
      textRows,
      getString(`color-${color}`),
      keymap.textColor[color],
      DEFAULT_KEYMAP.textColor[color],
      textColorHex(color),
      (raw) => commit((target) => setTextColor(target, color, raw)),
    );
  }

  for (const color of COLOR_NAMES) {
    addRow(
      highlightRows,
      getString(`color-${color}`),
      keymap.backgroundColor[color],
      DEFAULT_KEYMAP.backgroundColor[color],
      highlightColorHex(color).slice(0, 7),
      (raw) => commit((target) => setHighlightColor(target, color, raw)),
    );
  }

  for (const action of ["clearTextColor", "clearHighlight", "clearAll"] as ActionId[]) {
    addRow(
      actionRows,
      getString(ACTION_LABEL_KEYS[action]),
      keymap.actions[action],
      DEFAULT_KEYMAP.actions[action],
      null,
      (raw) => commit((target) => setAction(target, action, raw)),
    );
  }

  // 冲突提示
  if (status) {
    const conflicts = findConflicts(getKeymap());
    if (conflicts.size) {
      const names = [...conflicts.values()]
        .map((commands) => commands.map(normalizeCommandLabel).join(" / "))
        .join("; ");
      status.textContent = getString("conflict", { args: { names } });
      (status as any).style.color = "#c0392b";
    } else {
      status.textContent = "";
    }
  }

  // PDF 阅读器选项
  const pdfOptions = doc.getElementById(prefixed("pdf-options"));
  if (pdfOptions) {
    while (pdfOptions.firstChild) pdfOptions.removeChild(pdfOptions.firstChild);

    const addCheckbox = (
      labelKey: string,
      prefKey: "pdfTabRefocus" | "pdfShowToolbarColors",
    ): void => {
      const row = createEl(doc, "div", "color-keys-pdf-row");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "6px";
      row.style.margin = "3px 0";

      const checkbox = createEl(doc, "input") as HTMLInputElement;
      checkbox.type = "checkbox";
      checkbox.checked = getPref(prefKey) !== false;
      checkbox.addEventListener("change", () => {
        setPref(prefKey, checkbox.checked);
      });

      const label = createEl(doc, "span", "color-keys-label");
      label.textContent = getString(labelKey);

      row.appendChild(checkbox);
      row.appendChild(label);
      pdfOptions.appendChild(row);
    };

    addCheckbox("pdf-tab-refocus", "pdfTabRefocus");
    addCheckbox("pdf-toolbar-colors", "pdfShowToolbarColors");

    const selectRow = createEl(doc, "div", "color-keys-pdf-row");
    selectRow.style.display = "flex";
    selectRow.style.alignItems = "center";
    selectRow.style.gap = "6px";
    selectRow.style.margin = "3px 0";

    const selectLabel = createEl(doc, "span", "color-keys-label");
    selectLabel.textContent = getString("pdf-click-action");
    selectLabel.style.minWidth = "170px";

    const select = createEl(doc, "select") as HTMLSelectElement;
    for (const [value, labelKey] of [
      ["apply", "pdf-click-apply"],
      ["set-tool", "pdf-click-set-tool"],
    ] as const) {
      const option = createEl(doc, "option") as HTMLOptionElement;
      option.value = value;
      option.textContent = getString(labelKey);
      if (String(getPref("pdfColorClickAction")) === value) option.selected = true;
      select.appendChild(option);
    }
    select.addEventListener("change", () => {
      setPref("pdfColorClickAction", select.value);
    });

    selectRow.appendChild(selectLabel);
    selectRow.appendChild(select);
    pdfOptions.appendChild(selectRow);
  }

  // 诊断信息
  if (diagnosticsEl) {
    const bn = diagnostics.betterNotes
      ? getString("bn-yes")
      : getString("bn-no");
    diagnosticsEl.textContent = getString("diagnostics", {
      args: {
        attached: diagnostics.attachedEditors,
        registered: diagnostics.registeredEditors,
        bn,
      },
    });
    const extra: string[] = [`PDF: ${diagnostics.pdfReaders}`];
    if (diagnostics.lastError) extra.push(diagnostics.lastError);
    diagnosticsEl.textContent += `\n${extra.join(" | ")}`;
    (diagnosticsEl as any).style.opacity = "0.75";
    (diagnosticsEl as any).style.whiteSpace = "pre-wrap";
  }

  if (resetAll && !resetAllBound) {
    resetAllBound = true;
    resetAll.addEventListener("click", () => {
      resetKeymapToDefaults();
      renderPane(win);
    });
  }
}
