/**
 * Upscayl API 简单测试脚本
 * 测试 Base64 图像放大功能
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// 创建一个简单的 1x1 红色 PNG 图片的 Base64
// 这是一个最小的有效 PNG 图片
const minimalPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

async function testAPI() {
  console.log('🧪 开始测试 Upscayl API...\n');
  
  // 1. 测试健康检查
  console.log('1️⃣ 测试健康检查 /api/health');
  try {
    const healthRes = await fetch('http://localhost:3001/api/health');
    const health = await healthRes.json();
    console.log('   ✅ 健康检查通过:', JSON.stringify(health, null, 2));
  } catch (e) {
    console.log('   ❌ 健康检查失败:', e.message);
    return;
  }
  
  // 2. 测试获取模型列表
  console.log('\n2️⃣ 测试获取模型列表 /api/models');
  try {
    const modelsRes = await fetch('http://localhost:3001/api/models');
    const models = await modelsRes.json();
    console.log('   ✅ 获取模型成功:', models.data.map(m => m.id).join(', '));
  } catch (e) {
    console.log('   ❌ 获取模型失败:', e.message);
  }
  
  // 3. 测试 Base64 图像放大
  console.log('\n3️⃣ 测试 Base64 图像放大 /api/upscale/base64');
  console.log('   ⏳ 正在放大 1x1 测试图片...');
  try {
    const upscaleRes = await fetch('http://localhost:3001/api/upscale/base64', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: minimalPngBase64,
        model: 'upscayl-lite-4x',
        scale: 4,
        format: 'png'
      })
    });
    const result = await upscaleRes.json();
    if (result.status === 'success') {
      console.log('   ✅ 图像放大成功!');
      console.log('   📊 输出图片大小:', result.data.size, 'bytes');
      console.log('   🖼️ Base64 预览 (前100字符):', result.data.image.substring(0, 100) + '...');
    } else {
      console.log('   ❌ 图像放大失败:', result.error);
    }
  } catch (e) {
    console.log('   ❌ 图像放大请求失败:', e.message);
  }
  
  console.log('\n✨ 测试完成!');
}

testAPI();
