/**
 * 运行诊断状态：供设置面板展示（挂载数量、最近错误、BN 检测结果）。
 */

export interface DiagnosticsState {
  attachedEditors: number;
  registeredEditors: number;
  keydownSeen: number;
  lastTrace: string | null;
  lastCombo: string | null;
  lastCommand: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  betterNotes: boolean;
  betterNotesBridge: boolean;
  initializedAt: string | null;
}

export const diagnostics: DiagnosticsState = {
  attachedEditors: 0,
  registeredEditors: 0,
  keydownSeen: 0,
  lastTrace: null,
  lastCombo: null,
  lastCommand: null,
  lastError: null,
  lastErrorAt: null,
  betterNotes: false,
  betterNotesBridge: false,
  initializedAt: null,
};

export function recordError(scope: string, error: unknown): void {
  diagnostics.lastError = `${scope}: ${error instanceof Error ? error.message : String(error)}`;
  diagnostics.lastErrorAt = new Date().toISOString();
}

export function resetDiagnostics(): void {
  diagnostics.attachedEditors = 0;
  diagnostics.registeredEditors = 0;
  diagnostics.keydownSeen = 0;
  diagnostics.lastCombo = null;
  diagnostics.lastCommand = null;
  diagnostics.lastError = null;
  diagnostics.lastErrorAt = null;
  diagnostics.betterNotes = false;
  diagnostics.betterNotesBridge = false;
  diagnostics.initializedAt = null;
}
