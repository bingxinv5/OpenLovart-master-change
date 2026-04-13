# OpenLovart 本地开发设置指南

当前仓库默认以 demo/local-first 模式运行，不依赖 Clerk 或 Supabase 即可完成本地开发、演示和团队内部使用。

## 前置要求

- Node.js 20+
- npm
- 可用的 AI 网关密钥
- 如需本地视频转码，机器上需安装 `ffmpeg`
- 如需分镜切割 AI 放大，需在本机准备 `upscayl-api/bin` 与 `upscayl-api/models`

## 1. 安装依赖

```bash
npm install
```

如需本地运行 Upscayl API：

```bash
cd upscayl-api
npm install
```

说明：`upscayl-api` 的模型文件和平台二进制不会提交到 GitHub 源码仓库，需要在目标机器本地准备。

## 2. 配置环境变量

在项目根目录创建 `.env.local`：

```env
AI_API_KEY=your_ai_api_key
AI_API_BASE_URL=https://api.bltcy.ai
AI_API_ALLOWED_HOSTS=api.openai.com,*.openai.azure.com
UPSCAYL_API_BASE_URL=http://127.0.0.1:3001
```

说明：

- `AI_API_KEY`：默认服务端密钥
- `AI_API_BASE_URL`：可省略，默认回落到 `https://api.bltcy.ai`
- `AI_API_ALLOWED_HOSTS`：显式放行额外公网 AI 网关主机
- `UPSCAYL_API_BASE_URL`：主站服务端代理访问 Upscayl 的默认地址
- 设置中心 API 页也支持保存“当前机器运行实例”的 Upscayl 地址覆盖

## 3. 启动项目

### 开发模式

```bash
npm run dev
```

或直接运行 [启动.bat](./启动.bat)。默认行为：

1. 检查根项目依赖
2. 检查 `upscayl-api` 依赖
3. 拉起 Upscayl API
4. 启动 Next 开发服务

浏览器访问 `http://localhost:3000`。

### 发布模式

直接运行 [启动发布版.bat](./启动发布版.bat)。脚本会自动：

1. 检查根项目依赖
2. 检查 `upscayl-api` 依赖
3. 拉起 Upscayl API
4. 执行 `npm run build`
5. 启动 Next 生产服务

## 4. Upscayl 运行说明

主站不会再让浏览器直接访问本机 `localhost:3001`，而是统一通过 `/api/upscale/*` 服务端代理访问独立的 Upscayl 服务。

当前支持三种启动输出模式：

- `inline`：默认值，在当前启动窗口里一起显示 Upscayl 输出
- `hidden`：后台隐藏启动
- `window`：单独弹出一个服务窗口

切换方式：

```powershell
$env:OPENLOVART_UPSCAYL_MODE = 'hidden'
```

或：

```powershell
$env:OPENLOVART_UPSCAYL_MODE = 'window'
```

## 5. 当前运行模式

### 认证

- 通过 `MockClerkProvider` 提供 demo 登录态
- 页面中展示的用户态为本地 mock 数据
- 当前默认开发流程不需要真实 Clerk 配置

### 数据存储

- 项目和画布数据保存在浏览器本地数据库中
- `useSupabase()` 当前是对本地 `localDb` 的兼容封装
- `supabase-schema.sql` 仅保留历史云端方案参考

### AI 能力

- 聊天：`/api/ai-chat`
- 图片生成：`/api/generate-image`
- 图片任务状态：`/api/image-status`
- 视频生成：`/api/generate-video`
- 视频任务状态：`/api/video-status`
- AI 放大代理：`/api/upscale/health`、`/api/upscale/base64`

这些接口统一读取：

- `AI_API_KEY`
- `AI_API_BASE_URL`
- 前端请求头中的 `x-ai-api-key` / `x-ai-base-url`

## 6. 推荐验证项

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
5. 如启用分镜切割 AI 放大，确认 Upscayl 服务健康可达

### 转码验证

如需使用视频转码接口：

1. 确认本机可直接执行 `ffmpeg`
2. 上传一个短视频
3. 验证 `/api/transcode-video` 返回 `video/mp4`

## 7. 常用命令

```bash
npm run dev
npm run build
npm run start
npm run typecheck
npm run test
npm run qa:canvas:scenarios
```

## 8. 服务器同步

本地验证完成后，建议通过脚本同步到团队服务器目录：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync_to_server.ps1
```

默认同步目标为：

```text
Z:\TD\TimeTable\AI\OpenLovart-master
```

也可以直接运行 [同步到服务器.bat](./同步到服务器.bat)。

完整工作流见 [DEV_SYNC_RELEASE.md](./DEV_SYNC_RELEASE.md)。

## 9. 画布 QA 自动化

项目内置了画布工作台自动化回归脚本。推荐在开发服务器运行中执行：

```bash
npm run qa:canvas:layers
npm run qa:canvas:media
npm run qa:canvas:frame
npm run qa:canvas:projects
npm run qa:canvas:settings
npm run qa:canvas:persistence
npm run qa:canvas:scenarios
```

CI 自动回归工作流见 [canvas-qa.yml](./.github/workflows/canvas-qa.yml)。

## 10. 常见问题

### AI 接口返回未配置密钥

检查：

- `.env.local` 是否存在 `AI_API_KEY`
- 是否重启过开发服务器
- 前端设置面板是否覆盖了空值

### 图片或视频一直处理中

检查：

- `AI_API_BASE_URL` 是否正确
- 上游网关是否真的返回任务 ID
- 状态接口是否访问到同一网关

### 本地项目丢失

检查：

- 浏览器是否清除了站点数据
- 是否使用了隐身模式
- 是否切换了不同浏览器或不同域名端口

### 启动时找不到 Upscayl 模型

检查：

- `upscayl-api/models` 是否已在本机准备完成
- `upscayl-api/bin` 是否包含对应平台的可执行文件
- 是否误以为这些本地资源会随 GitHub 源码仓库一起分发

## 11. 关于历史云端文档

仓库里仍保留了一些 Clerk / Supabase 相关文件，主要用于记录历史方案或未来可能恢复的云端部署路径。除非明确要恢复云端版本，否则当前开发请以本指南和 README 为准。
