# OpenLovart 工作台

[![Canvas QA](https://github.com/bingxinv5/OpenLovart-master/actions/workflows/canvas-qa.yml/badge.svg)](https://github.com/bingxinv5/OpenLovart-master/actions/workflows/canvas-qa.yml)
[![Kimi Review](https://github.com/bingxinv5/OpenLovart-master/actions/workflows/kimi-review.yml/badge.svg)](https://github.com/bingxinv5/OpenLovart-master/actions/workflows/kimi-review.yml)

OpenLovart 是一个面向图片、视频和分镜生产链路的 AI 画布工作台。当前仓库发布的是可运行源码版本，默认采用 demo/local-first 架构：认证使用本地 mock，项目与画布数据默认保存在浏览器本地数据库，同时通过可配置 AI 网关完成聊天、图片和视频生成。

## 仓库定位

- 前端与主服务：Next.js 16 + React 19 + TypeScript
- 本地持久化：IndexedDB 兼容层 `localDb`
- 认证模式：`MockClerkProvider`
- AI 接入：统一走可配置网关
- 放大服务：通过 Next 服务端代理对接独立 `upscayl-api`
- 运行方式：支持本地开发、服务器同步和 Windows 双服务启动脚本

## 核心能力

- AI 设计聊天面板
- 画布式图片与视频工作台
- 分镜规划、批量出图与批量出视频
- 视频任务 `task_id` 手动查询与恢复
- 项目级参考库、媒体历史、画布素材回流与复用
- 图片上传、预览、LOD 加载与本地缓存
- 本地项目保存、恢复、历史记录与脏数据跟踪
- 视频转码与下载代理接口
- 机器级配置：CDN 缓存目录、Upscayl 服务地址

## 这个源码仓库包含什么

- 应用源码、接口路由和脚本
- GitHub Actions 工作流
- 画布 QA 自动化脚本
- Windows 开发、同步、发布启动脚本
- 示例环境变量文件 `.env.example`

## 这个源码仓库不包含什么

- 真实密钥、`.env`、`.env.local`
- `node_modules`、`.next`、`.runtime` 等本地产物
- `upscayl-api/models` 下的本地模型文件
- `upscayl-api/bin` 下的平台二进制
- QA 截图、分析产物、缓存和本地运行日志

如果你准备从 GitHub 拉取仓库到新机器，请先看 [GITHUB_PUBLISHING.md](./GITHUB_PUBLISHING.md) 和 [DEV_SYNC_RELEASE.md](./DEV_SYNC_RELEASE.md)。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

如果需要启用分镜切割 AI 放大，还需要在 `upscayl-api/` 下安装依赖，并准备本机模型与可执行文件。源码仓库不会提交这些本地资源，详见 [GITHUB_PUBLISHING.md](./GITHUB_PUBLISHING.md)。

### 2. 配置环境变量

创建 `.env.local`：

```env
AI_API_KEY=your_ai_api_key
AI_API_BASE_URL=https://api.bltcy.ai
UPSCAYL_API_BASE_URL=http://127.0.0.1:3001
```

说明：

- `AI_API_KEY`：主站服务端默认使用的 AI 网关密钥
- `AI_API_BASE_URL`：可选，默认回落到 `https://api.bltcy.ai`
- `UPSCAYL_API_BASE_URL`：可选，主站会通过 `/api/upscale/*` 服务端代理访问 Upscayl
- 设置中心的 API 页支持为“当前机器运行实例”保存一份 Upscayl 地址覆盖

### 3. 启动开发环境

```bash
npm run dev
```

或直接运行 [启动.bat](./启动.bat)。当前默认会把 Upscayl 的启动日志合并到同一个控制台窗口里，不再额外弹出服务窗口。

浏览器访问 `http://localhost:3000`。

### 4. 启动发布版

如需在目标目录以双服务模式运行，可直接运行 [启动发布版.bat](./启动发布版.bat)。脚本会自动：

1. 检查主项目依赖
2. 检查 `upscayl-api` 依赖
3. 拉起 Upscayl API
4. 执行 `npm run build`
5. 启动 Next 生产服务

## 常用命令

| 场景 | 命令 |
| --- | --- |
| 本地开发 | `npm run dev` |
| 生产构建 | `npm run build` |
| 启动生产服务 | `npm run start` |
| 类型检查 | `npm run typecheck` |
| 单元测试 | `npm run test` |
| 全量画布 QA | `npm run qa:canvas:all` |
| 场景回归 | `npm run qa:canvas:scenarios` |

## 开发、同步、发布流程

### 日常开发

- 推荐使用 [启动.bat](./启动.bat) 或 `npm run dev`
- 浏览器本地工作数据默认绑定 `http://localhost:3000`
- 设置中心可保存机器级 CDN 缓存目录与 Upscayl 服务地址

### 同步到服务器目录

团队当前默认同步目标为 `Z:\TD\TimeTable\AI\OpenLovart-master`。

推荐执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync_to_server.ps1
```

或直接运行 [同步到服务器.bat](./同步到服务器.bat)。同步脚本会自动排除依赖、缓存、模型、构建产物和本地环境文件。

### 运行发布版

同步完成后，在目标目录执行 [启动发布版.bat](./启动发布版.bat)。

完整流程文档见 [DEV_SYNC_RELEASE.md](./DEV_SYNC_RELEASE.md)。

## 画布 QA 与 CI

项目内置了一组面向高频画布交互链路的 QA 脚本，推荐先启动开发服务器再执行：

```bash
npm run qa:canvas:layers
npm run qa:canvas:media
npm run qa:canvas:frame
npm run qa:canvas:projects
npm run qa:canvas:settings
npm run qa:canvas:persistence
npm run qa:canvas:scenarios
```

相关 GitHub Actions：

- [canvas-qa.yml](./.github/workflows/canvas-qa.yml)：自动执行 `typecheck` 和画布 QA
- [kimi-review.yml](./.github/workflows/kimi-review.yml)：代码审阅辅助流程

## 目录结构

```text
src/
  app/
    api/               # 图片、视频、聊天、下载、转码、放大代理接口
    canvas/            # 画布工作台页
    projects/          # 项目列表页
    user/              # 用户页
  components/lovart/   # 核心工作台组件
  hooks/               # 本地兼容层 hooks
  lib/                 # 本地数据库、图片存储、历史、设置、索引等基础模块
scripts/               # 开发、同步、QA、发布辅助脚本
upscayl-api/           # 独立 Upscayl API 服务源码
```

## 关键模块

- `src/app/canvas/page.tsx`：工作台页面编排
- `src/components/lovart/CanvasArea.tsx`：画布交互主组件
- `src/components/lovart/AiDesignerPanel.tsx`：AI 聊天与设计建议面板
- `src/app/api/_shared/cdn-cache.ts`：CDN 缓存目录解析、状态和清理能力
- `src/app/api/_shared/upscale-service.ts`：主站对 Upscayl 的服务端代理与机器级设置
- `src/lib/local-db.ts`：本地数据存储兼容层
- `src/lib/history-manager.ts`：撤销 / 重做
- `src/lib/dirty-tracker.ts`：脏数据跟踪与增量保存

## 文档索引

- [SETUP_GUIDE.md](./SETUP_GUIDE.md)：本地开发环境与依赖准备
- [DEV_SYNC_RELEASE.md](./DEV_SYNC_RELEASE.md)：开发、同步、发布完整流程
- [GITHUB_PUBLISHING.md](./GITHUB_PUBLISHING.md)：GitHub 源码仓库发布范围与安全检查

## 重要说明

- 当前仓库默认不是 Clerk + Supabase 云端部署版本
- `useSupabase()` 目前返回的是本地 `localDb` 兼容层，而不是 Supabase SDK
- `AuthProvider` 当前使用 mock provider，便于无外部依赖的本地开发和演示
- 仓库中的部分旧文档仍保留历史云端架构背景，请优先以 README 与当前指南为准
