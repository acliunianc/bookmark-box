# BookmarkBox · 标签式书签管理插件

用「标签」替代「文件夹」承担书签组织职责：一条书签可属于多个标签，靠多标签交集 / 并集筛选；
原有文件夹结构不丢弃，导入时生成**只读文件树快照**，作为「批量打标签的批处理器」。

- 设计稿：[需求.md](./需求.md)
- 形态：Chrome / Edge 扩展（Manifest V3）

## 技术选型

- Vite
- React 19
- CRXJS（`@crxjs/vite-plugin`）
- HeroUI v3（`@heroui/react` + `@heroui/styles`，Tailwind CSS v4）
- IndexedDB（`idb`）+ MiniSearch 内存索引
- 包管理器：pnpm（`packageManager: pnpm@11.7.0`）

## 快速开始

```bash
pnpm install

# 开发：启动带 HMR 的构建，chrome://extensions 加载 dist 目录（开发模式）
pnpm dev

# 生产构建 + 类型检查
pnpm build
```

加载方式：打开 `chrome://extensions` → 打开「开发者模式」→「加载已解压的扩展程序」→ 选择
`dist` 目录。首次安装会自动打开管理页。

| 命令              | 说明                             |
| ----------------- | -------------------------------- |
| `pnpm dev`        | 开发模式（CRXJS HMR）            |
| `pnpm build`      | 类型检查 + 生产构建到 `dist/`    |
| `pnpm typecheck`  | 仅类型检查（`tsc --noEmit`）     |
| `pnpm preview:ui` | 浏览器里单独预览标签区 / 列表组件（不参与扩展构建） |

## 目录结构

```
src/
├─ background/     # service worker：消息路由、快捷键、打开计数（唯一写入方）
│  ├─ index.ts     # 事件监听：runtime.onMessage / commands / contextMenus
│  └─ handlers.ts  # 全部业务处理函数
├─ popup/          # 快速收藏浮层（380 × 460）
├─ manage/         # 管理页（含设置、导入导出）
│  ├─ App.tsx      # 布局、筛选状态、快捷键
│  ├─ store.tsx    # 全局数据（bootstrap）+ 局部合并更新
│  └─ components/  # 顶部栏 / 侧栏（标签区 + 文件树）/ 列表 / 各类对话框
├─ core/           # 领域逻辑：URL 规范化、HTML 解析、检索、批量打标签、导入导出
├─ db/             # IndexedDB 封装（bookmarks / tags / groups / tree / settings / snapshots）
├─ shared/         # 类型、消息协议、常量、工具
└─ ui/             # 通用 UI：Dialog / Toast / 图标

preview/           # 仅本地验收用：单独渲染 TagPanel / BookmarkList（pnpm preview:ui，不参与扩展构建）
```

## 已实现（MVP + 部分 V1.1）

| 需求                                  | 实现位置                                                        |
| ------------------------------------- | --------------------------------------------------------------- |
| 点图标自动带出网址 / 标题 / 图标      | `src/popup/App.tsx`（`chrome.tabs.query` + `_favicon` 接口）     |
| 标签选择 / 回车新建 / 常用 / 上次     | `popup/App.tsx`、`core/tagOps.ts`                               |
| 极速保存（上次标签组合，一键）        | `background/index.ts` 的 `instant-save` 命令                    |
| 管理页左右布局，左栏两块可折叠可拖宽  | `manage/components/Sidebar.tsx`                                 |
| 标签区：标签 chip + 分组（如「开发」下挂 java / php） | `TagPanel.tsx`、`core/tagOps.ts`     |
| 标签点击 = 切换筛选；Ctrl / ⌘ / Shift + 点击 = 多选组合 | `manage/App.tsx` 的 `onToggleTag`              |
| 置顶标签单独成区排在最前，可在区内拖拽调整顺序（`tag.pinOrder`）；标签左侧图钉一点即置顶 / 取消，可短时撤销 | `TagPanel.tsx` 的图钉按钮与置顶区、`App.tsx` 的 `toggleTagPin`、`core/tagOps.ts` 的 `sortPinnedTags` / `setTagPinned` |
| 标签 ⋯：重命名 / 改色 / 合并 / 删除 / 移动到分组 | `dialogs/TagDetailDialogs.tsx`                      |
| 分组 ⋯：重命名 / 改色 / 上移下移 / 删除（仅解散分组） | `dialogs/TagDetailDialogs.tsx`                    |
| 文件树只读快照（导入生成、整体覆盖）  | `core/parseTree.ts`、`background/handlers.ts`                   |
| 文件树节点批量打标签（可选递归 + 撤销） | `components/dialogs/BatchTagDialog.tsx`                       |
| 搜索：多关键词 / `#标签` / `in:文件夹`（输入时下拉补全） | `core/search.ts` + `TopBar.tsx`（MiniSearch；`#` / `in:` 弹出建议） |
| 列表 / 网格视图、虚拟滚动、多选批量操作 | `components/BookmarkList.tsx`、`SelectionBar.tsx`             |
| HTML 导入向导（预览 / 冲突策略 / 结果报告 / 撤销） | `dialogs/ImportDialog.tsx`                          |
| 按文件夹路径生成标签（勾选开关 + 逐文件夹「标签 / 分组 / 不处理」，可按子树批量套用） | `core/parseTree.ts` 的 `folderTagPlan`、`components/ImportFolderPlan.tsx` |
| 收藏时同步写入本机浏览器书签（落点自动 / 手动，默认开启） | `core/browserBookmarks.ts`、`popup/App.tsx`、`dialogs/SettingsDialog.tsx` |
| 读取本机浏览器书签生成文件树          | `ImportDialog`（`chrome.bookmarks.getTree`）                     |
| JSON 全量备份 / 恢复、标准 HTML 导出  | `core/backup.ts`、`dialogs/ExportDialog.tsx`                     |
| 回收站（软删除 30 天 / 恢复 / 清空）  | `dialogs/SettingsDialog.tsx`                                     |
| 安全快照，可回滚最近 3 份             | `db/index.ts`（`snapshots` store）                               |
| URL 规范化去重（追踪参数 / #锚点）    | `core/normalizeUrl.ts`（可在设置中开关）                         |

## 交互约定

- **顶部搜索**：顶栏居中假搜索条；点击或 `Ctrl/⌘+K` / `/` 后就地变宽成真输入（最多约 50vw）。
  输入 `#` / `in:` 弹出与搜索框同宽的建议；Enter / Esc / 点外部收起（一步完成，无弹窗）。
  输入有防抖；中文 IME 合成期间不拦截按键、不上屏中间态。
- **左侧标签点击 = 切换筛选**：点另一个标签会直接替换当前筛选（不累加），再点已选中且唯一的标签则取消；
  需要多标签组合（AND / OR）时用 `Ctrl` / `Cmd` / `Shift` + 点击，或用标签 chip 上的 × 单独移除。
- **书签多选**：每条书签左侧始终有勾选框。`Shift` + 点击从锚点成片选中、
  `Ctrl/⌘+A` 或工具栏「全选」一次选中当前筛选结果（再按一次取消）。范围选择以「锚点」为准，
  锚点由普通点击或方向键定位更新，因此连续按 `Shift` 能稳定扩选而不会来回收缩。
  `Ctrl/⌘` + 左键直接在新标签页打开该书签。
- **文件树批量打标签**：hover 节点出现 ⚡，手动选择要打的标签，可选「仅当前文件夹 / 含子文件夹」与「追加 / 替换」。
- **导入时按文件夹路径生成标签**（导入向导内的勾选框，默认勾选）：
  路径上**每一层**文件夹都会生成一个同名标签（`书签栏/开发工具/前端` → `#书签栏`、`#开发工具`、`#前端`），
  合成根节点 `书签` 不是真实文件夹、不会被当作标签；取消勾选则不生成任何标签与分组，
  下方「文件夹处理方式」整块不再渲染。想去掉某一层就把它设为「不处理」。
- **导入时逐个文件夹决定「标签 / 分组 / 不处理」**（导入向导的文件夹树，每个节点右侧三态切换，
  它就是「按文件夹路径生成标签」的全部控制入口，因此不再有「仅末级 / 含祖先」的全局策略）：
  - 「创建为标签」＝ 该文件夹名生成一个同名标签（默认，即含祖先文件夹名）；
  - 「标签成组」＝ 该文件夹自身不生成标签（也没有同名标签），
    其下（不含自身）生成的标签统一归入**与该文件夹同名**的分组，例如把 `开发工具` 设为分组，
    `书签栏/开发工具/前端` 只会得到 `#书签栏`、`#前端`，其中 `#前端` 归入「开发工具」分组；
  - 「不处理」＝ 这一层文件夹名既不生成标签、也不成组，直接忽略（其它层不受影响）；
  - 「分组」的两个禁用条件：① 分组只有一层，祖先已选为分组时后代的「分组」会被禁用（不可嵌套）；
    ② 文件夹下面**没有子文件夹**时也不能成组（成组是把「其下生成的标签」归入分组，没有子文件夹就没有可归入的东西），
    这种文件夹只能「创建为标签」或「不处理」；
  - 每行的 ⋮ 可以**批量**把某个方式套用到该文件夹下的所有子文件夹（`创建为标签 / 标签成组 / 不处理`），
    其中不被支持的子文件夹保持原样，例如「全部成组」对没有子文件夹的文件夹不生效；
  - 没有任何标签归入的分组不会被创建；预览区实时显示「将生成 N 个标签 · 归入 M 个分组」，
    导入结果报告里也会列出「新建分组 / 归入分组标签」的数量。
- **标签分组（一层）**：左侧栏里把 `java` / `php` 这类标签收进「开发」分组，分组可折叠、可改色、可上下移动。
  两种归组方式：① 把标签 chip 直接拖到目标分组（拖到「未分组」即移出）；② 标签右键 → 「移动到分组」。
  删除分组只解散分组，标签与书签都会保留。左侧栏底部「+ 分组」新建分组。
- **置顶在标签上直接点**：每个标签 chip 最左侧有一个图钉位（宽度固定，避免鼠标移入时标签重排导致误点）。
  已置顶的图钉常亮为警示色；未置顶的平时 `visibility: hidden`，鼠标移到该标签上才出现，因此不会被误点。
  点图钉只切换置顶状态、不会触发按标签筛选，随后弹出一个带「撤销」的提示（6 秒）：
  撤销「取消置顶」会把标签放回**原来的置顶顺序**（`tag/pin` 的 `pinOrder`），而不只是追加到末尾。
  标签编辑弹窗里不再有置顶勾选项，置顶顺序仍可在置顶区内拖拽调整。
- **书签列表项展示该条的全部标签**（不做 `+N` 折叠），标签多时行高自动换行撑开。
- **行内标签的点击 / 双击分工**：悬停行内标签会叠一层淡绿底色提示「这是筛选」（只换底色，不描边、不放大，
  避免行高与换行位置抖动）；
  单击标签才按该标签筛选（延后约 220ms 生效），双击标签等同双击整行——**打开书签**，
  不会误把「想打开书签」变成「筛选标签」（`BookmarkList.tsx` 的 `useTagFilterScheduler`）。

## 交互约定之外的实现说明

- **列表虚拟滚动按实测行高工作**：因为每条书签的标签数量不同、换行行数不同，行高不再固定，
  改为 `ResizeObserver` 实测 + 估算兜底的方式计算累计偏移（`BookmarkList.tsx`），
  500 条数据下仍只渲染可视区附近的 16～23 行。
- **标签 / 分组表是「整体覆盖」写入**：`db.putTags` / `db.putGroups` 先 `clear` 再写入，
  传入的必须是完整列表。因为 IndexedDB 的 `put` 只能 upsert、删不掉记录，
  否则删除分组或标签后记录仍留在库里，下次 `allGroups()` / `allTags()` 又把它读回来，
  就会出现「提示删了、界面还在」（`db/index.ts`）。书签表不同：它是增量 upsert，
  彻底删除走 `deleteBookmarkHard`。
- **HeroUI 的 `Checkbox` 必须把 `Checkbox.Control` 放进 `Checkbox.Content` 里**：
  `.checkbox` 本身是 `flex flex-col items-start gap-1`，Control 若作为它的直接子节点，
  会和标题各占一行（就是「勾选框和标题不在同一行」的原因）。
  描述文字用 `Description` 作为 `Checkbox.Content` 的**兄弟节点**，
  组件样式会自动缩进到与标题文字左对齐。

## 快捷键

| 位置   | 快捷键                                | 功能                              |
| ------ | ------------------------------------- | --------------------------------- |
| 全局   | `Alt+Shift+M`（可在快捷键页修改）     | 打开管理页                        |
| 全局   | `Ctrl+Shift+S`                        | 打开快速收藏浮层                  |
| 全局   | 自定义（`chrome://extensions/shortcuts`） | `instant-save`：上次标签组合极速保存 |
| 管理页 | `Ctrl/⌘+K` 或 `/`                     | 展开顶部搜索                      |
| 管理页 | `↑` `↓` + `Enter`                     | 键盘导航并打开                    |
| 管理页 | `Shift+↑` `Shift+↓`                   | 从锚点扩选一段                    |
| 管理页 | `Ctrl/⌘` + 左键                       | 新标签页打开该书签                |
| 管理页 | `Ctrl/⌘+A`                            | 全选当前筛选结果（再按一次取消）  |
| 管理页 | `Ctrl+Enter`                          | 新标签页后台打开                  |
| 管理页 | `Esc`                                 | 清除筛选 / 取消已选               |

多选靠勾选框、`Shift` + 点击（从锚点成片选中），以及工具栏「全选」或 `Ctrl/⌘+A` 一次选满当前筛选结果。

## 已知限制与后续版本

- **极速保存（双击）**：浏览器全局双击无法可靠识别，改为独立命令 `instant-save`，需在
  `chrome://extensions/shortcuts` 自行绑定按键；无上次标签时会抖动角标 `!` 并回退到浮层。
- **接管新标签页**：`chrome_url_overrides` 只能静态声明，本期未做（属 V2.0 探索项）。
- **失效链接检测**：受 CORS 限制未实现（V2.0）。
- **标签搜索的拼音首字母**（如 `qd` → 前端）与 omnibox 地址栏搜索属 V1.2，尚未实现。
- 多选后底部「打开」一次最多打开 10 个标签页（`MAX_BATCH_OPEN`），超出部分会提示未打开。

## HeroUI 主题

主题变量在 `src/styles/global.css` 中覆盖（完整色板见下方），组件样式来自 `@heroui/styles`。
