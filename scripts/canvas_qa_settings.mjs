import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const appBaseUrl = (process.env.CANVAS_QA_BASE_URL || 'http://127.0.0.1:3000/canvas').replace(/\/canvas\/?$/, '');
const baseUrl = process.env.CANVAS_QA_SETTINGS_BASE_URL || `${appBaseUrl}/user`;
const outDirArg = process.argv.find(arg => arg.startsWith('--out-dir='));
const outDir = outDirArg
  ? path.resolve(outDirArg.replace('--out-dir=', ''))
  : path.resolve('artifacts', 'canvas-qa', 'settings');
await fs.mkdir(outDir, { recursive: true });
const customCacheDir = path.join(outDir, 'custom-cdn-cache');
await fs.rm(customCacheDir, { recursive: true, force: true }).catch(() => {});

const results = [];
const phase = 'settings';
const record = (name, ok, detail = '') => {
  results.push({ phase, name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, '01-settings-initial.png'), fullPage: true });
  record('打开设置页', page.url().includes('/user'), page.url());
  record('设置中心页面可见', await page.locator('[data-testid="settings-center-page"]').isVisible().catch(() => false));
  await page.locator('[data-testid="settings-cache-directory-input"]').waitFor({ timeout: 10000 });
  record('缓存目录设置可见', await page.locator('[data-testid="settings-cache-directory-input"]').isVisible().catch(() => false));

  await page.locator('[data-testid="settings-cache-directory-input"]').fill(customCacheDir);
  await page.locator('[data-testid="settings-cache-save-button"]').click();
  await page.waitForTimeout(600);
  const savedCacheDirectory = await page.locator('[data-testid="settings-cache-effective-directory"]').textContent().catch(() => '');
  record('可保存 CDN 缓存目录', typeof savedCacheDirectory === 'string' && savedCacheDirectory.includes(customCacheDir), savedCacheDirectory || '未读取到目录');

  await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(800);
  const persistedCacheDirectoryInput = await page.locator('[data-testid="settings-cache-directory-input"]').inputValue();
  const persistedCacheDirectory = await page.locator('[data-testid="settings-cache-effective-directory"]').textContent().catch(() => '');
  record('刷新后保留缓存目录输入', persistedCacheDirectoryInput === customCacheDir, persistedCacheDirectoryInput);
  record('刷新后保留缓存生效目录', typeof persistedCacheDirectory === 'string' && persistedCacheDirectory.includes(customCacheDir), persistedCacheDirectory || '未读取到目录');

  await fs.mkdir(customCacheDir, { recursive: true });
  await fs.writeFile(path.join(customCacheDir, 'qa-test.bin'), 'cache');
  await fs.writeFile(path.join(customCacheDir, 'qa-test.bin.meta'), JSON.stringify({ size: 5 }), 'utf8');
  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page.locator('[data-testid="settings-cache-clear-button"]').click();
  await page.waitForTimeout(800);
  const cacheFileExists = await fs.access(path.join(customCacheDir, 'qa-test.bin')).then(() => true).catch(() => false);
  const cacheMetaExists = await fs.access(path.join(customCacheDir, 'qa-test.bin.meta')).then(() => true).catch(() => false);
  record('可清空当前缓存目录', !cacheFileExists && !cacheMetaExists, cacheFileExists || cacheMetaExists ? '测试缓存文件仍存在' : '已删除测试缓存文件');

  await page.locator('[data-testid="settings-tab-api"]').click();
  await page.waitForTimeout(200);
  const initialUpscaleDefaultUrl = await page.locator('[data-testid="settings-upscale-effective-base-url"]').textContent().catch(() => '');
  await page.locator('[data-testid="settings-upscale-base-url-input"]').fill('http://127.0.0.1:3901');
  await page.locator('[data-testid="settings-upscale-save-button"]').click();
  await page.waitForTimeout(500);
  const savedUpscaleUrl = await page.locator('[data-testid="settings-upscale-effective-base-url"]').textContent().catch(() => '');
  record('可保存 Upscayl 服务地址', typeof savedUpscaleUrl === 'string' && savedUpscaleUrl.includes('http://127.0.0.1:3901'), savedUpscaleUrl || '未读取到地址');

  await page.locator('[data-testid="settings-api-base-url"]').fill('https://qa-settings.example.com');
  await page.locator('[data-testid="settings-api-key"]').fill('sk-qa-settings-demo');
  await page.locator('[data-testid="settings-save-button"]').click();
  await page.waitForTimeout(400);
  record('可保存 API 设置', await page.getByText('已保存', { exact: true }).isVisible().catch(() => false));

  await page.locator('[data-testid="settings-tab-defaults"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-testid="settings-image-model"]').selectOption('nano-banana-2');
  await page.locator('[data-testid="settings-video-model"]').selectOption('veo3.1-components');
  await page.locator('[data-testid="settings-video-enhance-prompt"]').click();
  await page.locator('[data-testid="settings-save-button"]').click();
  await page.waitForTimeout(500);

  await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(800);
  await page.locator('[data-testid="settings-tab-api"]').click();
  const persistedUpscaleUrlInput = await page.locator('[data-testid="settings-upscale-base-url-input"]').inputValue();
  const persistedUpscaleUrl = await page.locator('[data-testid="settings-upscale-effective-base-url"]').textContent().catch(() => '');
  const persistedBaseUrl = await page.locator('[data-testid="settings-api-base-url"]').inputValue();
  const persistedApiKey = await page.locator('[data-testid="settings-api-key"]').inputValue();
  record('刷新后保留 Upscayl 服务地址输入', persistedUpscaleUrlInput === 'http://127.0.0.1:3901', persistedUpscaleUrlInput);
  record('刷新后保留 Upscayl 生效地址', typeof persistedUpscaleUrl === 'string' && persistedUpscaleUrl.includes('http://127.0.0.1:3901'), persistedUpscaleUrl || '未读取到地址');
  record('刷新后保留 API Base URL', persistedBaseUrl === 'https://qa-settings.example.com', persistedBaseUrl);
  record('刷新后保留 API Key', persistedApiKey === 'sk-qa-settings-demo', persistedApiKey ? '已保留' : '为空');

  await page.locator('[data-testid="settings-tab-defaults"]').click();
  const persistedImageModel = await page.locator('[data-testid="settings-image-model"]').inputValue();
  const persistedVideoModel = await page.locator('[data-testid="settings-video-model"]').inputValue();
  record('刷新后保留图片默认模型', persistedImageModel === 'nano-banana-2', persistedImageModel);
  record('刷新后保留视频默认模型', persistedVideoModel === 'veo3.1-components', persistedVideoModel);

  await page.locator('[data-testid="settings-reset-button"]').click();
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(800);

  const resetCacheDirectoryInput = await page.locator('[data-testid="settings-cache-directory-input"]').inputValue();
  const resetCacheDirectory = await page.locator('[data-testid="settings-cache-effective-directory"]').textContent().catch(() => '');
  await page.locator('[data-testid="settings-tab-api"]').click();
  const resetUpscaleUrlInput = await page.locator('[data-testid="settings-upscale-base-url-input"]').inputValue();
  const resetUpscaleUrl = await page.locator('[data-testid="settings-upscale-effective-base-url"]').textContent().catch(() => '');
  record('恢复默认后清空自定义缓存目录输入', resetCacheDirectoryInput === '', resetCacheDirectoryInput || '空');
  record('恢复默认后切回默认缓存目录', typeof resetCacheDirectory === 'string' && !resetCacheDirectory.includes(customCacheDir), resetCacheDirectory || '未读取到目录');
  record('恢复默认后清空 Upscayl 服务地址输入', resetUpscaleUrlInput === '', resetUpscaleUrlInput || '空');
  record('恢复默认后切回默认 Upscayl 地址', typeof resetUpscaleUrl === 'string' && !!initialUpscaleDefaultUrl && resetUpscaleUrl.includes(initialUpscaleDefaultUrl.trim()), resetUpscaleUrl || '未读取到地址');

  const resetBaseUrl = await page.locator('[data-testid="settings-api-base-url"]').inputValue();
  const resetApiKey = await page.locator('[data-testid="settings-api-key"]').inputValue();
  record('恢复默认后清空 API Base URL', resetBaseUrl === '', resetBaseUrl || '空');
  record('恢复默认后清空 API Key', resetApiKey === '', resetApiKey || '空');

  await page.locator('[data-testid="settings-tab-defaults"]').click();
  const resetImageModel = await page.locator('[data-testid="settings-image-model"]').inputValue();
  const resetVideoModel = await page.locator('[data-testid="settings-video-model"]').inputValue();
  record('恢复默认后重置图片模型', resetImageModel === 'gemini-3.1-flash-image-preview', resetImageModel);
  record('恢复默认后重置视频模型', resetVideoModel === 'veo3.1', resetVideoModel);

  await page.screenshot({ path: path.join(outDir, '02-settings-final.png'), fullPage: true });
} catch (error) {
  record('设置自动化脚本执行', false, error instanceof Error ? error.message : String(error));
  await page.screenshot({ path: path.join(outDir, 'error.png'), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

const summaryPath = path.join(outDir, 'summary.json');
await fs.writeFile(summaryPath, JSON.stringify(results, null, 2), 'utf8');
const groupedSummary = {
  [phase]: {
    total: results.length,
    passed: results.filter(item => item.ok).length,
    failed: results.filter(item => !item.ok).length,
    items: results,
  },
};
const groupedSummaryPath = path.join(outDir, 'summary.grouped.json');
await fs.writeFile(groupedSummaryPath, JSON.stringify(groupedSummary, null, 2), 'utf8');
const failed = results.filter(item => !item.ok);
const relativeOutDir = path.relative(process.cwd(), outDir);
const markdownLines = [
  '# Settings QA Report',
  '',
  `- Artifacts: ${relativeOutDir}`,
  `- Total: ${results.length}`,
  `- Passed: ${results.length - failed.length}`,
  `- Failed: ${failed.length}`,
  '',
  '## Checks',
  '',
  ...results.map((item) => `- ${item.ok ? 'PASS' : 'FAIL'} [${item.phase}] ${item.name}${item.detail ? ` — ${item.detail}` : ''}`),
  '',
];
const markdownSummaryPath = path.join(outDir, 'summary.md');
await fs.writeFile(markdownSummaryPath, markdownLines.join('\n'), 'utf8');
console.log(`SUMMARY: ${results.length - failed.length}/${results.length} passed`);
console.log(`ARTIFACTS: ${relativeOutDir}`);
console.log(`REPORT: ${path.relative(process.cwd(), markdownSummaryPath)}`);
if (failed.length > 0) {
  failed.forEach((item) => {
    console.log(`- FAIL [${item.phase}] ${item.name}${item.detail ? ` :: ${item.detail}` : ''}`);
  });
  process.exitCode = 1;
}
