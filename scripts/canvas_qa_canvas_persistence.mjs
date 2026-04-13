import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.CANVAS_QA_PERSISTENCE_BASE_URL || (process.env.CANVAS_QA_BASE_URL || 'http://127.0.0.1:3000/canvas').replace(/\/canvas\/?$/, '');
const canvasUrl = `${baseUrl}/canvas`;
const projectsUrl = `${baseUrl}/projects`;
const outDirArg = process.argv.find(arg => arg.startsWith('--out-dir='));
const outDir = outDirArg
  ? path.resolve(outDirArg.replace('--out-dir=', ''))
  : path.resolve('artifacts', 'canvas-qa', 'persistence');
await fs.mkdir(outDir, { recursive: true });

const results = [];
const phase = 'canvas-persistence';
const QA_RESTORED_IMAGE_TASK_ID = 'qa-restored-image-task';
const QA_RESUBMITTED_IMAGE_TASK_ID = 'qa-resubmitted-image-task';
const QA_RESTORED_VIDEO_TASK_ID = 'qa-restored-video-task';
const QA_CHAT_RESTORED_IMAGE_TASK_ID = 'qa-chat-restored-image-task';
const QA_RESTORED_IMAGE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6xkAAAAASUVORK5CYII=';
const QA_RESTORED_VIDEO_URL = 'https://example.com/qa-restored-video.mp4';
const record = (name, ok, detail = '') => {
  results.push({ phase, name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
let restoreTaskPollCount = 0;
let restoredSubmissionRequestCount = 0;
let restoredSubmissionPollCount = 0;
let restoredVideoPollCount = 0;
let restoredChatImagePollCount = 0;

async function clickContextMenuItem(label) {
  const item = page.getByText(label, { exact: true }).last();
  await item.waitFor({ state: 'visible', timeout: 10000 });
  await item.click({ force: true, timeout: 10000 });
}

async function waitForSaveStatus(status, timeout = 15000) {
  await page.waitForFunction(
    (expected) => document.querySelector('[data-testid="canvas-save-status"]')?.getAttribute('data-status') === expected,
    status,
    { timeout },
  );
}

async function listCanvasElementIds() {
  return await page.locator('[data-element-id]').evaluateAll((nodes) => (
    nodes
      .map((node) => node.getAttribute('data-element-id') || '')
      .filter(Boolean)
  ));
}

async function openGeneratorFromAddMenu(labelPattern) {
  const existingIds = await listCanvasElementIds();
  const isVideoGenerator = String(labelPattern).includes('视频');
  const directGeneratorButton = isVideoGenerator
    ? page.locator('[title="视频生成器 (V)"]').first()
    : page.locator('[title="图像生成器 (A)"], [title="图片生成器 (A)"]').first();

  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(150);

  if (await directGeneratorButton.isVisible().catch(() => false)) {
    await directGeneratorButton.click({ force: true, timeout: 10000 });
  } else {
    const addUploadButton = page.locator('[title="添加与生成"], [title="添加 / 上传"]').first();
    if (await addUploadButton.isVisible().catch(() => false)) {
      await addUploadButton.click({ force: true, timeout: 10000 });
      await page.waitForTimeout(250);
    } else {
      await page.mouse.click(520, 320, { button: 'right' });
    }

    const generatorMenuItem = page.getByText(labelPattern).last();
    const menuItemVisible = await generatorMenuItem.isVisible().catch(() => false);
    if (menuItemVisible) {
      await generatorMenuItem.click({ force: true, timeout: 10000 });
    } else {
      await page.keyboard.press(isVideoGenerator ? 'v' : 'a').catch(() => {});
    }
  }

  return await page.waitForFunction(
    (knownIds) => {
      const nodes = Array.from(document.querySelectorAll('[data-element-id]'));
      const newId = nodes
        .map((node) => node.getAttribute('data-element-id') || '')
        .find((id) => id && !knownIds.includes(id));
      return newId || null;
    },
    existingIds,
    { timeout: 10000 },
  ).then((handle) => handle.jsonValue());
}

async function cleanupProject(title) {
  await page.goto(projectsUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  const searchInput = page.locator('[data-testid="projects-search-input"]');
  if (!await searchInput.isVisible().catch(() => false)) {
    return false;
  }

  await searchInput.fill(title);
  await page.waitForTimeout(400);
  const card = page.locator('[data-testid^="project-card-"]', { hasText: title }).first();
  if (!await card.isVisible().catch(() => false)) {
    return false;
  }

  await card.hover();
  await card.locator('[data-testid^="project-menu-button-"]').first().click({ force: true });
  await card.locator('[data-testid^="project-delete-"]').first().click({ force: true });
  await page.locator('[data-testid="projects-delete-confirm"]').click();
  await page.waitForTimeout(700);
  return await page.locator('[data-testid^="project-card-"]', { hasText: title }).count() === 0;
}

try {
  await page.route('**/api/generate-image', async (route) => {
    const request = route.request();
    const body = request.postDataJSON?.() || {};
    if (body?.prompt !== 'QA 提交中断图片任务') {
      await route.continue();
      return;
    }

    restoredSubmissionRequestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        taskId: QA_RESUBMITTED_IMAGE_TASK_ID,
        status: 'processing',
      }),
    });
  });

  await page.route('**/api/image-status?*', async (route) => {
    const url = new URL(route.request().url());
    const taskId = url.searchParams.get('taskId');
    if (taskId === QA_CHAT_RESTORED_IMAGE_TASK_ID) {
      restoredChatImagePollCount += 1;
      if (restoredChatImagePollCount === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'processing',
            progress: 66,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'completed',
          imageData: QA_RESTORED_IMAGE_DATA_URL,
        }),
      });
      return;
    }

    if (taskId === QA_RESTORED_IMAGE_TASK_ID) {
      restoreTaskPollCount += 1;
      if (restoreTaskPollCount === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'processing',
            progress: 42,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'completed',
          imageData: QA_RESTORED_IMAGE_DATA_URL,
        }),
      });
      return;
    }

    if (taskId === QA_RESUBMITTED_IMAGE_TASK_ID) {
      restoredSubmissionPollCount += 1;
      if (restoredSubmissionPollCount === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'processing',
            progress: 18,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'completed',
          imageData: QA_RESTORED_IMAGE_DATA_URL,
        }),
      });
      return;
    }

    await route.continue();
  });

  await page.route('**/api/video-status?*', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('taskId') !== QA_RESTORED_VIDEO_TASK_ID) {
      await route.continue();
      return;
    }

    restoredVideoPollCount += 1;
    if (restoredVideoPollCount === 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'processing',
          progress: 64,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'completed',
        videoUrl: QA_RESTORED_VIDEO_URL,
      }),
    });
  });

  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'log' && (
      text.includes('Auto-save')
      || text.includes('Starting save...')
      || text.includes('Incremental save:')
      || text.includes('Save successful!')
      || text.includes('[Viewport] Restored:')
      || text.includes('[HMR] connected')
    )) {
      return;
    }
    console.log(`[browser:${msg.type()}] ${text}`);
  });

  const baseTitle = `QA 持久化 ${Date.now()}`;
  const persistedTitle = `${baseTitle} 已保存`;

  await page.goto(canvasUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1600);
  record('打开画布页', page.url().includes('/canvas'), page.url());

  const titleInput = page.locator('[data-testid="canvas-title-input"]');
  const saveStatus = page.locator('[data-testid="canvas-save-status"]');
  const canvasArea = page.locator('[data-testid="canvas-area"]').first();

  record('标题输入可见', await titleInput.isVisible().catch(() => false));
  record('保存状态标记可见', await saveStatus.isVisible().catch(() => false));

  await titleInput.fill(baseTitle);
  await page.mouse.click(420, 320, { button: 'right' });
  await clickContextMenuItem('添加形状');
  await page.waitForTimeout(900);

  await page.waitForFunction(
    () => {
      const total = Number(document.querySelector('[data-testid="canvas-area"]')?.getAttribute('data-total-elements') || '0');
      return total >= 1;
    },
    { timeout: 10000 },
  );
  record('新增形状后画布元素计数更新', (await canvasArea.getAttribute('data-total-elements')) === '1', await canvasArea.getAttribute('data-total-elements') || '0');

  await page.waitForFunction(() => new URL(window.location.href).searchParams.has('id'), { timeout: 15000 });
  await waitForSaveStatus('saved', 15000);
  const createdUrl = new URL(page.url());
  const projectId = createdUrl.searchParams.get('id') || '';
  record('自动保存后生成项目 ID', Boolean(projectId), projectId || 'missing');

  await titleInput.fill(persistedTitle);
  await waitForSaveStatus('saved', 15000);
  record('标题修改后可回到已保存状态', true, persistedTitle);

  const generatorElementId = await openGeneratorFromAddMenu(/图像生成器|图片生成器/);
  await page.waitForTimeout(900);

  record('可插入图片生成器节点', Boolean(generatorElementId), generatorElementId || 'missing');

  const pendingGenerationSeeded = generatorElementId
    ? await page.evaluate(({ projectId: pid, elementId, taskId }) => {
        const raw = window.sessionStorage.getItem('lovart_active_generations');
        const parsed = raw ? JSON.parse(raw) : {};
        if (!parsed[pid]) parsed[pid] = {};
        parsed[pid][elementId] = {
          taskId,
          taskType: 'image',
          progress: 37,
          savedPrompt: 'QA 恢复中的图片任务',
        };
        window.sessionStorage.setItem('lovart_active_generations', JSON.stringify(parsed));
        return Boolean(parsed?.[pid]?.[elementId]);
      }, { projectId, elementId: generatorElementId, taskId: QA_RESTORED_IMAGE_TASK_ID })
    : false;
  record('未完成生成任务写入会话缓存', pendingGenerationSeeded, generatorElementId || 'missing');

  await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  await waitForSaveStatus('saved', 15000);

  const restoredGenerationVisible = generatorElementId ? restoreTaskPollCount >= 1 : false;
  record('刷新后恢复未完成图片任务', restoredGenerationVisible, `polls=${restoreTaskPollCount}`);

  if (generatorElementId) {
    await page.waitForFunction(
      ({ elementId, pid }) => {
        const node = document.querySelector(`[data-element-id="${elementId}"]`);
        const hasImage = Boolean(node?.querySelector('img'));
        const raw = window.sessionStorage.getItem('lovart_active_generations');
        const parsed = raw ? JSON.parse(raw) : {};
        return hasImage && !parsed?.[pid]?.[elementId];
      },
      { elementId: generatorElementId, pid: projectId },
      { timeout: 12000 },
    ).catch(() => {});
  }

  const restoredGenerationState = generatorElementId
    ? await page.evaluate(({ elementId, pid }) => {
        const node = document.querySelector(`[data-element-id="${elementId}"]`);
        const raw = window.sessionStorage.getItem('lovart_active_generations');
        const parsed = raw ? JSON.parse(raw) : {};
        return {
          hasImage: Boolean(node?.querySelector('img')),
          activeEntry: parsed?.[pid]?.[elementId] ?? null,
          text: node?.textContent?.trim() || '',
        };
      }, { elementId: generatorElementId, pid: projectId })
    : null;
  record(
    '恢复后的生成任务完成并清理状态',
    Boolean(restoredGenerationState?.hasImage && !restoredGenerationState?.activeEntry),
    JSON.stringify(restoredGenerationState),
  );

  await page.screenshot({ path: path.join(outDir, '02-generation-restored.png'), fullPage: true });

  const pendingSubmissionElementId = await openGeneratorFromAddMenu(/图像生成器|图片生成器/);
  await page.waitForTimeout(900);
  record('可插入待恢复图片生成器节点', Boolean(pendingSubmissionElementId), pendingSubmissionElementId || 'missing');

  const pendingSubmissionSeeded = pendingSubmissionElementId
    ? await page.evaluate(({ projectId: pid, elementId }) => {
        const raw = window.sessionStorage.getItem('lovart_pending_submissions');
        const parsed = raw ? JSON.parse(raw) : {};
        if (!parsed[pid]) parsed[pid] = {};
        parsed[pid][elementId] = {
          prompt: 'QA 提交中断图片任务',
          model: 'gpt-image-1',
          aspectRatio: '1:1',
          imageSize: '1024x1024',
          taskType: 'image',
          timestamp: Date.now(),
        };
        window.sessionStorage.setItem('lovart_pending_submissions', JSON.stringify(parsed));
        return Boolean(parsed?.[pid]?.[elementId]);
      }, { projectId, elementId: pendingSubmissionElementId })
    : false;
  record('图片待提交记录写入会话缓存', pendingSubmissionSeeded, pendingSubmissionElementId || 'missing');

  const submissionRequestCountBeforeReload = restoredSubmissionRequestCount;
  const submissionPollCountBeforeReload = restoredSubmissionPollCount;
  await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  await waitForSaveStatus('saved', 15000);

  const submissionRequestDelta = restoredSubmissionRequestCount - submissionRequestCountBeforeReload;
  record('刷新后自动重提图片任务', pendingSubmissionElementId ? submissionRequestDelta >= 1 : false, `requests=${submissionRequestDelta}, polls=${restoredSubmissionPollCount - submissionPollCountBeforeReload}`);

  if (pendingSubmissionElementId) {
    await page.waitForFunction(
      ({ elementId, pid }) => {
        const node = document.querySelector(`[data-element-id="${elementId}"]`);
        const rawSubmissions = window.sessionStorage.getItem('lovart_pending_submissions');
        const submissions = rawSubmissions ? JSON.parse(rawSubmissions) : {};
        const rawGenerations = window.sessionStorage.getItem('lovart_active_generations');
        const generations = rawGenerations ? JSON.parse(rawGenerations) : {};
        return Boolean(node?.querySelector('img'))
          && !submissions?.[pid]?.[elementId]
          && !generations?.[pid]?.[elementId];
      },
      { elementId: pendingSubmissionElementId, pid: projectId },
      { timeout: 15000 },
    ).catch(() => {});
  }

  const restoredSubmissionState = pendingSubmissionElementId
    ? await page.evaluate(({ elementId, pid }) => {
        const node = document.querySelector(`[data-element-id="${elementId}"]`);
        const rawSubmissions = window.sessionStorage.getItem('lovart_pending_submissions');
        const submissions = rawSubmissions ? JSON.parse(rawSubmissions) : {};
        const rawGenerations = window.sessionStorage.getItem('lovart_active_generations');
        const generations = rawGenerations ? JSON.parse(rawGenerations) : {};
        return {
          hasImage: Boolean(node?.querySelector('img')),
          submissionEntry: submissions?.[pid]?.[elementId] ?? null,
          activeEntry: generations?.[pid]?.[elementId] ?? null,
          text: node?.textContent?.trim() || '',
        };
      }, { elementId: pendingSubmissionElementId, pid: projectId })
    : null;
  record(
    '重提的图片任务完成并清理提交/生成状态',
    Boolean(restoredSubmissionState?.hasImage && !restoredSubmissionState?.submissionEntry && !restoredSubmissionState?.activeEntry),
    JSON.stringify(restoredSubmissionState),
  );

  await page.screenshot({ path: path.join(outDir, '03-resubmitted-image-restored.png'), fullPage: true });

  const videoGeneratorElementId = await openGeneratorFromAddMenu(/视频生成器/);
  await page.waitForTimeout(900);
  record('可插入视频生成器节点', Boolean(videoGeneratorElementId), videoGeneratorElementId || 'missing');

  const pendingVideoGenerationSeeded = videoGeneratorElementId
    ? await page.evaluate(({ projectId: pid, elementId, taskId }) => {
        const raw = window.sessionStorage.getItem('lovart_active_generations');
        const parsed = raw ? JSON.parse(raw) : {};
        if (!parsed[pid]) parsed[pid] = {};
        parsed[pid][elementId] = {
          taskId,
          taskType: 'video',
          progress: 61,
          savedPrompt: 'QA 恢复中的视频任务',
        };
        window.sessionStorage.setItem('lovart_active_generations', JSON.stringify(parsed));
        return Boolean(parsed?.[pid]?.[elementId]);
      }, { projectId, elementId: videoGeneratorElementId, taskId: QA_RESTORED_VIDEO_TASK_ID })
    : false;
  record('未完成视频任务写入会话缓存', pendingVideoGenerationSeeded, videoGeneratorElementId || 'missing');

  const videoPollCountBeforeReload = restoredVideoPollCount;
  await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  await waitForSaveStatus('saved', 15000);

  const restoredVideoVisible = videoGeneratorElementId ? (restoredVideoPollCount - videoPollCountBeforeReload) >= 1 : false;
  record('刷新后恢复未完成视频任务', restoredVideoVisible, `polls=${restoredVideoPollCount - videoPollCountBeforeReload}`);

  if (videoGeneratorElementId) {
    await page.waitForFunction(
      ({ elementId, pid }) => {
        const node = document.querySelector(`[data-element-id="${elementId}"]`);
        const raw = window.sessionStorage.getItem('lovart_active_generations');
        const parsed = raw ? JSON.parse(raw) : {};
        return Boolean(node?.textContent?.includes('双击播放')) && !parsed?.[pid]?.[elementId];
      },
      { elementId: videoGeneratorElementId, pid: projectId },
      { timeout: 15000 },
    ).catch(() => {});
  }

  const restoredVideoState = videoGeneratorElementId
    ? await page.evaluate(({ elementId, pid }) => {
        const node = document.querySelector(`[data-element-id="${elementId}"]`);
        const raw = window.sessionStorage.getItem('lovart_active_generations');
        const parsed = raw ? JSON.parse(raw) : {};
        return {
          hasVideoMarker: Boolean(node?.textContent?.includes('双击播放')),
          activeEntry: parsed?.[pid]?.[elementId] ?? null,
          text: node?.textContent?.trim() || '',
        };
      }, { elementId: videoGeneratorElementId, pid: projectId })
    : null;
  record(
    '恢复的视频任务完成并清理状态',
    Boolean(restoredVideoState?.hasVideoMarker && !restoredVideoState?.activeEntry),
    JSON.stringify(restoredVideoState),
  );

  await page.screenshot({ path: path.join(outDir, '04-video-generation-restored.png'), fullPage: true });

  await page.addInitScript(({ taskId }) => {
    if (window.sessionStorage.getItem('__qa_chat_restore_seeded__') === '1') {
      return;
    }

    const now = new Date().toISOString();
    window.sessionStorage.setItem('__qa_chat_restore_seeded__', '1');
    window.localStorage.setItem('lovart_active_chat', JSON.stringify({
      model: 'gemini-3.1-pro-preview',
      messages: [
        {
          id: 'qa-chat-processing',
          role: 'assistant',
          content: '🎨 图片生成中... 12%',
          timestamp: now,
          isStreaming: false,
          toolType: 'image-gen',
          taskId,
          taskStatus: 'processing',
          taskProgress: 12,
        },
        {
          id: 'qa-chat-pending-no-task',
          role: 'assistant',
          content: '🎨 正在提交图片生成任务...',
          timestamp: now,
          isStreaming: false,
          toolType: 'image-gen',
          taskStatus: 'pending',
          taskProgress: 0,
        },
      ],
    }));
  }, { taskId: QA_CHAT_RESTORED_IMAGE_TASK_ID });
  const chatRestoreSeeded = true;
  record('聊天活动会话写入恢复样本', chatRestoreSeeded);

  const chatPollCountBeforeReload = restoredChatImagePollCount;
  await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  await waitForSaveStatus('saved', 15000);

  const chatToggle = page.locator('[data-testid="canvas-chat-toggle"]').first();
  await chatToggle.click({ force: true });
  await page.waitForTimeout(500);

  await page.waitForFunction(
    () => {
      const raw = window.localStorage.getItem('lovart_active_chat');
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      const messages = Array.isArray(parsed?.messages) ? parsed.messages : [];
      const processing = messages.find((message) => message?.id === 'qa-chat-processing');
      const interrupted = messages.find((message) => message?.id === 'qa-chat-pending-no-task');
      return Boolean(
        processing?.taskStatus === 'completed'
        && processing?.generatedImage
        && interrupted?.taskStatus === 'failed'
        && interrupted?.taskError === '页面刷新前未拿到任务 ID，无法继续恢复。',
      );
    },
    { timeout: 15000 },
  ).catch(() => {});

  const restoredChatState = await page.evaluate(() => {
    const raw = window.localStorage.getItem('lovart_active_chat');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const messages = Array.isArray(parsed?.messages) ? parsed.messages : [];
    return {
      processing: messages.find((message) => message?.id === 'qa-chat-processing') ?? null,
      interrupted: messages.find((message) => message?.id === 'qa-chat-pending-no-task') ?? null,
    };
  });
  record(
    '刷新后聊天 processing 图片任务继续轮询',
    (restoredChatImagePollCount - chatPollCountBeforeReload) >= 1,
    `polls=${restoredChatImagePollCount - chatPollCountBeforeReload}`,
  );
  record(
    '聊天恢复会完成 processing 图片任务',
    Boolean(
      restoredChatState?.processing?.taskStatus === 'completed'
      && restoredChatState?.processing?.generatedImage === QA_RESTORED_IMAGE_DATA_URL,
    ),
    JSON.stringify(restoredChatState?.processing ?? null),
  );
  record(
    '聊天恢复会将无 taskId 的 pending 图片任务归一化为失败',
    Boolean(
      restoredChatState?.interrupted?.taskStatus === 'failed'
      && restoredChatState?.interrupted?.taskError === '页面刷新前未拿到任务 ID，无法继续恢复。'
      && typeof restoredChatState?.interrupted?.content === 'string'
      && restoredChatState.interrupted.content.includes('提交阶段中断'),
    ),
    JSON.stringify(restoredChatState?.interrupted ?? null),
  );

  await page.screenshot({ path: path.join(outDir, '05-chat-restore.png'), fullPage: true });

  const beforePanX = Number(await canvasArea.getAttribute('data-pan-x') || '0');
  const beforePanY = Number(await canvasArea.getAttribute('data-pan-y') || '0');
  const box = await canvasArea.boundingBox();
  if (!box) {
    throw new Error('未找到画布区域边界，无法验证视口移动');
  }

  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45);
  await page.mouse.wheel(180, 220);
  await page.waitForTimeout(500);

  const afterPanX = Number(await canvasArea.getAttribute('data-pan-x') || '0');
  const afterPanY = Number(await canvasArea.getAttribute('data-pan-y') || '0');
  const panChanged = Math.abs(afterPanX - beforePanX) >= 10 || Math.abs(afterPanY - beforePanY) >= 10;
  record('滚动画布后视口位置发生变化', panChanged, `${beforePanX},${beforePanY} -> ${afterPanX},${afterPanY}`);

  await page.waitForFunction(
    (pid) => {
      const raw = window.localStorage.getItem('lovart_viewport_state');
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Boolean(parsed?.[pid]) && Number.isFinite(parsed[pid].panX) && Number.isFinite(parsed[pid].panY);
    },
    projectId,
    { timeout: 5000 },
  );
  const storedViewport = await page.evaluate((pid) => {
    const raw = window.localStorage.getItem('lovart_viewport_state');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.[pid] || null;
  }, projectId);
  record('视口状态写入本地缓存', Boolean(storedViewport), JSON.stringify(storedViewport));

  await page.screenshot({ path: path.join(outDir, '06-before-reload.png'), fullPage: true });

  await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1800);
  await waitForSaveStatus('saved', 15000);

  const reloadedTitle = await titleInput.inputValue();
  const reloadedTotal = Number(await canvasArea.getAttribute('data-total-elements') || '0');
  const restoredPanX = Number(await canvasArea.getAttribute('data-pan-x') || '0');
  const restoredPanY = Number(await canvasArea.getAttribute('data-pan-y') || '0');
  const viewportRestored = storedViewport
    ? Math.abs(restoredPanX - Math.round(storedViewport.panX)) <= 2 && Math.abs(restoredPanY - Math.round(storedViewport.panY)) <= 2
    : false;

  record('刷新后标题仍然存在', reloadedTitle === persistedTitle, reloadedTitle);
  record('刷新后画布元素仍然存在', reloadedTotal >= 1, String(reloadedTotal));
  record('刷新后恢复上次视口位置', viewportRestored, `${restoredPanX},${restoredPanY}`);

  await page.screenshot({ path: path.join(outDir, '07-after-reload.png'), fullPage: true });

  const cleaned = await cleanupProject(persistedTitle);
  record('回收测试项目', cleaned, persistedTitle);
} catch (error) {
  record('画布持久化自动化脚本执行', false, error instanceof Error ? error.message : String(error));
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
  '# Canvas Persistence QA Report',
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
