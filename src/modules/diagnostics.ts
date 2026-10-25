/**
 * 运行诊断状态：供设置面板展示（挂载数量、最近错误、BN/PDF 桥接检测结果）。
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
  pdfBridge: boolean;
  pdfReaders: number;
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
  pdfBridge: false,
  pdfReaders: 0,
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
  diagnostics.lastTrace = null;
  diagnostics.lastCombo = null;
  diagnostics.lastCommand = null;
  diagnostics.lastError = null;
  diagnostics.lastErrorAt = null;
  diagnostics.betterNotes = false;
  diagnostics.betterNotesBridge = false;
  diagnostics.pdfBridge = false;
  diagnostics.pdfReaders = 0;
  diagnostics.initializedAt = null;
}
