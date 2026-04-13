# OpenLovart 工作台

OpenLovart 当前是一个面向团队内部高频使用场景的 AI 画布工作台，采用 demo/local-first 架构：认证为本地 mock，项目与画布数据默认保存在浏览器本地数据库中，同时通过可配置 AI 网关完成图片、视频与聊天生成能力。

## 当前实现概览

- Next.js 16 + React 19 + TypeScript
- Tailwind CSS 4
- App Router API 路由
- 本地持久化：IndexedDB（通过 `localDb` 封装）
- Demo 认证：`MockClerkProvider`
- AI 能力：统一走可配置网关

## 主要能力

- AI 设计聊天面板
- 画布式图片与视频工作台
- 分镜规划、批量出图与批量出视频
- 视频任务 task_id 手动查询与恢复
- 项目级参考库独立面板、参考图多选批量回流与批量移出、媒体历史、画布图片一键入库、画布多选图片批量入库、结果回流画布，以及图片/视频生成器与上下文 AI 工具间的素材复用
- 图片上传、预览、LOD 加载与本地缓存
- 本地项目保存、恢复、历史记录与脏数据跟踪
- 视频转码与下载代理接口

## 重要说明

- 当前仓库默认不是 Clerk + Supabase 云端部署版本。
- `useSupabase()` 目前返回的是本地 `localDb` 兼容层，而不是 Supabase SDK。
- `AuthProvider` 当前使用 mock provider，便于在无外部依赖下进行本地开发和演示。
- 仓库中的部分旧文档仍保留了历史云端架构背景，已逐步改为以当前实现为准。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

当前最重要的是 AI 网关配置。创建 `.env.local`：

```env
AI_API_KEY=your_api_key
AI_API_BASE_URL=https://api.bltcy.ai
UPSCAYL_API_BASE_URL=http://127.0.0.1:3001
```

说明：

- `AI_API_KEY`：服务端默认使用的 AI 网关密钥
- `AI_API_BASE_URL`：可选，默认为 `https://api.bltcy.ai`
- 前端也支持通过请求头临时覆盖这两个值，便于团队成员在设置面板中切换网关
- `UPSCAYL_API_BASE_URL`：可选，指向独立运行的 Upscayl API；主项目会通过 Next 服务端代理访问它，适合发布部署
- 设置中心的 API 页也支持为“当前机器运行实例”保存一份 Upscayl 服务地址覆盖，便于不同机器切换到本机或内网里的不同 Upscayl 节点

### 3. 启动开发环境

```bash
npm run dev
```

浏览器访问 `http://localhost:3000`。

如果直接运行根目录的 [启动.bat](启动.bat)，脚本会优先检查并拉起独立的 `upscayl-api` 服务，再启动 OpenLovart 开发服务。

### 3.1 启动发布版

如需在发布环境同时启动主站和 Upscayl API，可直接运行根目录的 [启动发布版.bat](启动发布版.bat)。

该脚本会自动：

- 检查主项目依赖
- 检查 `upscayl-api` 依赖
- 拉起独立的 Upscayl API 服务
- 执行 `npm run build`
- 启动 Next 生产服务

## 常用命令

```bash
npm run dev
npm run build
npm run start
npm run lint -- <files>
npm run typecheck
```

## 服务器同步

团队使用的服务器目录为 `Z:\TD\TimeTable\AI\OpenLovart-master`。

推荐在本地验证完成后执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync_to_server.ps1
```

也可以直接运行根目录的 `同步到服务器.bat`。

同步脚本会自动排除 `node_modules`、`.next`、`.git`、`artifacts`、`.env`、`.env.local` 等不应发布到服务器目录的内容。

同步完成后，可在目标目录直接运行 [启动发布版.bat](启动发布版.bat) 进入双服务发布模式。

## 画布 QA 自动化

当前仓库已内置一组面向画布工作台的 Playwright QA 脚本，用于稳定验证高频交互链路，尤其是：

- 图层面板拖入画板 / 移回顶层
- 图层同级排序
- 单选与多选工具栏操作
- 编组与解组
- 图片发送到对话
- 画布内元素进入 / 移出画板层级

建议先启动开发服务器：

```bash
npm run dev
```

然后按需执行：

```bash
npm run qa:canvas:all
npm run qa:canvas:layers
npm run qa:canvas:media
npm run qa:canvas:frame
npm run qa:canvas:projects
npm run qa:canvas:settings
npm run qa:canvas:persistence
npm run qa:canvas:scenarios
```

说明：

- `qa:canvas:all`：运行全量主脚本
- `qa:canvas:layers`：只跑图层拖放、单选、多选/编组相关场景
- `qa:canvas:media`：覆盖图片发送对话、画布图片直接入项目参考库、画布多选图片批量入项目参考库、项目媒体历史、项目参考库独立面板、参考图多选批量回流与批量移出、上下文 AI 编辑参考图透传、继续生成继承当前图片与项目参考图、视频恢复入口与图层排序场景
- `qa:canvas:frame`：只跑画布元素进入 / 移出画板层级场景
- `qa:canvas:projects`：验证项目列表的新建、收藏、搜索、复制、删除链路
- `qa:canvas:settings`：验证设置中心的 API、默认值、保存与恢复默认链路
- `qa:canvas:persistence`：验证画布标题自动保存、项目创建、视口落盘与刷新恢复链路
- `qa:canvas:scenarios`：顺序执行以上 6 个场景脚本

产物目录：

- 全量结果：`artifacts/canvas-qa/`
- 图层场景：`artifacts/canvas-qa/layers/`
- 媒体场景：`artifacts/canvas-qa/media/`
- 画布场景：`artifacts/canvas-qa/canvas/`
- 项目场景：`artifacts/canvas-qa/projects/`
- 设置场景：`artifacts/canvas-qa/settings/`
- 持久化场景：`artifacts/canvas-qa/persistence/`

每个目录下通常包含：

- `01-initial.png`
- `02-final.png`
- `summary.json`
- `summary.grouped.json`

其中 `summary.grouped.json` 会按阶段汇总，便于快速定位失败区段。

### CI 说明

仓库已新增 GitHub Actions 工作流 [canvas-qa.yml](.github/workflows/canvas-qa.yml)。

- 在涉及 `src/`、`scripts/`、`package.json`、`package-lock.json` 的 PR 上会自动运行
- 也支持在 Actions 页面手动触发
- 工作流会自动：
  - 安装依赖
  - 安装 Playwright Chromium
  - 启动本地 Next 开发服务器
  - 执行 `npm run typecheck`
  - 执行 `npm run qa:canvas:scenarios`
  - 上传 `artifacts/canvas-qa/` 作为 CI 产物
- 同时会把各场景的 `summary.md` 汇总到 GitHub Job Summary，便于在 PR / Actions 页面直接查看结果

## 目录结构

```text
src/
  app/
    api/               # 图片、视频、聊天、下载、转码接口
    canvas/            # 画布工作台页
    projects/          # 项目列表页
    user/              # 用户页
  components/lovart/   # 核心工作台组件
  hooks/               # 兼容层 hooks
  lib/                 # 本地数据库、图片存储、历史、设置、索引等基础模块
scripts/               # 开发辅助脚本
```

## 核心模块

- `src/app/canvas/page.tsx`：工作台页面编排
- `src/components/lovart/CanvasArea.tsx`：画布交互主组件
- `src/components/lovart/AiDesignerPanel.tsx`：AI 聊天与设计建议面板
- `src/lib/local-db.ts`：本地数据存储兼容层
- `src/lib/image-store.ts`：图片引用、Blob URL、LOD 缓存
- `src/lib/history-manager.ts`：撤销/重做
- `src/lib/dirty-tracker.ts`：脏数据跟踪与增量保存

## 文档说明

- [SETUP_GUIDE.md](./SETUP_GUIDE.md)：当前 demo/local-first 开发说明
- [阶段D验收发布说明.md](./阶段D验收发布说明.md)：当前第一版迁移的验收、回归和发布说明

## 后续重构方向

- 继续拆分大型画布与 AI 组件
- 统一 API 路由的共享逻辑
- 清理历史命名，降低 demo/local-first 与云端术语混用带来的认知成本
