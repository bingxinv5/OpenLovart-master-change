# OpenLovart 本地开发设置指南

当前仓库默认以 demo/local-first 方式运行，不依赖 Clerk 或 Supabase 即可完成日常开发、演示和团队内部使用。

## 前置要求

- Node.js 18+
- npm
- 可用的 AI 网关密钥
- 如需本地视频转码，机器上需安装 `ffmpeg`

## 1. 安装依赖

```bash
npm install
```

## 2. 配置环境变量

在项目根目录创建 `.env.local`：

```env
AI_API_KEY=your_api_key
AI_API_BASE_URL=https://api.bltcy.ai
AI_API_ALLOWED_HOSTS=api.openai.com,*.openai.azure.com
UPSCAYL_API_BASE_URL=http://127.0.0.1:3001
```

说明：

- `AI_API_KEY` 为默认服务端密钥
- `AI_API_BASE_URL` 可省略，默认会回落到 `https://api.bltcy.ai`
- `AI_API_ALLOWED_HOSTS` 用于显式放行额外的公网 AI 网关主机；未配置时默认仅允许内网地址与 `https://api.bltcy.ai`
- 前端设置面板也支持通过请求头覆盖网关地址和密钥，便于每位成员使用自己的配置；但公网地址仍需在允许列表内
- `UPSCAYL_API_BASE_URL` 为可选项，用于让 Next 服务端代理 AI 放大服务；发布时不要再让浏览器直接访问 localhost
- 如果不同机器需要指向不同的 Upscayl 服务，也可以在设置中心的 API 页直接保存“当前机器运行实例”的 Upscayl 地址覆盖，而不必每次手改环境变量

## 3. 启动项目

```bash
npm run dev
```

打开 `http://localhost:3000`。

如果直接运行根目录的 [启动.bat](启动.bat)，脚本也会自动尝试拉起 `upscayl-api`，这样分镜切割里的 AI 放大能和主站一起启动。

## 3.1 启动发布版

如果目标是发布环境而不是开发环境，建议直接运行根目录的 [启动发布版.bat](启动发布版.bat)。

它会自动：

1. 检查根项目依赖
2. 检查 `upscayl-api` 依赖
3. 拉起 Upscayl API 服务
4. 执行 `npm run build`
5. 启动 Next 生产服务

## 4. 当前运行模式

### 认证

- 通过 `MockClerkProvider` 提供 demo 登录态
- 页面中展示的用户态为本地 mock 数据
- 当前默认开发流程不需要真实 Clerk 配置

### 数据存储

- 项目和画布数据保存在浏览器本地数据库中
- `useSupabase()` 目前是对本地 `localDb` 的兼容封装
- 本仓库中的 `supabase-schema.sql` 仅保留历史云端方案参考，不是当前默认运行依赖

### AI 能力

- 聊天：`/api/ai-chat`
- 图片生成：`/api/generate-image`
- 图片任务状态：`/api/image-status`
- 视频生成：`/api/generate-video`
- 视频任务状态：`/api/video-status`
- 分镜切割 AI 放大代理：`/api/upscale/health`、`/api/upscale/base64`

这些接口统一读取：

- `AI_API_KEY`
- `AI_API_BASE_URL`
- 或前端请求头中的 `x-ai-api-key` / `x-ai-base-url`

## 5. 推荐验证项

### 基础验证

1. 进入首页与画布页
2. 创建或打开项目
3. 添加文本、图片或视频元素
4. 刷新页面，确认本地项目可恢复

### AI 验证

1. 在设置面板中填入有效网关地址与密钥
2. 测试 AI 聊天是否有回复
3. 测试图片生成并轮询状态
4. 测试视频生成并轮询状态
5. 如启用分镜切割 AI 放大，确认 `UPSCAYL_API_BASE_URL` 指向可访问的 Upscayl API 服务

### 转码验证

如需使用视频转码接口：

1. 确认本机可直接执行 `ffmpeg`
2. 上传一个短视频
3. 验证 `/api/transcode-video` 返回 `video/mp4`

## 6. 常用命令

```bash
npm run dev
npm run build
npm run start
npm run lint -- <files>
npm run typecheck
```

## 6.1 服务器同步

本地验证完成后，建议通过脚本同步到团队服务器目录：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync_to_server.ps1
```

默认同步目标为：

```text
Z:\TD\TimeTable\AI\OpenLovart-master
```

也可以直接运行项目根目录的 `同步到服务器.bat`。

脚本默认会排除：

- `node_modules`
- `.next`
- `.git`
- `artifacts`
- `.env`
- `.env.local`
- `tsconfig.tsbuildinfo`

## 7. 画布 QA 自动化

项目内置了画布工作台自动化回归脚本。推荐在开发服务器运行中执行：

```bash
npm run dev
```

另开终端执行：

```bash
npm run qa:canvas:all
```

如果只想针对某一类问题快速回归，可以按场景运行：

```bash
npm run qa:canvas:layers
npm run qa:canvas:media
npm run qa:canvas:frame
```

也可以一次串跑全部场景脚本：

```bash
npm run qa:canvas:scenarios
```

场景含义：

- `qa:canvas:layers`：图层拖放、单选工具栏、多选/编组
- `qa:canvas:media`：图片发送对话、图层排序
- `qa:canvas:frame`：画布元素进入 / 移出画板层级

自动化产物输出到：

- `artifacts/canvas-qa/`
- `artifacts/canvas-qa/layers/`
- `artifacts/canvas-qa/media/`
- `artifacts/canvas-qa/canvas/`

建议优先查看 `summary.grouped.json`，它会按阶段汇总失败点。

如果当前改动主要落在分镜和多选工具栏，建议至少执行：

```bash
npm run qa:canvas:layers
```

### CI 自动回归

仓库中已提供 GitHub Actions 工作流 [canvas-qa.yml](.github/workflows/canvas-qa.yml)。

- PR 修改 `src/`、`scripts/`、`package.json`、`package-lock.json` 等相关文件时，会自动执行画布 QA
- 也可以在 GitHub Actions 页面手动触发
- CI 会自动上传 `artifacts/canvas-qa/` 目录，便于下载查看截图和 summary
- CI Job Summary 中也会直接汇总各场景 `summary.md`，无需先下载 artifact 即可快速查看结果

## 8. 常见问题

### AI 接口返回未配置密钥

检查：

- `.env.local` 是否存在 `AI_API_KEY`
- 是否重启过开发服务器
- 前端设置面板是否覆盖了空值

### 图片或视频一直处理中

检查：

- `AI_API_BASE_URL` 是否正确
- 上游网关是否真的返回任务 ID
- 状态接口是否能访问到同一网关

### 本地项目丢失

检查：

- 浏览器是否清除了站点数据
- 是否使用了隐身模式
- 是否切换了不同浏览器或不同域名端口

## 9. 关于历史云端文档

仓库里仍保留了一些 Clerk / Supabase 相关文件，主要用于记录历史方案或未来可能恢复的云端部署路径。除非你明确要恢复云端版本，否则当前开发请以本指南和 README 为准。

---

## 📞 获取帮助

- **Clerk 文档**: https://clerk.com/docs
- **Supabase 文档**: https://supabase.com/docs
- **Clerk + Supabase 集成**: https://clerk.com/docs/integrations/databases/supabase

---

祝你使用愉快！🎉
