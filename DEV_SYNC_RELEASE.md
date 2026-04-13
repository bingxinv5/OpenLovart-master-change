# OpenLovart 开发、同步、发布流程

这份文档用于统一团队在本地开发、同步服务器目录和启动发布版时的操作方式。

## 1. 本地开发

### 方式 A：直接命令行启动

```bash
npm install
npm run dev
```

适合：

- 只调主站代码
- 已经手动准备好 Upscayl 环境
- 不依赖 Windows 批处理脚本

### 方式 B：使用启动脚本

直接运行 [启动.bat](./启动.bat)。

脚本会自动：

1. 检查项目目录
2. 检查依赖是否需要安装
3. 尝试拉起 `upscayl-api`
4. 启动 Next 开发服务

说明：

- 默认把 Upscayl 输出合并到同一个控制台窗口
- 浏览器工作数据默认绑定 `http://localhost:3000`
- 如果你需要独立 Upscayl 窗口，可设置 `OPENLOVART_UPSCAYL_MODE=window`

## 2. 开发阶段建议验证

每次较大改动后，建议至少执行：

```bash
npm run typecheck
```

如改动涉及画布和设置中心，建议继续执行：

```bash
npm run qa:canvas:settings
npm run qa:canvas:scenarios
```

## 3. 同步到服务器目录

推荐使用：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync_to_server.ps1
```

或直接运行 [同步到服务器.bat](./同步到服务器.bat)。

默认同步目标：

```text
Z:\TD\TimeTable\AI\OpenLovart-master
```

同步脚本默认会排除：

- `node_modules`
- `.next`
- `.git`
- `artifacts`
- `graphify-out`
- `.env`
- `.env.local`
- `.runtime`
- `upscayl-api/outputs`
- `upscayl-api/uploads`

## 4. 服务器目录启动发布版

在目标目录运行 [启动发布版.bat](./启动发布版.bat)。

脚本会自动：

1. 检查根项目依赖
2. 检查 `upscayl-api` 依赖
3. 拉起 Upscayl API
4. 运行 `npm run build`
5. 启动 Next 生产服务

默认访问地址：

```text
http://localhost:3000
```

## 5. GitHub 源码仓库提交流程

如果目标是把“源码”而不是“本机运行环境”同步到 GitHub，请使用这个顺序：

1. 确认 `.gitignore` 已排除模型、二进制、缓存和密钥文件
2. 检查 `.env.example` 只保留占位符
3. 运行 `git status`
4. 运行必要的 `typecheck` 或 QA
5. 再执行 `git add`、`git commit`、`git push`

## 6. Upscayl 启动模式

可选环境变量：

```powershell
$env:OPENLOVART_UPSCAYL_MODE = 'inline'
```

支持值：

- `inline`：默认，在当前窗口显示 Upscayl 输出
- `hidden`：后台隐藏运行
- `window`：弹出独立服务窗口

## 7. 常见问题

### 启动后多一个服务窗口

默认已经改为 `inline`，正常情况下不会再单独弹出窗口。只有显式设置 `OPENLOVART_UPSCAYL_MODE=window` 才会恢复独立窗口模式。

### 同步脚本失败

优先检查：

- 目标目录是否可访问
- 当前 PowerShell 是否能执行脚本
- 是否误把本地缓存或超大文件带入同步目录

### 发布目录可以运行，但 GitHub 仓库缺模型

这是预期行为。GitHub 仓库只同步源码，不会同步本地模型和平台二进制。目标机器仍需本地准备 Upscayl 相关资源。
