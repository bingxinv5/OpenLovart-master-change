/**
 * Upscayl API 客户端
 * 用于在你的九宫格网站中集成 AI 图像放大功能
 */

class UpscaylClient {
  constructor(baseUrl = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
  }

  /**
   * 检查服务是否可用
   */
  async health() {
    const res = await fetch(`${this.baseUrl}/api/health`);
    return res.json();
  }

  /**
   * 获取可用模型列表
   */
  async getModels() {
    const res = await fetch(`${this.baseUrl}/api/models`);
    return res.json();
  }

  /**
   * 同步放大图片 (File 对象)
   * @param {File} imageFile - 图片文件
   * @param {Object} options - 放大选项
   * @returns {Promise<{downloadUrl: string, fullUrl: string}>}
   */
  async upscaleFile(imageFile, options = {}) {
    const formData = new FormData();
    formData.append('image', imageFile);
    
    if (options.model) formData.append('model', options.model);
    if (options.scale) formData.append('scale', options.scale.toString());
    if (options.format) formData.append('format', options.format);
    if (options.compression) formData.append('compression', options.compression.toString());

    const res = await fetch(`${this.baseUrl}/api/upscale`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || '放大失败');
    }

    return res.json();
  }

  /**
   * 放大 Base64 图片 (适合 Canvas 导出的图片)
   * @param {string} base64Image - Base64 图片数据 (可带 data: 前缀)
   * @param {Object} options - 放大选项
   * @returns {Promise<{image: string}>} - 返回放大后的 base64 图片
   */
  async upscaleBase64(base64Image, options = {}) {
    const res = await fetch(`${this.baseUrl}/api/upscale/base64`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: base64Image,
        model: options.model || 'upscayl-standard-4x',
        scale: options.scale || 4,
        format: options.format || 'png',
        compression: options.compression || 0
      })
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || '放大失败');
    }

    return res.json();
  }

  /**
   * 异步放大图片 (适合大图片，不阻塞)
   * @param {File} imageFile - 图片文件
   * @param {Object} options - 放大选项
   * @returns {Promise<{taskId: string}>}
   */
  async upscaleAsync(imageFile, options = {}) {
    const formData = new FormData();
    formData.append('image', imageFile);
    
    if (options.model) formData.append('model', options.model);
    if (options.scale) formData.append('scale', options.scale.toString());
    if (options.format) formData.append('format', options.format);

    const res = await fetch(`${this.baseUrl}/api/upscale/async`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || '放大失败');
    }

    return res.json();
  }

  /**
   * 查询任务状态
   * @param {string} taskId - 任务ID
   */
  async getTaskStatus(taskId) {
    const res = await fetch(`${this.baseUrl}/api/task/${taskId}`);
    return res.json();
  }

  /**
   * 等待任务完成
   * @param {string} taskId - 任务ID
   * @param {Function} onProgress - 进度回调
   * @returns {Promise<Object>} - 完成后的任务数据
   */
  async waitForTask(taskId, onProgress = null) {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const result = await this.getTaskStatus(taskId);
          const task = result.data;

          if (onProgress) {
            onProgress(task.progress, task.status);
          }

          if (task.status === 'completed') {
            resolve(task);
          } else if (task.status === 'failed') {
            reject(new Error(task.error || '任务失败'));
          } else {
            setTimeout(poll, 500);
          }
        } catch (err) {
          reject(err);
        }
      };
      poll();
    });
  }
}

// ==================== 使用示例 ====================

// 示例1: 放大 Canvas 导出的图片 (适合你的九宫格场景)
async function upscaleCanvasImage(canvas) {
  const client = new UpscaylClient('http://localhost:3001');
  
  // 从 Canvas 获取 base64
  const base64 = canvas.toDataURL('image/png');
  
  // 调用 AI 放大
  const result = await client.upscaleBase64(base64, {
    model: 'ultrasharp-4x',  // 使用超清晰模型
    scale: 4,
    format: 'png'
  });
  
  // 返回放大后的 base64 图片
  return result.data.image;
}

// 示例2: 九宫格拆分 + AI 放大完整流程
async function splitAndUpscale(originalImage, gridSize = 3) {
  const client = new UpscaylClient('http://localhost:3001');
  const results = [];
  
  // 创建 canvas 进行拆分
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  const pieceWidth = originalImage.width / gridSize;
  const pieceHeight = originalImage.height / gridSize;
  
  canvas.width = pieceWidth;
  canvas.height = pieceHeight;
  
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      // 绘制拆分的小块
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        originalImage,
        col * pieceWidth, row * pieceHeight,  // 源坐标
        pieceWidth, pieceHeight,              // 源尺寸
        0, 0,                                  // 目标坐标
        pieceWidth, pieceHeight               // 目标尺寸
      );
      
      // AI 放大
      const base64 = canvas.toDataURL('image/png');
      console.log(`正在放大第 ${row * gridSize + col + 1}/${gridSize * gridSize} 张...`);
      
      const result = await client.upscaleBase64(base64, {
        model: 'ultrasharp-4x',
        scale: 4,
        format: 'png'
      });
      
      results.push({
        row,
        col,
        image: result.data.image  // 放大后的 base64
      });
    }
  }
  
  return results;
}

// 示例3: 下载放大后的图片
function downloadBase64Image(base64, filename) {
  const link = document.createElement('a');
  link.href = base64;
  link.download = filename;
  link.click();
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { UpscaylClient, upscaleCanvasImage, splitAndUpscale, downloadBase64Image };
}
