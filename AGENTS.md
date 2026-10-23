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

Zotero 插件：在笔记编辑器中提供可自定义的文字颜色/高亮颜色快捷键。独立插件，Better Notes 作为可选增强。

## 权威文档

- 设计规格：`docs/superpowers/specs/2026-10-23-zotero-color-keys-design.md`
- 行为、键位、颜色值、面板结构以规格为准；改行为先改规格，再改代码
- 规格中的"决策记录"是评审依据，不要绕过

## 目录约定

| 路径 | 用途 |
|---|---|
| `src/modules/keymap.ts` | 键位解析/匹配/校验，纯函数 |
| `src/modules/editorRegistry.ts` | 编辑器实例挂载与 iframe 监听 |
| `src/modules/colorCommands.ts` | 作用范围计算与 mark 写入 |
| `src/modules/prefsPane.ts` | 设置面板 |
| `src/modules/hotkeyRecorder.ts` | 键位录制器 |
| `src/modules/bnBridge.ts` | Better Notes 可选增强 |
| `addon/locale/{zh-CN,en-US,zh-TW}/` | Fluent 文案 |
| `test/` | vitest 单测 |

## 常用命令

```bash
pnpm install
pnpm start        # 构建并启动 Zotero（热重载）
pnpm build
pnpm typecheck
pnpm test
pnpm release
```

## 硬性规则

1. `keymap.ts` 不 import 任何 Zotero / toolkit API，保持纯函数，便于单测
2. Zotero 内部 API（`Zotero.Notes.registerEditorInstance`、`_editorCore`、`BetterNotesEditorAPI` 等）调用必须 `try/catch`，失败写入诊断状态，不得崩溃、不得阻断用户输入
3. 新增或修改快捷键命令时同步四处：`addon/prefs.js` 默认值、keymap schema、三语 FTL、单测
4. 颜色值只取 Zotero note-editor `src/core/schema/colors.js`，改动需在注释里注明来源
5. 提交前必须 `pnpm typecheck && pnpm test`
6. 不提交 `node_modules/`、`.scaffold/`、`*.xpi` 等构建产物
7. 每次发布更新 `CHANGELOG.md`
8. 依赖新增需在 PR/提交说明中给理由；默认不引入新运行时依赖

## 验收

- 自动化：`pnpm typecheck && pnpm test && pnpm build`
- 手工：规格 §9.2 十条清单
