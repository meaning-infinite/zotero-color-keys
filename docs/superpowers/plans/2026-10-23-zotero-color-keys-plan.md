# Zotero Color Keys 实现计划

- 日期：2026-10-23
- 依据：[设计规格](../specs/2026-10-23-zotero-color-keys-design.md)（已批准）
- 状态：待用户确认后执行

## 总览

8 个阶段，每阶段有明确 done 标准。阶段 0 是硬门禁：spike 不通过就改走规格 4.3 退路，不进入阶段 2。

| 阶段 | 内容 | 预计 |
|---|---|---|
| 0 | 模板初始化 + hook spike | 1 天 |
| 1 | 纯逻辑库（颜色/keymap/prefs） | 1 天 |
| 2 | 编辑器挂载与按键拦截 | 1–2 天 |
| 3 | 颜色命令 | 1–2 天 |
| 4 | 设置面板与录制器 | 1–2 天 |
| 5 | BN 增强 | 0.5 天 |
| 6 | 测试 / CI / 文档 | 1 天 |
| 7 | 发布与上架 | 1 天 |

## 阶段 0：环境、模板、spike

### 0.1 账号与工具（已完成）

- `gh` 便携版装在 `C:\Users\DYT\tools\gh\bin`，`gh auth login --web` 浏览器授权完成（账号 `meaning-infinite`，scope：`repo`、`read:org`、`gist`）
- `gh auth setup-git` 已配置 git 凭据助手；不再使用任何 PAT
- 待补：`gh auth refresh -h github.com -s workflow`（推送 `.github/workflows/` 需要 workflow scope），在阶段 6 加 CI 前执行
- TRAE `mcp.json` 里的旧 PAT 由用户自行 revoke

### 0.2 骨架搭建（自写，非模板复制）

`windingwind/zotero-plugin-template` 为 AGPL-3.0，复制会使插件变为 AGPL，与 MIT 目标冲突。因此只参考其结构，代码全部自写。

```bash
pnpm install
pnpm build
pnpm start   # 本地装插件冒烟
```

| 文件 | 内容 |
|---|---|
| `package.json` | name `zotero-color-keys`、version `0.0.1`、`config.addonName/addonID/addonRef/addonInstance/prefsPrefix` |
| `addon/manifest.json` | 占位符由 scaffold 注入；id `color-keys@meaning-infinite`、min 8.0、max 10.* |
| `zotero-plugin.config.ts` | scaffold 配置、`updateURL`、esbuild 入口 |
| `addon/bootstrap.js` | 自写 Zotero bootstrap：注册 chrome、加载脚本、转发 hooks |
| `addon/prefs.js` | 规格 5.4 的 keymap JSON 默认值 + `enable` + `debug` |
| `addon/locale/{zh-CN,en-US,zh-TW}/` | 最小 FTL（插件名、面板标题、占位文案） |
| `src/**` | index/addon/hooks/utils 最小实现，`addon.data.initialized` 供 scaffold 测试探测 |

done：`pnpm build` 产出 `.scaffold/build/*.xpi`；`pnpm typecheck` 无错。

### 0.3 spike（硬门禁）

在 Zotero devtools 控制台验证 4 件事：

1. `typeof Zotero.Notes.registerEditorInstance` 是否为函数，签名与调用时机
2. 实例对象上如何拿到 iframe window、ProseMirror `view`/`schema`（记录精确属性路径：`_editorCore` / `_iframeWindow.wrappedJSObject` 等）
3. 能否用 `view.dispatch(view.state.tr.addMark(...))` 写入 `textColor`、`backgroundColor` 并落盘（保存后重开笔记确认）
4. 无选区时 `$from.blockRange($from)` 能否覆盖整段

产出：`docs/spike/2026-10-23-editor-hook.md`，含代码片段、属性路径、结论（走主路径 / 退路）。

done：spike 文档结论明确，且写入 mark 后重开笔记颜色仍在。

## 阶段 1：纯逻辑库

| 步骤 | 文件 | 内容 | 验证 |
|---|---|---|---|
| 1.1 | `src/modules/colors.ts` | 8 色常量 + 类型（`ColorName`、`TEXT_COLORS`、`HIGHLIGHT_COLORS`），来源注释指向 Zotero colors.js | 单测断言 hex 值 |
| 1.2 | `src/modules/keymap.ts` | `parseKey` / `serializeKey` / `matchEvent` / `validateKeymap` / `findConflicts`，不 import Zotero API | `test/keymap.test.ts` ≥ 12 例 |
| 1.3 | `src/modules/keymapDefaults.ts` | 规格 5.4 默认值对象（唯一事实源），prefs.js 由它生成 | 单测：默认值过校验 |
| 1.4 | pref 读取/观察 | `src/modules/prefs.ts` 读 keymap、非法回退默认、热更新订阅 | 单测：坏 JSON 回退 |

done：`pnpm test` 全绿；`pnpm typecheck` 无错。

## 阶段 2：编辑器挂载与拦截

| 步骤 | 文件 | 内容 | 验证 |
|---|---|---|---|
| 2.1 | `src/modules/editorRegistry.ts` | 链式包装 `registerEditorInstance`；`attachEditor(instance)` 挂 iframe capture keydown；shutdown 全量摘除 | 诊断区显示实例数 |
| 2.2 | 同上 | 焦点过滤（`activeElement` 输入类跳过）、`isComposing` 跳过、只读/Markdown 跳过、命中后 preventDefault | 手工：只读笔记不拦截 |
| 2.3 | `src/modules/diagnostics.ts` | 挂载数量、最近一次错误、BN 检测结果，供面板读取 | 面板能看到状态 |

done：原生笔记里按 Alt+R 控制台打印命中命令（此时命令可先空实现）。

## 阶段 3：颜色命令

| 步骤 | 文件 | 内容 | 验证 |
|---|---|---|---|
| 3.1 | `src/modules/colorCommands.ts` | `resolveRange(state)`：选区优先，空选区取 `blockRange` | 单测（mock selection） |
| 3.2 | 同上 | `applyTextColor` / `applyHighlight` / `clearTextColor` / `clearHighlight` / `clearAll`；同色 toggle；不碰其他 mark | 手工验收 1–4 |
| 3.3 | 同上 | 全部 API 调用 try/catch，异常写 diagnostics 并透传按键 | 故意抛错演练 |

done：规格 9.2 第 1–4 条通过；撤销栈正常。

## 阶段 4：设置面板

| 步骤 | 文件 | 内容 | 验证 |
|---|---|---|---|
| 4.1 | `addon/content/preferences.xhtml` | 说明区、两组行、全部恢复默认、诊断区 | 面板能打开 |
| 4.2 | `src/modules/hotkeyRecorder.ts` | 录制态、纯修饰键忽略、Esc 取消、Backspace 清除、本地化显示、冲突检查 | 手工录 3 个键 |
| 4.3 | `src/modules/prefsPane.ts` | 渲染行、写 pref、pref 观察器热生效、单行恢复默认 | 改键后立即生效，重启保持 |

done：规格 9.2 第 10 条通过。

## 阶段 5：Better Notes 增强

| 步骤 | 文件 | 内容 | 验证 |
|---|---|---|---|
| 5.1 | `src/modules/bnBridge.ts` | 检测 `Zotero.BetterNotes.api.editor.registerMagicKeyCommand`；注册 10 个颜色/清除命令；pref `integrations.betterNotes` 可关 | BN 魔法键面板可搜到颜色命令 |
| 5.2 | 同上 | BN 缺席时静默跳过，不影响主功能 | 禁用 BN 后功能仍正常 |

done：BN 装/不装两种环境都通过验收清单。

## 阶段 6：测试、CI、文档

- `test/`：keymap、colors、colorCommands、pref 校验，覆盖率不设硬指标但核心模块必须覆盖
- `.github/workflows/ci.yml`：`pnpm install` → `typecheck` → `test` → `build`
- `README.md`（中英）、`CHANGELOG.md`、`LICENSE`（MIT）、`docs/assets/` 截图
- 清残留：不提交 `.scaffold/`、`*.xpi`、`node_modules/`

done：本地与 CI 全绿；README 能按步骤装插件。

## 阶段 7：发布与上架

1. `pnpm release` → `v0.1.0`；检查 release 资产：xpi + `release` 标签里的 `update.json`（`update_link` 可访问）
2. 本机 Zotero 从 GitHub 安装 xpi，验证自动更新配置被读取（`about:config` 看 update_url）
3. PR `zotero-chinese/zotero-plugins`：`src/plugins.ts` 加 `repo: "meaning-infinite/zotero-color-keys"`、`tags: ["notes","interface"]`、`releases: []`、`discoverReleases: true`
4. Issue `syt2/zotero-addons`：Plugin submit 模板，仓库 URL
5. 上架后用 Zotero 插件市场搜到，安装验证

done：两个市场可见；从市场安装后快捷键可用。

## 提交约定

- 每阶段一个或多个 Conventional Commits：`feat:` / `fix:` / `test:` / `docs:` / `chore:`
- 每阶段结束更新 `CHANGELOG.md` 的 Unreleased
- 每次提交前 `pnpm typecheck && pnpm test`
- 规格变更先改 `docs/superpowers/specs/2026-10-23-zotero-color-keys-design.md`

## 回滚点

- 阶段 0 spike 失败 → 切规格 4.3 退路，不阻塞阶段 1
- 阶段 3 中 `dispatch` 行为不稳定 → 降级到 BN `api.editor.replace` + 原生编辑器 DOM 回退，规格记录偏差
- 发布后出现破坏性问题 → `pnpm release` 发 `0.1.1` 热修，市场自动跟随

## 待用户确认的事项

1. 是否按本计划开工（先阶段 0）
2. 阶段 0.1 的 PAT 轮换你先做，还是我给出步骤由你执行
