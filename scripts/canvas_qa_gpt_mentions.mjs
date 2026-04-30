import { chromium } from 'playwright';

const baseUrlArg = process.argv.find((arg) => arg.startsWith('--base-url='));
const baseUrl = baseUrlArg
  ? baseUrlArg.replace('--base-url=', '')
  : process.env.CANVAS_QA_BASE_URL || 'http://127.0.0.1:3000/canvas';

const fixtureImageUpload = {
  name: 'qa-mention-fixture.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yF9kAAAAASUVORK5CYII=',
    'base64',
  ),
};

const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` - ${detail}` : ''}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForCanvasReady(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /添加与生成/ }).last().waitFor({ state: 'visible', timeout: 30000 });
}

async function openImageGenerator(page) {
  await page.getByRole('button', { name: /添加与生成/ }).last().click();
  await page.getByRole('button', { name: /图像生成器/ }).last().click();
  await page.getByRole('textbox', { name: '描述你想要生成的图片' }).waitFor({ state: 'visible', timeout: 15000 });
}

async function switchToGptImage2(page) {
  const modelButton = page.getByRole('button', {
    name: /gemini-3\.1-flash-image-preview|nano-banana-2|gpt-image-2|grok-4\.2-image|doubao-seedream-5-0-260128/,
  }).last();
  await modelButton.click();
  await page.locator('text=gpt-image-2').last().click();
  await page.getByRole('button', { name: /gpt-image-2/ }).last().waitFor({ state: 'visible', timeout: 10000 });
}

async function attachReferenceImage(page) {
  const input = page.locator('input[aria-label="上传参考图片"]').last();
  await input.setInputFiles(fixtureImageUpload);
  await page.locator('img[alt="参考图 1"]').first().waitFor({ state: 'attached', timeout: 15000 });
}

async function insertMentionPrompt(page) {
  const promptInput = page.getByRole('textbox', { name: '描述你想要生成的图片' }).last();
  await promptInput.fill('@');
  await page.getByText('可引用的参考图', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  await page.getByRole('button', { name: /@参考图1/ }).click();
  await promptInput.type(' 生成极简海报');
  return promptInput.inputValue();
}

async function runInterceptedCheck(page) {
  let capturedBody = null;
  await page.route('**/api/generate-image', async (route) => {
    const request = route.request();
    capturedBody = request.postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'completed',
        imageUrl: `data:${fixtureImageUpload.mimeType};base64,${fixtureImageUpload.buffer.toString('base64')}`,
        taskId: 'mock-gpt-mention-task',
      }),
    });
  });

  await page.getByRole('button', { name: '生成' }).last().click();
  await page.waitForFunction(() => document.body.innerText.includes('图片生成完成'), { timeout: 15000 });

  assert(capturedBody, '未捕获到 /api/generate-image 请求');
  assert(capturedBody.model === 'gpt-image-2', `模型不匹配: ${capturedBody.model}`);
  assert(typeof capturedBody.prompt === 'string' && capturedBody.prompt.includes('第1张参考图'), `prompt 未正确替换 @ token: ${capturedBody.prompt}`);
  assert(typeof capturedBody.prompt === 'string' && capturedBody.prompt.includes('生成极简海报'), `prompt 未保留补充文本: ${capturedBody.prompt}`);
  assert(Array.isArray(capturedBody.referenceImages) && capturedBody.referenceImages.length === 1, `referenceImages 数量异常: ${JSON.stringify(capturedBody.referenceImages)}`);
  assert(capturedBody.forceAsync === true, `forceAsync 未开启: ${JSON.stringify(capturedBody)}`);
  record('gpt-image-2 @参考图请求体替换正确', true, JSON.stringify({
    model: capturedBody.model,
    prompt: capturedBody.prompt,
    referenceImageCount: capturedBody.referenceImages.length,
  }));
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

try {
  await waitForCanvasReady(page);
  record('打开画布页', page.url().includes('/canvas'), page.url());

  await openImageGenerator(page);
  record('打开图片生成器', true);

  await switchToGptImage2(page);
  record('切换到 gpt-image-2', true);

  await attachReferenceImage(page);
  record('上传参考图', true);

  const promptValue = await insertMentionPrompt(page);
  assert(promptValue.includes('@参考图1'), `输入框未插入 @参考图1: ${promptValue}`);
  record('插入 @参考图 token', true, promptValue);

  await runInterceptedCheck(page);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  record('拦截式回归检查', false, message);
  process.exitCode = 1;
} finally {
  await browser.close();
}

if (process.exitCode && process.exitCode !== 0) {
  console.error('canvas_qa_gpt_mentions failed');
} else {
  console.log('canvas_qa_gpt_mentions completed (mocked)');
}