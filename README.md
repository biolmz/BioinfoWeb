# 刘铭哲 · 生物信息学学习记录

一个纯静态、无构建步骤的个人学习站。用来记录生物信息学的学习笔记、项目、成长时间线和常用资源。

- 信息架构：首页 / 关于我 / 学习笔记 / 项目 / 成长时间线 / 资源收藏
- 数据驱动：笔记、项目、时间线、资源都放在 `data/*.json`，改内容不用动 HTML
- 技能矩阵：表格 + 进度条 + 「在用 / 会 / 想学」分级，方便快速了解水平
- 代码不放正文：只写思路和结论，完整代码链到 GitHub
- 可视化后台：`admin.html` 登录后增删改内容，可直接提交到 GitHub，也可导出 JSON 手动上传
- 深色 / 浅色主题、响应式布局、无第三方依赖

---

## 目录结构

```text
.
├── index.html              # 公开页面骨架、页头、页脚
├── admin.html              # 内容管理台（登录后使用）
├── assets/
│   ├── css/style.css       # 公开页面样式（设计变量、深/浅色、响应式）
│   ├── css/admin.css       # 管理台样式
│   ├── js/app.js           # 公开页面：hash 路由 + 渲染 + 交互
│   └── js/admin.js         # 管理台：登录、表单、导出、GitHub 提交
├── data/
│   ├── site.json           # 个人信息、技能矩阵、联系方式
│   ├── notes.json          # 学习笔记
│   ├── projects.json       # 项目
│   ├── timeline.json       # 成长时间线
│   └── resources.json      # 资源收藏
├── check_data.py           # 检查 data/*.json 语法（可选）
├── README.md
└── .nojekyll               # 让 GitHub Pages 跳过 Jekyll
```

### 页面与数据对应关系

```text
首页
├── 关于我（一句话定位 + 技能矩阵 + 联系方式）   ← data/site.json
├── 学习笔记（标题、日期、URL）                  ← data/notes.json
├── 项目（标题、日期、URL）                      ← data/projects.json
├── 成长时间线（按月 / 季度）                    ← data/timeline.json
└── 资源收藏（数据库、工具链接）                 ← data/resources.json

内容管理（admin.html，密码进入，不公开链接）      ← 同一批 data/*.json
```

> 说明：笔记和项目除了标题、日期、URL，还多了 `summary`（摘要）、`tags`（标签）等字段。
> 这些字段让列表页不用点进去也能看懂内容；完整正文和代码仍然放在 GitHub。

---

## 本地预览

浏览器的安全策略不允许 `file://` 页面读取本地 JSON，所以**不要直接双击 `index.html`**。

在项目根目录打开终端，启动一个静态服务器：

```bash
python -m http.server 8000
```

然后访问 <http://localhost:8000>。内容管理台在 <http://localhost:8000/admin.html>。

也可以用 Node：

```bash
npx serve .
```

如果直接双击打开，页面会显示一段错误提示，并告诉你怎么启动服务器；管理台在 `file://` 下也无法读取 JSON 和校验密码。

---

## 部署到 GitHub Pages

1. 在 GitHub 新建仓库。
   - 想让地址是 `https://<你的用户名>.github.io/`：仓库名必须是 `<你的用户名>.github.io`。
   - 用其他仓库名也可以，地址会变成 `https://<你的用户名>.github.io/<仓库名>/`。
2. 上传以下内容（保持目录结构不变）：

   ```text
   index.html
   admin.html
   assets/
   data/
   .nojekyll
   check_data.py（可选）
   README.md（可选）
   ```

   > 只用网页改内容、不打算在浏览器里一键提交的话，可以不上传 `admin.html`；
   > 上传了也不会出现在公开导航里，但请务必阅读下面的安全说明。

3. 打开仓库的 **Settings → Pages**：
   - Source 选 **Deploy from a branch**
   - Branch 选 **main**，目录选 **/(root)**
   - 保存后等待 1–2 分钟
4. 访问 Pages 给出的地址。

更新内容时，改 `data/` 下的 JSON，或直接使用 `admin.html` 管理台；提交后 Pages 会自动重新部署。

---

## 可视化后台（admin.html）

公开页面没有放管理入口，直接访问：

- 本地：<http://localhost:8000/admin.html>
- 线上：`https://你的域名/admin.html`

密码在交付时约定，**不要写进要上传的 README 或仓库**。登录后可以管理五个数据文件对应的内容：

- 学习笔记、项目、时间线、资源收藏
- 站点资料（姓名、定位、联系方式、最近在做什么、分析原则）
- 技能矩阵（分组、等级、分数、说明）

所有修改先保存在当前浏览器。点「提交全部更改」才会写回 GitHub；有未提交修改时关闭页面会提示。

### 方式 A：一键提交到 GitHub（推荐）

1. 创建 Fine-grained personal access token：
   - 打开 <https://github.com/settings/personal-access-tokens/new>
   - **Repository access** 选 *Only select repositories*，只选本站仓库
   - **Permissions → Contents** 选 *Read and write*
   - 生成后复制 Token（以 `github_pat_` 开头）
2. 在管理台点「GitHub 设置」，填写仓库所有者、仓库名、分支和 Token，点「测试连接」确认权限。
   - 仓库是 `<用户名>.github.io` 时，owner 和 repo 通常就是它；页面会自动填默认值，仍建议核对。
3. 保存设置后编辑内容，点「提交全部更改」。
   - 每个改动文件生成一次 commit。
   - GitHub Pages 大约 1–2 分钟后更新。
   - 右下角提示里会给出提交记录链接。

Token 只保存在当前浏览器（localStorage）。换电脑或换浏览器需要重新填写；不要在公共电脑上勾选「记住 Token」。

### 方式 B：导出 JSON 手动上传

没有 Token 也能编辑：

1. 修改内容。
2. 点「导出更改」（只导出有改动的文件）或「导出全部」。
3. 下载得到 `notes.json`、`projects.json` 等文件。
4. 在 GitHub 网页里打开 `data/` 下同名文件，上传覆盖并提交。

导出的 JSON 就是当前编辑后的完整文件。提交后同样需要等 Pages 重新构建。

### 安全说明（重要）

- 这是纯静态站，密码只在前端做 SHA-256 校验，**不能阻止懂技术的人绕过**；它只用于挡住随手点进来的人。
- 真正的写入权限由 GitHub Token 控制。Token 只存在你自己的浏览器里，不会写进仓库。
- Token 建议只授予本站仓库的 `Contents: Read and write`，并设置过期时间；泄露后立刻在 GitHub 撤销。
- 不要在公共电脑上保存 Token；离开前点「退出」，或在设置里「清除本机 Token」。
- 管理页设置了 `noindex`，也没有出现在公开导航里，但知道 `admin.html` 地址的人仍可以打开登录页。

### 修改管理密码

`assets/js/admin.js` 顶部有：

```js
const PASSWORD_HASH = '...';
```

把新密码的 SHA-256 填进去：

```bash
python -c "import hashlib; print(hashlib.sha256('新密码'.encode()).hexdigest())"
```

替换后重新上传 `assets/js/admin.js`。仓库里只保存哈希，不保存明文。

### 常见报错

| 提示 | 原因 / 处理 |
| --- | --- |
| 401 | Token 无效或过期，重新生成并保存 |
| 403 | Token 没有 Contents 写权限，检查 Fine-grained 权限 |
| 404 | owner / repo / branch 不对，或 Token 没有该仓库访问权限 |
| 409 | 远程文件在编辑期间被改了，点「重新加载」后再提交 |
| 提交成功但页面没变 | 等 1–2 分钟 Pages 重新构建，或强制刷新 |

---

## 怎么加内容

所有内容都是 JSON 数组里的一段对象。**复制一段、改字段、保存**即可，不用改 HTML。

> JSON 最常见的三个错误：最后一项后面多了逗号、用了中文引号、删除内容时留下空的 `{}`。
> 改完可以运行 `python check_data.py`，它会指出哪个文件、第几行出错。

### 1. 新增一篇学习笔记

编辑 `data/notes.json`，在 `items` 数组里加一项（建议放在最前面）：

```json
{
  "id": "my-new-note",
  "title": "笔记标题",
  "date": "2026-12-01",
  "tags": ["RNA-seq", "Linux"],
  "summary": "两三句话写清：做了什么、关键参数是什么、结论是什么。",
  "url": "https://github.com/你的用户名/你的笔记仓库/blob/main/xxx.md",
  "repo": "https://github.com/你的用户名/你的代码仓库",
  "readTime": "约 15 分钟"
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 否 | 唯一标识，方便自己查，不显示 |
| `title` | 是 | 标题 |
| `date` | 是 | `YYYY-MM-DD`，列表按它倒序 |
| `tags` | 否 | 字符串数组，页面会按标签生成筛选按钮（最多显示 12 个） |
| `summary` | 否 | 摘要，正文只写思路和关键参数 |
| `url` | 否 | 笔记全文地址（GitHub / 博客），不填则标题不可点 |
| `repo` | 否 | 代码仓库地址，会显示「代码」链接 |
| `readTime` | 否 | 例如「约 15 分钟」 |

### 2. 新增一个项目

编辑 `data/projects.json`：

```json
{
  "id": "my-project",
  "title": "项目名称",
  "date": "2026-12",
  "status": "进行中",
  "tags": ["Snakemake", "Python"],
  "summary": "目标是什么、用了什么方法、现在做到哪一步。",
  "highlights": ["一句话亮点 1", "一句话亮点 2"],
  "repo": "https://github.com/你的用户名/你的仓库",
  "demo": "https://你的演示地址",
  "featured": true
}
```

- `status` 目前支持 `进行中` / `已完成` / `持续维护`（其他值会按「已完成」样式显示）。
- `featured: true` 会优先出现在首页的「精选项目」。
- `repo`、`demo` 至少填一个；都空着时卡片不显示链接。

### 3. 新增一条时间线

编辑 `data/timeline.json` 的 `milestones`：

```json
{
  "date": "2026-12",
  "type": "学习",
  "title": "完成单细胞分析入门",
  "detail": "用 Seurat 跑完一个 PBMC 数据集，重点补了质控和整合。",
  "link": "https://github.com/你的用户名/你的笔记"
}
```

- `date` 用 `YYYY-MM` 或 `YYYY-MM-DD`，页面会自动按年和季度分组。
- `type` 支持 `学习` / `项目` / `里程碑`，对应不同颜色的节点。
- `link` 可选，会显示「相关记录」。

### 4. 新增一个资源

编辑 `data/resources.json`，在对应分类的 `items` 里加：

```json
{
  "name": "NCBI",
  "desc": "一句话说明这个资源是做什么的、什么时候会用到。",
  "url": "https://www.ncbi.nlm.nih.gov/"
}
```

新增分类：在 `groups` 里加一个 `{ "category": "分类名", "items": [...] }`，页面会自动生成锚点和卡片。

### 5. 改个人信息与技能矩阵

编辑 `data/site.json`：

- `name` / `role` / `positioning`：姓名、身份、一句话定位
- `intro`：首页和「关于我」的自我介绍
- `focus`：关注方向，显示为标签
- `updated`：页脚「最后更新」日期
- `contact`：联系方式；`copy: true` 会显示复制按钮
- `now`：最近在做什么
- `principles`：分析原则
- `skills`：技能矩阵，按分组填写

技能项格式：

```json
{ "name": "Linux / Shell", "level": "在用", "score": 78, "note": "文件操作、管道、awk / sed" }
```

- `level` 请保持为 `在用` / `会` / `想学`，对应三种颜色和等级说明。
- `score` 是 0–100 的自评，只影响进度条长度。
- `note` 是给面试官看的补充说明，建议写具体能力，而不是形容词。

---

## 需要你替换的地方

当前内容是为了展示结构而写的示例，上传前建议把这些换成自己的：

| 位置 | 需要替换 |
| --- | --- |
| `data/site.json` | `name`、`role`、`positioning`、`intro`、`contact`（邮箱、GitHub、博客、微信） |
| `data/site.json` | `skills` 里每一项的分数和说明 |
| `data/notes.json` | 全部示例笔记，尤其是 `url` / `repo`（现在指向 `github.com/biolmz/...`，仓库名仍是示例） |
| `data/projects.json` | 全部示例项目，尤其是仓库地址 |
| `data/timeline.json` | 按自己的真实经历调整时间和节点 |
| `data/resources.json` | 可以只留自己常用的，删掉不用的 |
| `index.html` | `<title>`、`meta description`、页头 / 页脚里的「刘铭哲」、GitHub 链接 |
| `admin.html` | 页头里的「刘铭哲」和 `<title>` |
| `assets/js/app.js` | 错误页和标题里出现的「刘铭哲」（搜索替换即可） |
| `assets/js/admin.js` | 如需改管理密码，替换 `PASSWORD_HASH`；默认仓库是 `biolmz/biolmz.github.io`，可在管理台设置里修改，不必改代码 |

把示例笔记 / 项目里的仓库名换成真实仓库；如果联系信息有变化，直接改 `data/site.json` 的 `contact`，或在管理台「站点资料」里改。

---

## 设计说明

- **技能矩阵**：表格分「工具 / 状态 / 熟练度 / 说明」四列，状态用颜色和样式区分：
  绿色实心「在用」、蓝色「会」、琥珀色虚线「想学」。首页只展示熟练度最高的 6 项，完整矩阵在「关于我」。
- **代码边界**：笔记和项目正文只放摘要与结论，完整代码、环境文件、运行记录统一放 GitHub；页面只负责展示和指路。
- **信息架构**：五个二级板块各有独立 URL（hash 路由），页头导航始终可见，移动端折叠成菜单。
- **无构建**：原生 HTML / CSS / JavaScript，不需要 npm、Webpack 或 Jekyll；GitHub Pages 直接托管。
- **管理台**：独立页面 `admin.html`，不进入公开导航；密码门只是入口遮挡，真正的写权限由 GitHub Token 控制；没有 Token 时退化为「编辑 + 导出 JSON」。
- **可访问性**：键盘焦点样式、跳到主内容链接、`aria-current` 导航状态、语义化表格、`prefers-reduced-motion` 降级。

## 常见问题

**打开页面显示「data/*.json 没有读出来」**
用 `file://` 直接打开时浏览器不允许读取 JSON。按页面提示运行 `python -m http.server 8000`，或部署到 GitHub Pages。

**页面只有页头页脚，正文空白**
检查浏览器控制台：通常是 `data/` 路径大小写不一致，或 JSON 里有语法错误（多了一个逗号、用了中文引号）。

**改了 JSON 但页面没变化**
浏览器缓存了旧文件。强制刷新（Ctrl/Cmd + Shift + R），或者确认文件保存为 UTF-8。

**想换主题默认值**
`index.html` 里有一段内联脚本，默认跟随系统；用户手动切换后会记在 `localStorage` 的 `bio-theme` 里。

**想加一个「简历下载」**
把 PDF 放进 `assets/`，在 `data/site.json` 的 `contact` 里加一项 `{ "label": "简历", "value": "PDF", "href": "assets/resume.pdf", "icon": "globe" }` 即可。`href` 支持 http(s)、mailto 和站内相对路径。

**管理台登录后看不到数据**
管理台和公开页面一样需要通过 `http://localhost` 或 GitHub Pages 访问，不能双击 `admin.html`。如果线上仍然报错，检查 `data/` 是否一起上传、JSON 是否有语法错误。

**管理台提交后网站没变化**
GitHub Pages 需要 1–2 分钟重新构建；可以先打开仓库的 Actions / Deployments 看构建状态。管理台内存里的内容已经更新，但公开页面要等部署完成。

---

内容版权归作者所有；页面代码可以自由参考和修改。
