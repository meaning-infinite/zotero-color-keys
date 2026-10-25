/**
 * 设置面板：
 * - 颜色与快捷键：表格布局（一行一种颜色，两列分别配置文字色/高亮键）
 * - 清除动作：表格布局
 * - 只保留一个"全部恢复默认"按钮
 * - PDF 阅读器：使用说明（快捷键在注释输入框聚焦时同样生效）
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
  if (!grid || !actionRows) return;

  for (const container of [grid, actionRows]) {
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

  const makeTable = (headers: string[] | null): HTMLTableElement => {
    const table = createEl(doc, "table", "color-keys-table") as HTMLTableElement;
    table.style.borderCollapse = "collapse";
    table.style.margin = "4px 0 8px";
    table.style.border = "1px solid rgba(128,128,128,0.3)";
    if (headers) {
      const thead = doc.createElement("thead");
      const tr = doc.createElement("tr");
      for (const text of headers) {
        const th = doc.createElement("th");
        th.textContent = text;
        th.style.padding = "6px 12px";
        th.style.textAlign = "center";
        th.style.fontWeight = "600";
        th.style.borderBottom = "1px solid rgba(128,128,128,0.35)";
        tr.appendChild(th);
      }
      thead.appendChild(tr);
      table.appendChild(thead);
    }
    return table;
  };

  const makeInputCell = (
    raw: string,
    onRecord: (raw: string) => void,
  ): HTMLTableCellElement => {
    const td = doc.createElement("td");
    td.style.padding = "4px 10px";
    td.style.textAlign = "center";
    td.style.verticalAlign = "middle";
    td.style.borderBottom = "1px solid rgba(128,128,128,0.15)";

    const input = createEl(doc, "input", "color-keys-recorder") as HTMLInputElement;
    input.readOnly = true;
    input.style.width = "150px";
    input.style.textAlign = "center";
    attachRecorder(input, {
      isMac: Zotero.isMac,
      raw,
      unsetText: getString("unset"),
      recordingText: getString("recording"),
      onRecord,
    });
    td.appendChild(input);
    return td;
  };

  // 颜色 × 快捷键表格
  const table = makeTable([
    getString("column-color"),
    getString("column-text"),
    getString("column-highlight"),
  ]);
  const tbody = doc.createElement("tbody");

  for (const color of COLOR_NAMES) {
    const tr = doc.createElement("tr");

    const colorCell = doc.createElement("td");
    colorCell.style.padding = "4px 12px";
    colorCell.style.verticalAlign = "middle";
    colorCell.style.borderBottom = "1px solid rgba(128,128,128,0.15)";
    colorCell.style.whiteSpace = "nowrap";

    const inner = createEl(doc, "span");
    inner.style.display = "inline-flex";
    inner.style.alignItems = "center";
    inner.style.gap = "8px";

    const swatch = createEl(doc, "span", "color-keys-swatch");
    swatch.style.display = "inline-block";
    swatch.style.width = "14px";
    swatch.style.height = "14px";
    swatch.style.borderRadius = "3px";
    swatch.style.border = "1px solid rgba(0,0,0,0.25)";
    swatch.style.backgroundColor = textColorHex(color);

    const name = createEl(doc, "span");
    name.textContent = getString(`color-${color}`);

    inner.append(swatch, name);
    colorCell.appendChild(inner);
    tr.appendChild(colorCell);

    tr.appendChild(
      makeInputCell(keymap.textColor[color], (raw) =>
        commit((target) => setTextColor(target, color, raw)),
      ),
    );
    tr.appendChild(
      makeInputCell(keymap.backgroundColor[color], (raw) =>
        commit((target) => setHighlightColor(target, color, raw)),
      ),
    );

    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  grid.appendChild(table);

  // 清除动作表格
  const actionTable = makeTable([getString("column-action"), getString("column-key")]);
  const actionBody = doc.createElement("tbody");
  for (const action of ["clearTextColor", "clearHighlight", "clearAll"] as ActionId[]) {
    const tr = doc.createElement("tr");

    const labelCell = doc.createElement("td");
    labelCell.textContent = getString(ACTION_LABEL_KEYS[action]);
    labelCell.style.padding = "4px 12px";
    labelCell.style.verticalAlign = "middle";
    labelCell.style.borderBottom = "1px solid rgba(128,128,128,0.15)";
    labelCell.style.whiteSpace = "nowrap";
    tr.appendChild(labelCell);

    tr.appendChild(
      makeInputCell(keymap.actions[action], (raw) =>
        commit((target) => setAction(target, action, raw)),
      ),
    );
    actionBody.appendChild(tr);
  }
  actionTable.appendChild(actionBody);
  actionRows.appendChild(actionTable);

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
