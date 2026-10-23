# E2E 验证记录：快捷键端到端

- 日期：2026-10-23
- 环境：Zotero 10.0.6，临时 profile（`%TEMP%\ck-spike\profile`）+ 临时数据目录
- 方法：临时分支 `test/e2e` 注入 harness，在笔记编辑器 iframe 内用 `win.eval` 构造并派发合成 `keydown`，随后读取 `item.getNote()` 校验 HTML
- 原始报告：`docs/testing/2026-10-23-e2e-report.json`

## 结果

| 检查项 | 结果 |
|---|---|
| `Ctrl+Alt+Shift+D` 清除整段颜色 | ✅ 段落无 `color:` / `background-color:` |
| `Alt+R` 文字变红 | ✅ `<span style="color: rgb(255, 32, 32);">` |
| 再按 `Alt+R` 取消（toggle） | ✅ 红色消失 |
| `Ctrl+Alt+Y` 黄色高亮 | ✅ `background-color` 出现 255,212,0 |
| `Ctrl+Alt+D` 清除高亮 | ✅ `background-color` 消失 |
| `Alt+Z` 未绑定键透传 | ✅ 笔记 HTML 未变化、事件未被拦截 |

harness 还顺带确认了运行期状态（记录在报告 `diagnostics` 字段）：

- `attachedEditors: 1`、`registeredEditors: 1`、`handle.viewMode: "tab"`
- `lastCombo` / `lastCommand` 与预期一致（如 `accel,alt,y` → `backgroundColor.yellow`）
- 无运行期错误（`lastError: null`）

## 已知的测试局限

1. **合成事件与真实按键有差异**：harness 通过 `win.eval` 在内容分区构造事件后，`event.preventDefault()` 在内容侧读回的 `defaultPrevented` 仍为 `false`（跨 Xray 边界观察结果），但功能断言全部通过。真实按键下 `preventDefault` 是否生效需要人工在 Zotero 里按一次确认（菜单/输入法不受影响即可）。
2. **harness 选择整篇文档**：为让 toggle 断言稳定，harness 每次先 `TextSelection.create(doc, 0, doc.content.size)`；真实使用中无选区时只作用当前段落，该语义由实现保证，未在 E2E 覆盖。
3. harness 代码只在临时分支，未进入 `main`。

## 人工待确认项

- 真实键盘按 `Alt+R` / `Ctrl+Alt+Y`：颜色变化、光标不丢、可以 `Ctrl+Z` 撤销
- 中文输入法输入时按 `Alt+组合` 不误触发
- 设置面板改键后立即生效
