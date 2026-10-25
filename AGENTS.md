# AGENTS.md — zotero-color-keys

## 默认技能

- 每轮对话默认加载 `caveman` 技能（极简输出，保留技术准确性）
- 仅在用户明确要求 `normal mode` 或 `stop caveman` 时退出

## 语言

- 对话：中文
- 代码注释：中文
- 提交信息：英文，Conventional Commits（`feat:` / `fix:` / `docs:` / `test:` / `chore:`）
- README：中英双语；CHANGELOG：英文

## 项目定位

Zotero 插件：给笔记与 PDF 阅读器提供可自定义的颜色快捷键。独立插件，Better Notes 作为可选增强。

基本功能（不再扩张，改动以此为准）：

- 笔记：`Alt+字母` 文字颜色、`Ctrl+Alt+字母` 高亮；同色再按取消；无选区作用于当前段落
- PDF：`Alt+字母` 下划线颜色、`Ctrl+Alt+字母` 高亮颜色；选中的批注类型不符时先转换类型再改色
- 选区弹窗：保留颜色行，隐藏原生高亮/下划线按钮，改为随 Ctrl 切换的模式指示器；默认点色=下划线，Ctrl+点色=高亮
- 设置：表格化键位配置（一行一颜色，两列文字/高亮）、单一“全部恢复默认”、三语、键位冲突检测、诊断区

## 权威文档

- 设计规格：`docs/superpowers/specs/2026-10-23-zotero-color-keys-design.md`
- 行为、键位、颜色值、面板结构以规格与本文档为准；改行为先改规格，再改代码
- 规格里的"决策记录"是评审依据，不要绕过

## 目录约定

| 路径 | 用途 |
|---|---|
| `src/modules/keymap.ts` | 键位解析/匹配/校验，纯函数 |
| `src/modules/keymapStore.ts` | pref 读写、缓存、观察 |
| `src/modules/colors.ts` | Zotero 颜色表、hex↔rgb 归一化 |
| `src/modules/editorRegistry.ts` | 笔记编辑器实例挂载与 iframe 监听 |
| `src/modules/colorCommands.ts` | 笔记 mark 写入（选区/段落/toggle） |
| `src/modules/pdfKeymap.ts` | PDF 快捷键语义解析（纯函数） |
| `src/modules/pdfBridge.ts` | PDF reader 监听、批注增改、选区弹窗改造 |
| `src/modules/prefsPane.ts` | 设置面板（表格布局） |
| `src/modules/hotkeyRecorder.ts` | 键位录制器 |
| `src/modules/bnBridge.ts` | Better Notes 可选增强 |
| `addon/locale/{zh-CN,en-US,zh-TW}/` | Fluent 文案 |
| `test/` | vitest 单测 |

## 常用命令

```bash
pnpm install
pnpm start        # 构建并启动 Zotero（热重载）
pnpm build        # zotero-plugin build + tsc --noEmit
pnpm test         # vitest
pnpm release      # 版本号 + 构建 + GitHub Release
```

## 硬性规则

1. `keymap.ts` / `pdfKeymap.ts` 不 import 任何 Zotero / toolkit API，保持纯函数，便于单测
2. 所有 Zotero 内部 API 调用必须 `try/catch`，失败写入诊断状态，不得崩溃、不得阻断用户输入
3. 新增或修改快捷键命令时同步：`addon/prefs.js` 默认值、keymap schema、三语 FTL、单测
4. 颜色值只取 Zotero 官方表：
   - 笔记：note-editor `src/core/schema/colors.js`
   - PDF 批注：`Zotero.Annotations.COLORS`（6 位 hex）
   改动需在注释里注明来源
5. 提交前必须 `pnpm typecheck && pnpm test`
6. 不提交 `node_modules/`、`.scaffold/`、`*.xpi` 等构建产物
7. 每次发布更新 `CHANGELOG.md`
8. 依赖新增需在提交说明中给理由；默认不引入新运行时依赖
9. 跨 compartment：传给 ProseMirror 的对象（mark attrs）必须在 iframe realm 内创建；PDF 侧统一在 reader 内容分区内 `win.eval` 执行，只传字符串
10. 笔记按 `itemID` 去重（同笔记 pane + tab 双实例）；PDF 的键盘监听必须同时挂 reader UI window 与 `_primaryView._secondaryView` 的 iframe window（PDF.js 在孙级 iframe，事件不冒泡）
11. PDF 批注只通过 `_annotationManager.updateAnnotations` / `addAnnotation` / `convertAnnotations` 操作，禁止直接改 item 字段；这样保留阅读器撤销栈
12. 选区弹窗改造依赖 DOM（`.selection-popup .colors` / `.tool-toggle`）与 React 结构，改动前先核对 `resource/reader/reader.js` 里 `selection-popup.js` 的实现；隐藏原生按钮时只加 CSS，不删 React 节点

## Zotero 内部依赖清单（版本脆弱点，升级 Zotero 时优先排查）

- 笔记：`Zotero.Notes.registerEditorInstance`、`_iframeWindow.wrappedJSObject._currentEditorInstance._editorCore.view`
- PDF：`Zotero.Reader._readers`、`reader._iframeWindow`、`reader._internalReader._primaryView/_secondaryView/_lastView`、`reader._state`、`reader._annotationManager`、`reader._lastView._selectionRanges`、`_getAnnotationFromSelectionRanges`、`reader.convertAnnotations`

## 验收

- 自动化：`pnpm test && pnpm build`
- 手工：笔记快捷键 4 条、PDF 6 条（新建高亮/下划线、改色、类型转换、弹窗点色、批注选中改色、输入栏内生效）
