/**
 * 键位录制器：把一个只读 input 变成「按一下快捷键就录入」的控件。
 *
 * 录制规则：
 * - 只按修饰键不算组合
 * - Esc 取消（恢复原值）
 * - Backspace（无修饰键）解绑
 * - 其余组合归一化成存储格式（accel/alt/... 逗号分隔）
 */

import { comboFromEvent, formatCombo, serializeCombo } from "./keymap";

export interface RecorderOptions {
  isMac: boolean;
  /** 当前绑定（存储格式），空字符串表示未绑定 */
  raw: string;
  /** 解绑/取消/未绑定时的显示文本 */
  unsetText: string;
  /** 进入录制态时的提示文本 */
  recordingText: string;
  /** 录到新组合（存储格式） */
  onRecord: (raw: string) => void;
}

export function attachRecorder(
  input: HTMLInputElement,
  options: RecorderOptions,
): void {
  const display = (): void => {
    input.value = options.raw ? formatCombo(options.raw, options.isMac) : options.unsetText;
  };
  display();

  let recording = false;

  const enterRecording = (): void => {
    recording = true;
    input.value = options.recordingText;
  };

  const leaveRecording = (): void => {
    recording = false;
    display();
  };

  input.addEventListener("focus", () => {
    enterRecording();
    try {
      input.select();
    } catch {
      /* ignore */
    }
  });

  input.addEventListener("blur", () => leaveRecording());

  input.addEventListener(
    "keydown",
    (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        leaveRecording();
        input.blur();
        return;
      }

      const hasModifier = event.ctrlKey || event.altKey || event.metaKey;
      if (event.key === "Backspace" && !hasModifier) {
        options.onRecord("");
        leaveRecording();
        return;
      }

      const combo = comboFromEvent(event, options.isMac);
      if (!combo) return;

      options.onRecord(serializeCombo(combo));
      leaveRecording();
    },
    true,
  );

  // 录制态下点击不退出，避免用户点击后光标丢失
  input.addEventListener("mousedown", (event) => {
    if (recording) event.preventDefault();
  });
}
