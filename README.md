# Zotero Color Keys

Customizable keyboard shortcuts for **text color** and **highlight color** in Zotero notes.

在 Zotero 笔记编辑器中用快捷键改文字颜色与高亮颜色，键位参考幕布（MuBu），颜色只用 Zotero 官方 8 色，并可在设置里自定义。

## Features / 功能

- Text color: 8 Zotero colors + restore default
- Highlight: 8 Zotero colors + clear highlight + clear all colors
- Works in the native note editor (tab / pane / window) and Better Notes editors
- Selection first; with no selection the shortcut applies to the current paragraph
- Press the same color again to remove it (toggle)
- Configurable keybindings with a recorder, conflict detection and reset-to-default
- zh-CN / en-US / zh-TW UI
- Better Notes optional: color commands also appear in its Magic Key palette when installed

## Default keybindings / 默认键位

Text color (Windows/Linux `Alt`, macOS `Option`):

| Color | Key | Hex |
|---|---|---|
| Default (clear) | `Alt+D` | — |
| Red | `Alt+R` | `#ff2020` |
| Orange | `Alt+O` | `#ff7700` |
| Yellow | `Alt+Y` | `#ffcb00` |
| Green | `Alt+G` | `#4eb31c` |
| Blue | `Alt+B` | `#05a2ef` |
| Purple | `Alt+P` | `#7953e3` |
| Magenta | `Alt+M` | `#eb52f7` |
| Gray | `Alt+A` | `#7e8386` |

Highlight (Windows/Linux `Ctrl+Alt`, macOS `Cmd+Option`):

| Color | Key |
|---|---|
| Yellow | `Ctrl+Alt+Y` |
| Red | `Ctrl+Alt+R` |
| Gray | `Ctrl+Alt+H` |
| Green | `Ctrl+Alt+G` |
| Blue | `Ctrl+Alt+B` |
| Magenta | `Ctrl+Alt+P` |
| Orange | `Ctrl+Alt+O` |
| Purple | `Ctrl+Alt+U` |
| Clear highlight | `Ctrl+Alt+D` |
| Clear paragraph colors | `Ctrl+Alt+Shift+D` |

> Windows 上 `Ctrl+Alt` 接近 AltGr。若组合键被其他软件或键盘布局吞掉，可在设置里改用 `Ctrl+Shift+Alt`。

## Install / 安装

1. 从 [Releases](https://github.com/meaning-infinite/zotero-color-keys/releases) 下载 `.xpi`
2. Zotero → 工具 → 插件 → 齿轮 → 从文件安装
3. 设置 → Color Keys 中查看/修改键位

兼容 Zotero 8.0 及以上（`strict_max_version: 10.*`）。

## Development / 开发

```bash
pnpm install
pnpm start     # 构建并启动 Zotero（热重载）
pnpm test      # 单元测试
pnpm build     # 产出 .scaffold/build/*.xpi
pnpm release   # 发布
```

设计规格见 `docs/superpowers/specs/`，实现计划见 `docs/superpowers/plans/`，spike 与 E2E 记录见 `docs/spike/`、`docs/testing/`。项目约定见 `AGENTS.md`。

## License

MIT
