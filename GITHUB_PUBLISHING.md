# GitHub 源码仓库发布说明

这份说明用于解释：为什么当前 GitHub 仓库只提交“可运行源码”，而不会提交本机依赖、模型、缓存和密钥。

## 发布范围

当前仓库会提交：

- 应用源码
- 接口路由和前端组件
- Windows 启动、同步、QA 辅助脚本
- GitHub Actions 工作流
- 示例环境变量文件 `.env.example`
- 本地开发和发布文档

当前仓库不会提交：

- `.env`、`.env.local` 等真实密钥文件
- `.venv`、`node_modules`、`.next`、`.runtime` 等本机产物
- `upscayl-api/models` 下的模型文件
- `upscayl-api/bin` 下的平台二进制
- `upscayl-api/outputs`、`upscayl-api/uploads` 等运行输出
- QA 截图、分析产物、缓存目录和本地日志

## 为什么不提交本地模型和二进制

`upscayl-api/models` 与 `upscayl-api/bin` 属于机器相关资源：

- 体积大，不适合作为源码仓库长期管理
- 不同机器、不同平台可能需要不同版本
- 某些文件属于本地运行依赖，而不是需要多人共同修改的源码

如果你在新机器上克隆仓库后需要启用 Upscayl：

1. 进入 `upscayl-api/`
2. 执行 `npm install`
3. 本地准备对应的 `bin/` 和 `models/`
4. 再启动主站或运行启动脚本

## 环境变量策略

仓库只保留 `.env.example`，并使用占位符：

```env
AI_API_KEY=your_ai_api_key
AI_API_BASE_URL=https://api.bltcy.ai
UPSCAYL_API_BASE_URL=http://127.0.0.1:3001
```

真实值应放在本机 `.env.local` 中，不能提交到 GitHub。

## 推送前检查清单

每次推送前至少检查：

1. `.env`、`.env.local` 没有被纳入暂存区
2. `.gitignore` 仍排除了本地模型、二进制、缓存和依赖目录
3. `.env.example` 只包含占位符，不包含真实密钥
4. `git status` 中没有 `.next`、`.runtime`、`node_modules`、`upscayl-api/models` 等本地产物
5. 如果改动了启动脚本或 API 路由，至少运行一次 `npm run typecheck`

## 适合公开到 GitHub 的内容

优先保留这些对协作最有价值的文件：

- `src/`
- `scripts/`
- `upscayl-api/server.js`
- `README.md`
- `SETUP_GUIDE.md`
- `DEV_SYNC_RELEASE.md`
- `.github/workflows/`

## 不适合公开到 GitHub 的内容

以下内容即使本地运行必需，也不建议直接提交：

- 团队内部真实 API Key
- 本机缓存目录
- 本机运行日志
- 大模型文件和平台专用二进制
- 浏览器本地数据库导出产物

## 当前仓库建议

如果后续需要把仓库进一步整理成外部可协作的开源形态，建议继续补充：

1. `LICENSE`
2. 更明确的 `CONTRIBUTING` 说明
3. 平台资源的下载说明，而不是把大文件直接放进 Git 仓库
