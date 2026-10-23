# Spike 结论：Zotero 笔记编辑器 hook 与 mark 写入

- 日期：2026-10-23
- 环境：Zotero 10.0.6（`app/omni.ja` 解包核对源码），临时 profile + 临时数据目录
- 分支：`spike/editor-hook`（探测代码 `src/modules/spike.ts`，不进入主线）
- 结论：**主路径成立**，设计规格 4.3 的退路不需要启用

## 1. 注册钩子

`Zotero.Notes.registerEditorInstance` 存在，1 个参数：

```js
function (instance) { this._editorInstances.push(instance); }
```

关键时序（`chrome/content/zotero/xpcom/editorInstance.js` 第 79-93 行）：`EditorInstance.init(options)` **第一行**就调用 `registerEditorInstance(this)`，此时 `_iframeWindow`、`_item`、`_viewMode` 等都还没赋值。实测 hook 瞬间实例只有 8 个字段：

```
_handleFontChange, _handleContentViewModeChange, _handleStyleChange,
_handleSpellCheckChange, _messageHandler, instanceID, _undoRedoController, _lastSaveID
```

**结论**：hook 里不能立即取编辑器；必须延迟到 `init` 同步段结束后（实测 500ms 后字段齐全）。实现时用轮询（500ms / 最多 20s）或 microtask + 重试，不要依赖单次 `setTimeout(0)`。

## 2. 编辑器实例与 ProseMirror view

`init` 完成后实例字段（节选）：`_item`、`_iframeWindow`、`_popup`、`_state`、`_viewMode`、`_tabID`、`_readOnly`、`_initPromise`、`_spellChecker`。

ProseMirror view 路径（实测命中）：

```
instance._iframeWindow.wrappedJSObject._currentEditorInstance._editorCore.view
```

iframe window 上与编辑器相关的全局键：

```
zotero-editor, zoteroPrint, zoteroExecCommand, zoteroTranslateToMarkdown,
zoteroCopyImage, zoteroSaveImageAs, _currentEditorInstance
```

同一笔记会有**两个实例**：`viewMode: "library"`（条目面板预览，`tabID: null`）与 `viewMode: "tab"`（标签页，`tabID: "tab-…"`），两者都要挂监听、都要避免重复处理同一次按键。

schema（Zotero 10 / `data-schema-version="9"`）的 marks：

```
strong, em, underline, strike, subsup, textColor, backgroundColor, link, code
```

`textColor`、`backgroundColor` 均存在，与设计规格一致。

## 3. 写入 mark（关键坑）

第一次尝试把 chrome 侧的普通对象作为 attrs 传入：

```js
marks.textColor.create({ color: "#ff2020" })
```

抛错：

```
RangeError: No value supplied for attribute color
```

原因：chrome 分区的 plain object 对 content 侧的 ProseMirror 不透明（Xray）。**attrs 必须在编辑器 iframe 的 realm 里创建**：

```js
const win = instance._iframeWindow.wrappedJSObject;
const attrs = new win.Object();
attrs.color = "#ff2020";
const tr = view.state.tr.addMark(0, view.state.doc.content.size, view.state.schema.marks.textColor.create(attrs));
view.dispatch(tr);
```

`new win.Object()` 生效，记为 `attrsMode: "iframe-realm"`；该模式即实现时的标准写法。`dispatch` 直接用 chrome 侧拿到的 view 对象即可。

## 4. 持久化证据

写入后 3 秒，`instance._item.getNote()` 已含：

```html
<span style="color: rgb(255, 32, 32);">测试</span>
```

关闭 Zotero 后直接查临时数据目录的 `zotero.sqlite`（`itemNotes.note`，WAL 已提交）：

```html
<div class="zotero-note znv1"><div data-schema-version="9">
  <p><span style="color: rgb(255, 32, 32);">测试</span></p>
  ...
</div></div>
```

要点：

- 颜色会被 Zotero 规范化成 `rgb(…)` 形式，不是 hex；实现里比较颜色时不能按 hex 字符串对等
- 笔记 HTML 外层 `zotero-note znv1` 与 `data-schema-version="9"` 由 Zotero 维护，**不要自行拼接/重写整段 HTML**，只走 ProseMirror transaction
- 高亮 mark 同为 `backgroundColor`，attrs 为带 alpha 的颜色值；spike 未单独验证，但 schema 已确认存在，实现阶段用同样方式写入并验收

## 5. 对实现的影响

1. `editorRegistry`：hook 后延迟轮询，等 `_iframeWindow` + `_currentEditorInstance._editorCore.view` 就绪再挂 keydown；实例 `uninit` 时摘除
2. `colorCommands`：所有 mark attrs 用 `new iframeWindow.Object()` 构造；颜色比较走 `rgb()` 归一化
3. 双实例（pane + tab）去重：同一个 `itemID` 的多个实例共享文档状态，按键只处理一次
4. 无选区段落语义、toggle、清除等仍需在实现阶段用同样的 transaction 路径验证

## 6. 复现方式

```powershell
# 临时 profile + 临时数据目录，不碰用户常用 profile
$profile = "$env:TEMP\ck-spike\profile"
Copy-Item .scaffold\build\zotero-color-keys.xpi "$profile\extensions\color-keys@meaning-infinite.xpi" -Force
Start-Process 'D:\Zotero\zotero.exe' -ArgumentList '-profile', "`"$profile`"", '-no-remote'
```

插件启动后自动 hook、写 `%TEMP%\color-keys-spike.json`；打开一条有文字的笔记即触发写入。
