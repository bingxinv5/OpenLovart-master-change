# 🚀 Upscayl API Server

基于 Upscayl 的 AI 图像放大 REST API 服务，专为九宫格图片拆分网站等应用场景设计。

## ✅ 系统要求

- **GPU**: 支持 Vulkan 的 NVIDIA 显卡 (已验证 RTX 3080 ✓)
- **Node.js**: v16+
- **操作系统**: Windows 10/11

## 📦 快速开始

### 1. 安装依赖

```bash
cd api-server
npm install
```

### 2. 启动服务

```bash
npm start
```

服务默认将在 `http://localhost:3001` 启动。

可选环境变量：

- `PORT`: Upscayl API 监听端口，默认 `3001`
- `PUBLIC_BASE_URL`: 返回下载链接时使用的公开地址，默认 `http://localhost:<PORT>`

如果由 OpenLovart 主站代理访问，建议主项目通过 `UPSCAYL_API_BASE_URL` 指向该服务，例如：

```env
UPSCAYL_API_BASE_URL=http://127.0.0.1:3001
```

## 📡 API 接口文档

### 基础信息

| 属性 | 值 |
|------|-----|
| Base URL | `http://localhost:3001` |
| 响应格式 | JSON |
| 图片限制 | 最大 50MB |

---

### 1. 健康检查

检查服务是否正常运行。

```http
GET /api/health
```

**响应示例:**
```json
{
  "status": "ok",
  "gpu": "NVIDIA GeForce RTX 3080",
  "models": ["upscayl-standard-4x", "ultrasharp-4x", ...]
}
```

---

### 2. 获取模型列表

```http
GET /api/models
```

**响应示例:**
```json
{
  "status": "success",
  "data": [
    { "id": "upscayl-standard-4x", "name": "upscayl standard (4x)", "scale": 4 },
    { "id": "ultrasharp-4x", "name": "ultrasharp (4x)", "scale": 4 }
  ]
}
```

**可用模型:**

| 模型 ID | 说明 | 适用场景 |
|---------|------|----------|
| `upscayl-standard-4x` | 标准模型 | 通用 |
| `upscayl-lite-4x` | 轻量模型 | 速度优先 |
| `ultrasharp-4x` | 超清晰模型 | 追求细节 |
| `ultramix-balanced-4x` | 平衡模型 | 综合效果 |
| `high-fidelity-4x` | 高保真模型 | 照片还原 |
| `remacri-4x` | Remacri 模型 | 通用增强 |
| `digital-art-4x` | 数字艺术模型 | 插画/动漫 |

---

### 3. 同步图像放大 (文件上传)

上传图片并等待放大完成后返回结果。

```http
POST /api/upscale
Content-Type: multipart/form-data
```

**请求参数:**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| image | File | ✅ | 图片文件 (JPG/PNG/WEBP) |
| model | string | ❌ | 模型 ID，默认 `upscayl-standard-4x` |
| scale | number | ❌ | 放大倍数，默认 `4` |
| format | string | ❌ | 输出格式: `png`/`jpg`/`webp`，默认 `png` |
| compression | number | ❌ | 压缩率 0-100，默认 `0` |

**响应示例:**
```json
{
  "status": "success",
  "data": {
    "fileName": "abc123_upscaled.png",
    "fileSize": 1048576,
    "downloadUrl": "/outputs/abc123_upscaled.png",
    "fullUrl": "http://localhost:3000/outputs/abc123_upscaled.png"
  }
}
```

**cURL 示例:**
```bash
curl -X POST http://localhost:3000/api/upscale \
  -F "image=@photo.jpg" \
  -F "model=ultrasharp-4x" \
  -F "format=png"
```

---

### 4. Base64 图像放大 ⭐ (推荐用于九宫格网站)

适合前端 Canvas 导出的图片直接调用。

```http
POST /api/upscale/base64
Content-Type: application/json
```

**请求体:**
```json
{
  "image": "data:image/png;base64,iVBORw0KGgoAAAANS...",
  "model": "ultrasharp-4x",
  "scale": 4,
  "format": "png",
  "compression": 0
}
```

**响应示例:**
```json
{
  "status": "success",
  "data": {
    "image": "data:image/png;base64,iVBORw0KGgoAAAANS...",
    "format": "png",
    "size": 2097152
  }
}
```

---

### 5. 异步图像放大

适合大图片，立即返回任务 ID，后台处理。

```http
POST /api/upscale/async
Content-Type: multipart/form-data
```

**请求参数:** 同 `/api/upscale`

**响应示例:**
```json
{
  "status": "success",
  "data": {
    "taskId": "550e8400-e29b-41d4-a716-446655440000",
    "message": "任务已开始处理"
  }
}
```

---

### 6. 查询任务状态

```http
GET /api/task/:taskId
```

**响应示例:**
```json
{
  "status": "success",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed",
    "progress": 100,
    "outputFileName": "550e8400_upscaled.png",
    "downloadUrl": "/outputs/550e8400_upscaled.png",
    "fullUrl": "http://localhost:3000/outputs/550e8400_upscaled.png"
  }
}
```

**状态值:**
- `processing` - 处理中
- `completed` - 已完成
- `failed` - 失败

---

## 🎯 九宫格网站集成示例

### JavaScript 客户端

```javascript
// 放大 Canvas 导出的图片
async function upscaleCanvasImage(canvas) {
  const base64 = canvas.toDataURL('image/png');
  
  const response = await fetch('http://localhost:3000/api/upscale/base64', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: base64,
      model: 'ultrasharp-4x',
      scale: 4,
      format: 'png'
    })
  });
  
  const result = await response.json();
  return result.data.image; // 返回放大后的 base64
}

// 九宫格拆分 + AI 放大
async function splitAndUpscale(image) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const size = image.width / 3;
  canvas.width = canvas.height = size;
  
  const results = [];
  
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(image, col * size, row * size, size, size, 0, 0, size, size);
      
      const upscaled = await upscaleCanvasImage(canvas);
      results.push({ row, col, image: upscaled });
    }
  }
  
  return results;
}
```

### 下载放大后的图片

```javascript
function downloadImage(base64, filename) {
  const link = document.createElement('a');
  link.href = base64;
  link.download = filename;
  link.click();
}
```

---

## ⚠️ 跨域配置

如果你的九宫格网站部署在其他域名，需要修改 `server.js` 中的 CORS 配置：

```javascript
app.use(cors({
  origin: ['http://localhost:8080', 'https://your-website.com'],
  methods: ['GET', 'POST']
}));
```

---

## 📊 性能参考 (RTX 3080)

| 图片尺寸 | 放大后 | 处理时间 |
|----------|--------|----------|
| 256x256 | 1024x1024 | ~0.5s |
| 512x512 | 2048x2048 | ~1s |
| 1024x1024 | 4096x4096 | ~3s |
| 1920x1080 | 7680x4320 | ~8s |

---

## 🔧 生产部署建议

1. **使用 PM2 管理进程:**
   ```bash
   npm install -g pm2
   pm2 start server.js --name upscayl-api
   pm2 save
   ```

2. **配置 Nginx 反向代理:**
   ```nginx
   server {
       listen 80;
       server_name api.yoursite.com;
       
       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           client_max_body_size 50M;
       }
   }
   ```

3. **定期清理输出文件:**
   ```bash
   # 清理超过1天的文件
   find ./outputs -mtime +1 -delete
   ```

---

## 📝 License

基于 Upscayl (AGPL-3.0) 开源项目。
