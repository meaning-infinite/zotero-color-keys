/**
 * 设置面板：
 * - 颜色与快捷键：多列网格（纵向为颜色），同时配置文字颜色与高亮两组键位
 * - 清除动作：单独一组
 * - 只保留一个"全部恢复默认"按钮
 * - PDF 阅读器：Tab 跳回阅读器开关 + 使用说明
 * - 诊断信息
 */

import { config } from "../../package.json";
import {
  COLOR_NAMES,
  type ColorName,
  highlightColorHex,
  textColorHex,
} from "./colors";
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
import { getKeymap, resetKeymapToDefaults, saveKeymap } from "./keymapStore";
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
    return getString(`color-${command.slice("textColor.".length)}`);
  }
  if (command.startsWith("backgroundColor.")) {
    return getString(`color-${command.slice("backgroundColor.".length)}`);
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
  const grid = doc.getElementById(prefixed("keymap-grid"));
  const actionRows = doc.getElementById(prefixed("action-rows"));
  const status = doc.getElementById(prefixed("status"));
  const diagnosticsEl = doc.getElementById(prefixed("diagnostics"));
  const resetAll = doc.getElementById(prefixed("reset-all"));
  const pdfOptions = doc.getElementById(prefixed("pdf-options"));
  if (!grid || !actionRows) return;

  for (const container of [grid, actionRows, pdfOptions]) {
    while (container && container.firstChild) {
      container.removeChild(container.firstChild);
    }
  }

  const keymap = getKeymap();

  const commit = (mutate: (target: Keymap) => void): void => {
    const next = cloneKeymap(getKeymap());
    mutate(next);
    if (saveKeymap(next)) renderPane(win);
  };

  const makeRow = (): HTMLElement => {
    const row = createEl(doc, "div", "color-keys-grid-row");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "10px";
    row.style.margin = "4px 0";
    return row;
  };

  const makeInput = (raw: string, onRecord: (raw: string) => void): HTMLInputElement => {
    const input = createEl(doc, "input", "color-keys-recorder") as HTMLInputElement;
    input.readOnly = true;
    input.style.width = "160px";
    attachRecorder(input, {
      isMac: Zotero.isMac,
      raw,
      unsetText: getString("unset"),
      recordingText: getString("recording"),
      onRecord,
    });
    return input;
  };

  // 表头
  const header = makeRow();
  const headColor = createEl(doc, "span", "color-keys-head");
  headColor.textContent = getString("column-color");
  headColor.style.minWidth = "190px";
  headColor.style.fontWeight = "600";
  const headText = createEl(doc, "span", "color-keys-head");
  headText.textContent = getString("column-text");
  headText.style.width = "160px";
  headText.style.fontWeight = "600";
  const headHighlight = createEl(doc, "span", "color-keys-head");
  headHighlight.textContent = getString("column-highlight");
  headHighlight.style.width = "160px";
  headHighlight.style.fontWeight = "600";
  header.append(headColor, headText, headHighlight);
  grid.appendChild(header);

  const separator = createEl(doc, "div");
  separator.style.borderTop = "1px solid rgba(128,128,128,0.35)";
  separator.style.margin = "4px 0 6px";
  separator.style.width = "100%";
  grid.appendChild(separator);

  // 每个颜色一行：色块 + 名称 | 文字颜色键 | 高亮键
  for (const color of COLOR_NAMES) {
    const row = makeRow();

    const labelCell = createEl(doc, "span", "color-keys-color-cell");
    labelCell.style.display = "inline-flex";
    labelCell.style.alignItems = "center";
    labelCell.style.gap = "8px";
    labelCell.style.minWidth = "190px";

    const swatch = createEl(doc, "span", "color-keys-swatch");
    swatch.style.display = "inline-block";
    swatch.style.width = "14px";
    swatch.style.height = "14px";
    swatch.style.borderRadius = "3px";
    swatch.style.border = "1px solid rgba(0,0,0,0.25)";
    swatch.style.backgroundColor = textColorHex(color);

    const name = createEl(doc, "span");
    name.textContent = getString(`color-${color}`);

    labelCell.append(swatch, name);
    row.appendChild(labelCell);

    row.appendChild(
      makeInput(keymap.textColor[color], (raw) =>
        commit((target) => setTextColor(target, color, raw)),
      ),
    );
    row.appendChild(
      makeInput(keymap.backgroundColor[color], (raw) =>
        commit((target) => setHighlightColor(target, color, raw)),
      ),
    );

    grid.appendChild(row);
  }

  // 清除动作
  for (const action of ["clearTextColor", "clearHighlight", "clearAll"] as ActionId[]) {
    const row = makeRow();
    const label = createEl(doc, "span");
    label.textContent = getString(ACTION_LABEL_KEYS[action]);
    label.style.minWidth = "190px";
    row.appendChild(label);
    row.appendChild(
      makeInput(keymap.actions[action], (raw) =>
        commit((target) => setAction(target, action, raw)),
      ),
    );
    actionRows.appendChild(row);
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
  if (pdfOptions) {
    const row = createEl(doc, "div", "color-keys-pdf-row");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "6px";
    row.style.margin = "3px 0";

    const checkbox = createEl(doc, "input") as HTMLInputElement;
    checkbox.type = "checkbox";
    checkbox.checked = getPref("pdfTabRefocus") !== false;
    checkbox.addEventListener("change", () => {
      setPref("pdfTabRefocus", checkbox.checked);
    });

    const label = createEl(doc, "span");
    label.textContent = getString("pdf-tab-refocus");
    row.append(checkbox, label);
    pdfOptions.appendChild(row);

    const help = createEl(doc, "div", "color-keys-pdf-help");
    help.textContent = getString("pdf-help");
    help.style.opacity = "0.75";
    help.style.marginTop = "4px";
    help.style.maxWidth = "640px";
    help.style.whiteSpace = "normal";
    pdfOptions.appendChild(help);
  }

  // 诊断信息
  if (diagnosticsEl) {
    const bn = diagnostics.betterNotes ? getString("bn-yes") : getString("bn-no");
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
