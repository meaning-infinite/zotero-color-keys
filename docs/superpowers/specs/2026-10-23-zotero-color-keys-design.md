# Zotero Color Keys 设计规格

- 日期：2026-10-23
- 状态：已与用户逐节确认（架构 / 行为规格 / 面板与发布）
- 项目根：`D:\MicrosoftVS Code programs\programs\zotero-color-keys`

## 1. 背景与目标

Better Notes for Zotero（下称 BN）在笔记编辑中缺少颜色/高亮快捷键：BN 没有快捷键管理器（未用 `zotero-plugin-toolkit` 的 `Keyboard`，菜单不设 accelerator），可配置项只有 `editor.useMagicKey` / `editor.useMagicKeyShortcut` 两个开关。相关请求 [#559](https://github.com/windingwind/zotero-better-notes/issues/559)、[#1229](https://github.com/windingwind/zotero-better-notes/issues/1229)（`not_planned`）、[#1236](https://github.com/windingwind/zotero-better-notes/issues/1236)、讨论 [#1195](https://github.com/windingwind/zotero-better-notes/discussions/1195)（作者答复 "planned, no time"）均未实现。

目标：做一个独立插件，在 Zotero 笔记编辑器中提供"参考幕布键位布局"的文字颜色与高亮颜色快捷键，并允许用户在设置面板中自定义按键。

非目标（v1.0 不做）：PDF 阅读器颜色快捷键与工具栏改造、工具栏按钮、右键菜单、导出/导入配置、多键序列快捷键。

## 2. 范围

### v1.0（本规格覆盖）

1. Zotero 原生笔记编辑器（标签页、侧栏、独立窗口）
2. BN 富文本笔记编辑器与 BN 独立笔记窗口
3. 文字颜色 8 色 + 恢复默认；高亮 8 色 + 清除高亮 + 清除整段颜色
4. 选区优先、无选区作用于当前段落的语义
5. 设置面板 + 键位录制 + 冲突检测 + 恢复默认
6. zh-CN / en-US / zh-TW 三语
7. 单测、CI、README、CHANGELOG、上架两个插件市场

### v1.1（后续，单独设计）

1. PDF 阅读器：快捷键改高亮色（方案一：与笔记共用键位）
2. PDF 阅读器工具栏改造（方案二，需求原文）：保留首行颜色行；第二行两个按钮分别选择"文字颜色/高亮"；默认图标修改下划线颜色，按住 Ctrl 时图标切换为高亮色块并修改高亮色
3. BN Markdown 模式的颜色写入（CodeMirror 源视图）

### 独立交付项（不属于本插件）

- 把用户现有 MCP 服务（TRAE `mcp.json`）迁移到 DSH：通过 `@deepseek-ai/dsh-mcp-client` 条目或 dsh-mcp-manager 导入；GitHub PAT 先轮换再配置

## 3. 命名与元数据

| 项 | 值 |
|---|---|
| 显示名 | Zotero Color Keys（中文名：色彩快捷键） |
| 仓库 | `zotero-color-keys` |
| 插件 ID | `color-keys@meaning-infinite`（发布后不可改；仓库地址与 ID 均以 GitHub 用户 `meaning-infinite` 为准，若实际用户名不同则在首次发布前统一替换） |
| 许可证 | MIT |
| 兼容 | `strict_min_version: 8.0`，`strict_max_version: 10.*` |
| 作者 | meaning-infinite |

## 4. 架构

### 4.1 技术栈

`zotero-plugin-template`（TypeScript + esbuild + `zotero-plugin-scaffold` + `zotero-plugin-toolkit` + `zotero-types`）。构建产物 `.xpi`、`update.json` 由 scaffold 生成。

### 4.2 模块

| 模块 | 文件 | 职责 | 依赖 |
|---|---|---|---|
| keymap | `src/modules/keymap.ts` | 键位解析、规范化、匹配、冲突检测，纯函数 | 无 |
| editorRegistry | `src/modules/editorRegistry.ts` | 拦截 `Zotero.Notes.registerEditorInstance`，为每个编辑器实例挂/摘 iframe 监听 | Zotero |
| colorCommands | `src/modules/colorCommands.ts` | 计算作用范围、应用/切换/清除 mark | ProseMirror state |
| prefsPane | `src/modules/prefsPane.ts` | `Zotero.PreferencePanes.register`，渲染颜色行 | Zotero |
| hotkeyRecorder | `src/modules/hotkeyRecorder.ts` | 录制按键、显示本地化组合、写入 pref | keymap |
| bnBridge | `src/modules/bnBridge.ts` | 检测 `Zotero.BetterNotes.api`，注册 Magic Key 命令 | BN（可选） |

依赖方向：`index.ts` → registry/prefs/bnBridge → colorCommands → keymap。keymap 不 import 任何 Zotero API，保证可单测。

### 4.3 快捷键挂载（关键技术决策）

- 不能用 toolkit `Keyboard`：它只给主窗口与 reader iframe 绑定 keydown，笔记编辑器在独立 iframe，事件不跨帧冒泡
- 不能用 `XUL <key>`：同类原因，且无作用域控制
- 采用：在 `startup` 中包装 `Zotero.Notes.registerEditorInstance`（BN 也用 `PatchHelper` 包装同一函数，采用链式包装，先调用原函数再挂自己的监听，不替换他人逻辑）
- 每个实例：在其 iframe window 上 `addEventListener("keydown", handler, true)`（捕获阶段，早于 ProseMirror 自身 keymap）；`shutdown`/实例销毁时移除
- 若 `registerEditorInstance` 形态不符（spike 失败）：退路为遍历 `Zotero.Notes._editorInstances` 轮询 + `MutationObserver` 监听 `note-editor` 挂载；两条路径共用同一 `attachEditor(instance)` 接口

### 4.4 数据流

```
iframe keydown(capture)
  → 焦点检查（activeElement 为输入框/下拉/弹层时跳过）
  → keymap.match(event) 得到 command
  → 取该 iframe 的 editor instance
  → colorCommands.resolveRange(state)
        有选区 → state.selection
        无选区 → $from.blockRange($from)（当前段落/列表项/标题块）
  → ProseMirror transaction：toggleMark / setMark / removeMark
  → Zotero 自动保存
```

### 4.5 颜色命令语义

- 应用某色：范围内所有文本节点设该色 mark；已有同色则移除（toggle）
- 恢复默认（文字）：移除 `textColor` mark
- 清除高亮：移除 `backgroundColor` mark
- 清除整段颜色：移除两种 mark
- 不影响 `strong`/`em`/`underline`/`link` 等其他 mark

## 5. 快捷键规格

### 5.1 默认键位

平台：文字颜色组用 `Alt`（macOS `Option`）；高亮组用 `Ctrl+Alt`（macOS `Cmd+Option`）。存储层用 `accel` 表示跨平台主修饰键（macOS 解析为 Cmd，其余为 Ctrl）。

文字颜色（Alt + 字母）：

| 命令 | 键位 | 颜色 | hex |
|---|---|---|---|
| 默认（清除文字色） | Alt+D | — | — |
| 红 | Alt+R | red | `#ff2020` |
| 橙 | Alt+O | orange | `#ff7700` |
| 黄 | Alt+Y | yellow | `#ffcb00` |
| 绿 | Alt+G | green | `#4eb31c` |
| 蓝 | Alt+B | blue | `#05a2ef` |
| 紫 | Alt+P | purple | `#7953e3` |
| 品红 | Alt+M | magenta | `#eb52f7` |
| 灰 | Alt+A | gray | `#7e8386` |

高亮与清除（Ctrl+Alt + 字母）：

| 命令 | 键位 | 颜色 | hex（含 50% alpha） |
|---|---|---|---|
| 黄 | Ctrl+Alt+Y | yellow | `#ffd40080` |
| 红 | Ctrl+Alt+R | red | `#ff666680` |
| 灰 | Ctrl+Alt+H | gray | `#aaaaaa80` |
| 绿 | Ctrl+Alt+G | green | `#5fb23680` |
| 蓝 | Ctrl+Alt+B | blue | `#2ea8e580` |
| 粉 | Ctrl+Alt+P | magenta | `#e56eee80` |
| 橙 | Ctrl+Alt+O | orange | `#f1983780` |
| 紫 | Ctrl+Alt+U | purple | `#a28ae580` |
| 清除高亮 | Ctrl+Alt+D | — | — |
| 清除本段全部颜色 | Ctrl+Alt+Shift+D | — | — |

颜色值来源：Zotero note-editor `src/core/schema/colors.js`（`TEXT_COLORS`、`HIGHLIGHT_COLORS`）。只使用 Zotero 官方 8 色，不引入自定义色。

### 5.2 触发条件

- 仅当焦点在笔记编辑器（或其子文档）内生效；主窗口、PDF 阅读器不拦截
- 只读笔记、Markdown 模式（`Zotero.BetterNotes.api.editor.isMarkdownMode` 为真）不拦截，键透传
- 输入法组合过程（`event.isComposing`）不处理
- 命中命令时 `preventDefault()` 并 `stopPropagation()`，避免 ProseMirror 二次处理

### 5.3 冲突规则

- 插件内部重复：录制时立即报错，不允许保存
- 与 Zotero 原生占用重叠：黄色警告允许保存。原生已占用（Windows/Linux 的 Ctrl 即 macOS 的 Cmd）：`Mod+B/I/U`、`Mod+K`、`Mod+\``、`Shift+Ctrl+1–6`、`Shift+Ctrl+0`、`Shift+Ctrl+8/9`、`Ctrl+>`、`accel+W`
- 与 BN Magic Key `Mod+/` 重叠：黄色警告
- Windows `AltGr`：录制器提供 `Ctrl+Shift+Alt` 组合，README 与面板说明

### 5.4 键位存储格式

pref：`extensions.zotero.color-keys.keymap`，JSON 字符串：

```json
{
  "version": 1,
  "textColor": {
    "red": "alt,r",
    "orange": "alt,o",
    "yellow": "alt,y",
    "green": "alt,g",
    "blue": "alt,b",
    "purple": "alt,p",
    "magenta": "alt,m",
    "gray": "alt,a"
  },
  "backgroundColor": {
    "yellow": "accel,alt,y",
    "red": "accel,alt,r",
    "gray": "accel,alt,h",
    "green": "accel,alt,g",
    "blue": "accel,alt,b",
    "magenta": "accel,alt,p",
    "orange": "accel,alt,o",
    "purple": "accel,alt,u"
  },
  "actions": {
    "clearTextColor": "alt,d",
    "clearHighlight": "accel,alt,d",
    "clearAll": "accel,alt,shift,d"
  }
}
```

键位字符串采用 toolkit `KeyModifier.getRaw()` 格式（小写、逗号分隔、修饰键在前）；写入前用 keymap 校验，非法则回退默认值并记日志。

## 6. 设置面板

- 入口：Zotero 设置 → Color Keys
- 结构：说明区 → 「文字颜色」9 行 → 「高亮」10 行 → 「全部恢复默认」按钮 → 诊断区（编辑器挂载状态、BN 检测结果）
- 行内容：色块、本地化颜色名、hex、录制输入框、单行恢复默认按钮
- 录制：点击输入框进入录制态；捕获 keydown；忽略纯修饰键；Esc 取消；Backspace 清除绑定；保存即生效（pref 观察器重载 keymap）
- 无快捷键时显示"未设置"，该命令不触发

## 7. 国际化

- Fluent：`addon/locale/{zh-CN,en-US,zh-TW}/color-keys.ftl`，消息 id 统一前缀 `color-keys-`
- 面板文案、颜色名、诊断信息、通知全部走 FTL
- README 中英双语；CHANGELOG 英文

## 8. 发布与上架

1. `pnpm release`：Bumpp 升版本 → 构建 `.xpi` → GitHub Release `v0.1.0`（含 xpi）→ `release` 标签（含 `update.json`）
2. `manifest.json` 的 `update_url` 指向 `https://github.com/meaning-infinite/zotero-color-keys/releases/download/release/update.json`
3. 上架 A：PR 到 `zotero-chinese/zotero-plugins` 的 `src/plugins.ts`，条目 `repo` + `tags: ["notes","interface"]` + `releases: []` + `discoverReleases: true`
4. 上架 B：issue 到 `syt2/zotero-addons`，用 Plugin submit 模板
5. 仓库必备：README、LICENSE、CHANGELOG、截图或 GIF

## 9. 验证

### 9.1 自动化

- vitest：键位解析/匹配/冲突、颜色表完整性、范围解析（mock state）、pref JSON 校验
- GitHub Actions：`pnpm typecheck` + `pnpm test` + `pnpm build`

### 9.2 手工验收清单

1. 原生笔记选区按 Alt+R，颜色变红，撤销可回退
2. 无选区按 Alt+Y，整段变黄
3. 同色再按一次取消
4. 高亮 Ctrl+Alt+Y 生效，颜色与 Zotero 原生高亮一致；Ctrl+Alt+D 清除高亮
5. BN 富文本编辑器内全部生效
6. BN 独立笔记窗口生效
7. BN Markdown 模式不拦截、不报错
8. 只读笔记键透传
9. 中文输入法输入中文时 Alt 组合不误触发
10. 面板改键后立即生效，重启 Zotero 保持

## 10. 风险

| 风险 | 概率 | 应对 |
|---|---|---|
| `Zotero.Notes.registerEditorInstance` 在 Zotero 10 不可用或签名不同 | 中 | 实施第 0 步 spike 验证；失败走 4.3 退路 |
| ProseMirror 内部字段变化 | 中 | 调用封装 try/catch，失败降级为不拦截并记诊断 |
| BN 同时 patch 同函数导致覆盖 | 低 | 链式包装，双方逻辑保留 |
| AltGr 吞键（Windows 部分布局） | 中 | 录制器支持 `Ctrl+Shift+Alt` 备选；文档说明 |
| 焦点在引用/链接弹层时误触发 | 中 | activeElement 检查 |
| Zotero 升级破坏 iframe 结构 | 中 | 版本探测 + 诊断区提示 + 快速发补丁 |

## 11. 决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| 插件形态 | 独立新插件，BN 可选增强 | 不复制 AGPL 代码；可同时服务原生编辑器；上架与维护独立 |
| 快捷键实现 | iframe 捕获 + ProseMirror transaction | toolkit Keyboard 不覆盖笔记 iframe；DOM 后处理会丢格式、断撤销 |
| 颜色体系 | 只用 Zotero 官方 8 色 | 与 Zotero 数据模型一致；避免自定义色在导出/同步中异常 |
| 键位布局 | 参考幕布（Alt 文字色 / Ctrl+Alt 高亮） | 用户既有肌肉记忆 |
| 段落语义 | 无选区时 `blockRange` | 与"当前段落"直觉一致，实现成本低 |
| 版本切分 | v1.0 笔记侧，v1.1 PDF | 控制回归面，先上架 |
| 许可证 | MIT | 允许社区复用；与 AGPL 的 BN 保持接口隔离 |

## 12. 实施顺序（阶段划分，供后续计划展开）

1. 第 0 步：spike 验证编辑器挂载与 mark 写入（半天），结论写入独立文档 `docs/spike/2026-10-23-editor-hook.md`，并据此确认走 4.3 主路径或退路
2. 骨架：模板初始化、多语言、prefs 默认值、面板静态 UI
3. 核心：keymap + editorRegistry + colorCommands
4. 面板：录制器 + 冲突检测 + 诊断区
5. BN 增强：Magic Key 命令注册
6. 测试与 CI
7. 发布与上架
