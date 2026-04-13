import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { createCanvasQaHelpers } from './canvas_qa_helpers.mjs';

const baseUrl = process.env.CANVAS_QA_BASE_URL || 'http://127.0.0.1:3000/canvas';
const outDirArg = process.argv.find(arg => arg.startsWith('--out-dir='));
const outDir = outDirArg
  ? path.resolve(outDirArg.replace('--out-dir=', ''))
  : path.resolve('artifacts', 'canvas-qa');
const FRAME_LAYER_TEXT = /画板|Frame/i;
const GROUP_LAYER_TEXT = /编组|Group/i;
await fs.mkdir(outDir, { recursive: true });
const createCrc32Table = () => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[index] = crc >>> 0;
  }
  return table;
};

const crc32Table = createCrc32Table();

const crc32 = (buffer) => {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) {
    crc = crc32Table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
};

const makePngChunk = (type, data) => {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
};

const createFixturePngBuffer = (width = 96, height = 72) => {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * stride;
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowOffset + 1 + x * 4;
      raw[offset] = 48 + Math.round((x / Math.max(1, width - 1)) * 180);
      raw[offset + 1] = 72 + Math.round((y / Math.max(1, height - 1)) * 120);
      raw[offset + 2] = 210 - Math.round((x / Math.max(1, width - 1)) * 90);
      raw[offset + 3] = 255;
    }
  }

  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', idat),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
};

const fixtureImageUpload = {
  name: 'qa-fixture.png',
  mimeType: 'image/png',
  buffer: createFixturePngBuffer(),
};
const fixtureImageDataUrl = `data:${fixtureImageUpload.mimeType};base64,${fixtureImageUpload.buffer.toString('base64')}`;
const allPhases = [
  'bootstrap',
  'layer-panel-dnd',
  'layer-multi-drag',
  'selection-toolbar',
  'multi-select',
  'media-library',
  'image-tools',
  'storyboard-export',
  'worker-ux',
  'media-chat',
  'layer-reorder',
  'canvas-frame-adoption',
  'benchmark-panel',
];
const phasesArg = process.argv.find(arg => arg.startsWith('--phases='));
const enabledPhases = new Set(
  phasesArg
    ? phasesArg.replace('--phases=', '').split(',').map(phase => phase.trim()).filter(Boolean)
    : allPhases,
);
enabledPhases.add('bootstrap');

const results = [];
let currentPhase = 'bootstrap';
const setPhase = (phase) => {
  currentPhase = phase;
};
const shouldRunPhase = (phase) => enabledPhases.has(phase);
const record = (name, ok, detail = '') => {
  results.push({ phase: currentPhase, name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` - ${detail}` : ''}`);
};

const layerRowHasChildCount = async (layerRow, expectedCount) => {
  const toggle = layerRow.locator('button[aria-label="收起图层分组"], button[aria-label="展开图层分组"]').first();
  if (!await toggle.isVisible().catch(() => false)) {
    return false;
  }
  if (typeof expectedCount !== 'number') {
    return true;
  }
  const countBadge = layerRow.locator('span').filter({ hasText: new RegExp(`^${expectedCount}$`) }).last();
  return await countBadge.isVisible().catch(() => false);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
let lastFastRefreshAt = 0;

try {
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[Fast Refresh]')) {
      lastFastRefreshAt = Date.now();
    }
    if (msg.type() === 'log' && (
      text.includes('Auto-save')
      || text.includes('Starting save...')
      || text.includes('Incremental save:')
      || text.includes('Save successful!')
      || text.includes('[HMR] connected')
    )) {
      return;
    }
    console.log(`[browser:${msg.type()}] ${text}`);
  });
  page.on('pageerror', error => {
    lastFastRefreshAt = Date.now();
    console.log(`[browser:pageerror] ${error.message}`);
  });

  const waitForAppStable = async (timeout = 10000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const canvasVisible = await page.locator('[data-testid="canvas-area"]').first().isVisible().catch(() => false);
      const quietFor = Date.now() - lastFastRefreshAt;
      if (canvasVisible && quietFor >= 800) {
        await page.waitForTimeout(120);
        return true;
      }
      await page.waitForTimeout(200);
    }
    return false;
  };

  const readProjectReferenceCount = async (projectId) => page.evaluate((currentProjectId) => {
    try {
      const raw = window.localStorage.getItem(`lovart_project_reference_library:${currentProjectId}`);
      const items = raw ? JSON.parse(raw) : [];
      return Array.isArray(items) ? items.length : 0;
    } catch {
      return 0;
    }
  }, projectId).catch(() => 0);

  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3500);
  await waitForAppStable();
  await page.screenshot({ path: path.join(outDir, '01-initial.png'), fullPage: true });
  record('打开画布页', page.url().includes('/canvas'), page.url());

  // Add first shape via context menu
  await page.mouse.click(320, 260, { button: 'right' });
  const layersPanel = page.locator('[data-testid="layers-panel"]');
  const {
    clickContextMenuItem,
    drawFrame,
    dispatchLayerMoveToParent,
    dispatchLayerReorder,
    dispatchCanvasMoveToFrame,
    dispatchFrameAutoLayout,
    previewLayerDropTargets,
  } = createCanvasQaHelpers(page, layersPanel);
  const ensureLayersPanelVisible = async () => {
    let visible = await layersPanel.isVisible().catch(() => false);
    if (!visible) {
      const openLayersButton = page.locator('[data-testid="canvas-layers-toggle"], [title="打开图层面板"], [title="关闭图层面板"]').first();
      if (await openLayersButton.isVisible().catch(() => false)) {
        await openLayersButton.click({ force: true });
        await page.waitForTimeout(500);
        visible = await layersPanel.isVisible().catch(() => false);
      }
    }

    if (visible) {
      await page.locator('[data-testid^="layer-row-"]').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    }

    return visible;
  };
  await clickContextMenuItem('添加形状');
  await page.waitForTimeout(600);
  record('空白处右键菜单可添加形状', true);

  const firstLayerRow = page.locator('[data-testid^="layer-row-"]').first();
  let layersVisible = await ensureLayersPanelVisible();
  record('右侧图层面板可见', layersVisible);
  record('图层面板显示新增元素', layersVisible && await firstLayerRow.isVisible().catch(() => false));
  record('图层面板显示历史摘要', await page.locator('[data-testid="layers-history-summary"]').isVisible().catch(() => false));
  record('图层面板显示历史时间线', await page.locator('[data-testid="layers-history-timeline"]').isVisible().catch(() => false));
  const canvasArea = page.locator('[data-testid="canvas-area"]').first();
  const renderMetrics = await canvasArea.evaluate((node) => ({
    visible: node.getAttribute('data-visible-elements'),
    total: node.getAttribute('data-total-elements'),
    culled: node.getAttribute('data-cull-count'),
    virtualized: node.getAttribute('data-virtualized-count'),
    deferred: node.getAttribute('data-deferred-count'),
    maxVisible: node.getAttribute('data-max-visible'),
    margin: node.getAttribute('data-viewport-margin'),
    partitions: node.getAttribute('data-partition-count'),
    tileSize: node.getAttribute('data-partition-tile-size'),
  }));
  record(
    '画布暴露性能调试指标',
    Boolean(renderMetrics.visible && renderMetrics.total && renderMetrics.maxVisible && renderMetrics.margin && renderMetrics.partitions && renderMetrics.tileSize),
    JSON.stringify(renderMetrics),
  );

  if (shouldRunPhase('layer-panel-dnd')) {
    setPhase('layer-panel-dnd');
    console.log('CHECKPOINT: before drawFrame');
    await drawFrame(700, 160, 930, 360);
    console.log('CHECKPOINT: after drawFrame');
    await page.waitForTimeout(700);
    console.log('CHECKPOINT: after frame wait');

    const shapeRows = page.locator('[data-testid^="layer-row-"]', { hasText: '矩形' });
    const frameRows = page.locator('[data-testid^="layer-row-"]', { hasText: FRAME_LAYER_TEXT });
    console.log('CHECKPOINT: before row counts');
    const shapeRowCount = await shapeRows.count();
    const frameRowCount = await frameRows.count();
    console.log(`CHECKPOINT: row counts shape=${shapeRowCount} frame=${frameRowCount}`);
    record('图层面板显示新增画板', frameRowCount > 0, String(frameRowCount));
    if (shapeRowCount === 0 || frameRowCount === 0) {
      throw new Error(`创建拖放验收所需图层失败：shape=${shapeRowCount}, frame=${frameRowCount}`);
    }

    const shapeRow = shapeRows.first();
    const frameRow = frameRows.first();
    console.log('CHECKPOINT: before row ids');
    const shapeRowId = (await shapeRow.getAttribute('data-testid'))?.replace('layer-row-', '') || '';
    const frameRowId = (await frameRow.getAttribute('data-testid'))?.replace('layer-row-', '') || '';
    console.log(`CHECKPOINT: row ids shape=${shapeRowId} frame=${frameRowId}`);
    const frameBody = page.locator(`[data-testid="frame-body-${frameRowId}"]`).first();
    const frameBodyBox = await frameBody.boundingBox().catch(() => null);
    let marqueeInsideFrameWorked = false;
    if (frameBodyBox) {
      await page.mouse.click(frameBodyBox.x + frameBodyBox.width + 36, frameBodyBox.y + 12).catch(() => {});
      await page.waitForTimeout(120);
      await page.mouse.move(frameBodyBox.x + 28, frameBodyBox.y + 28);
      await page.mouse.down();
      await page.mouse.move(frameBodyBox.x + 132, frameBodyBox.y + 110, { steps: 10 });
      await page.waitForTimeout(120);
      marqueeInsideFrameWorked = await page.locator('[data-testid="canvas-selection-box"]').isVisible().catch(() => false);
      await page.mouse.up();
      await page.waitForTimeout(180);
    }
    record('画板内部空白可拖拽框选', marqueeInsideFrameWorked);
    const dndPreview = await previewLayerDropTargets(shapeRowId, frameRowId);
    record('图层面板真实DnD可暴露入画板目标', dndPreview.parentVisible);
    record('图层面板真实DnD可暴露根层级目标', dndPreview.rootVisible);
    record('图层面板显示拖拽占位提示', dndPreview.hintVisible);
    console.log(`CHECKPOINT: before move into frame shape=${shapeRowId} frame=${frameRowId}`);
    await dispatchLayerMoveToParent(shapeRowId, frameRowId);
    console.log('CHECKPOINT: after move into frame action');
    await page.waitForTimeout(600);
    console.log('CHECKPOINT: before nested record');
    record('图层面板可拖入画板', await layerRowHasChildCount(frameRow, 1));

    console.log(`CHECKPOINT: before move to root shape=${shapeRowId}`);
    await dispatchLayerMoveToParent(shapeRowId, null);
    console.log('CHECKPOINT: after move to root action');
    await page.waitForTimeout(600);
    console.log('CHECKPOINT: before root record');
    record('图层面板可移回顶层', !(await layerRowHasChildCount(frameRow, 1)));
  }

  if (shouldRunPhase('layer-multi-drag')) {
    setPhase('layer-multi-drag');
    await page.mouse.click(520, 320, { button: 'right' });
    await clickContextMenuItem('添加形状');
    await page.waitForTimeout(700);

    const shapeRows = page.locator('[data-testid^="layer-row-"]', { hasText: '矩形' });
    const frameRows = page.locator('[data-testid^="layer-row-"]', { hasText: FRAME_LAYER_TEXT });
    const shapeRowCount = await shapeRows.count();
    const frameRow = frameRows.first();
    record('批量拖放前至少存在两个图层', shapeRowCount >= 2, String(shapeRowCount));

    if (shapeRowCount >= 2 && await frameRow.isVisible().catch(() => false)) {
      const firstShapeId = (await shapeRows.nth(0).getAttribute('data-testid'))?.replace('layer-row-', '') || '';
      const secondShapeId = (await shapeRows.nth(1).getAttribute('data-testid'))?.replace('layer-row-', '') || '';
      const frameRowId = (await frameRow.getAttribute('data-testid'))?.replace('layer-row-', '') || '';

      await dispatchLayerMoveToParent([firstShapeId, secondShapeId], frameRowId);
      await page.waitForTimeout(700);
      record('图层面板支持多选批量拖入画板', await layerRowHasChildCount(frameRow, 2));

      await dispatchLayerMoveToParent([firstShapeId, secondShapeId], null);
      await page.waitForTimeout(700);
      record('图层面板支持多选批量移回顶层', !(await layerRowHasChildCount(frameRow, 2)));
    }
  }

  if (shouldRunPhase('selection-toolbar')) {
    setPhase('selection-toolbar');
    const panelHideButton = firstLayerRow.getByRole('button', { name: '隐藏图层' });
    let layerPanelHideWorked = false;
    if (await panelHideButton.isVisible().catch(() => false)) {
      await panelHideButton.click();
      await page.waitForTimeout(500);
      layerPanelHideWorked = await page.getByText('显示隐藏元素').isVisible().catch(() => false);
    }
    record('图层面板可隐藏元素', layerPanelHideWorked);
    if (layerPanelHideWorked) {
      await page.getByText('显示隐藏元素').click();
      await page.waitForTimeout(500);
    }

    await page.mouse.click(345, 285);
    await page.waitForTimeout(400);
    const hideButton = page.locator('[title="隐藏元素"], [title="隐藏"]').first();
    const showHiddenButton = page.getByText('显示隐藏元素');
    let hideWorked = false;
    if (await hideButton.isVisible().catch(() => false)) {
      await hideButton.click();
      await page.waitForTimeout(500);
      hideWorked = await showHiddenButton.isVisible().catch(() => false);
    }
    if (!hideWorked) {
      await page.mouse.click(345, 285, { button: 'right' });
      await clickContextMenuItem('隐藏');
      await page.waitForTimeout(500);
      hideWorked = await showHiddenButton.isVisible().catch(() => false);
    }
    record('单选工具栏可隐藏元素', hideWorked);
    if (hideWorked) {
      await showHiddenButton.click();
      await page.waitForTimeout(500);
      record('隐藏元素可一键恢复', !(await showHiddenButton.isVisible().catch(() => false)));
    } else {
      record('隐藏元素可一键恢复', false, '未成功隐藏元素，无法继续恢复验证');
    }

    await page.mouse.click(345, 285);
    await page.waitForTimeout(300);
    const lockButton = page.locator('[title="锁定元素"], [title="锁定"]').first();
    let lockWorked = false;
    if (await lockButton.isVisible().catch(() => false)) {
      await lockButton.click();
      await page.waitForTimeout(400);
      lockWorked = await page.getByText('锁定', { exact: true }).first().isVisible().catch(() => false);
    }
    if (!lockWorked) {
      await page.mouse.click(345, 285, { button: 'right' });
      await clickContextMenuItem('锁定');
      await page.waitForTimeout(400);
      lockWorked = await page.getByText('锁定', { exact: true }).first().isVisible().catch(() => false);
    }
    record('单选工具栏可锁定元素', lockWorked);
    const boxBefore = await page.locator('[data-element-id]').first().boundingBox();
    await page.mouse.move(350, 290);
    await page.mouse.down();
    await page.mouse.move(450, 360, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const boxAfter = await page.locator('[data-element-id]').first().boundingBox();
    const lockedStayed = !!boxBefore && !!boxAfter && Math.abs(boxBefore.x - boxAfter.x) < 2 && Math.abs(boxBefore.y - boxAfter.y) < 2;
    record('锁定后不可拖拽', lockedStayed);
    if (await page.locator('[title="解锁元素"], [title="解锁"]').first().isVisible().catch(() => false)) {
      await page.locator('[title="解锁元素"], [title="解锁"]').first().click();
    } else {
      await page.mouse.click(345, 285, { button: 'right' });
      await clickContextMenuItem('解锁');
    }
    await page.waitForTimeout(300);
  }

  if (shouldRunPhase('multi-select')) {
    setPhase('multi-select');
    await page.mouse.click(620, 260, { button: 'right' });
    await clickContextMenuItem('添加形状');
    await page.waitForTimeout(600);
    await page.mouse.click(345, 285);
    await page.keyboard.down('Shift');
    await page.mouse.click(645, 285);
    await page.keyboard.up('Shift');
    await page.waitForTimeout(500);
    const multiToolbar = page.getByText('已选 2 个', { exact: false }).first();
    record('可进入多选状态', await multiToolbar.isVisible());
    record('多选工具栏显示组合按钮', await page.getByText('组合', { exact: true }).isVisible());
    record('图层面板显示批量操作', await page.getByText('批量操作', { exact: true }).isVisible().catch(() => false));

    let reselectionMarqueeWorked = false;
    await page.mouse.move(880, 220);
    await page.mouse.down();
    await page.mouse.move(1040, 360, { steps: 12 });
    await page.waitForTimeout(120);
    const reselectionBox = page.locator('[data-testid="canvas-selection-box"]');
    const reselectionBounds = await reselectionBox.boundingBox().catch(() => null);
    reselectionMarqueeWorked = !!reselectionBounds && reselectionBounds.width > 20 && reselectionBounds.height > 20;
    await page.mouse.up();
    await page.waitForTimeout(200);
    record('已选状态下可再次左键拖拽框选', reselectionMarqueeWorked);

    await page.mouse.click(345, 285);
    await page.keyboard.down('Shift');
    await page.mouse.click(645, 285);
    await page.keyboard.up('Shift');
    await page.waitForTimeout(300);

    await page.getByText('组合', { exact: true }).click();
    await page.waitForTimeout(800);
    const groupedLocator = page.locator('[data-testid^="layer-row-"]', { hasText: GROUP_LAYER_TEXT }).first();
    const groupCreated = await groupedLocator.isVisible().catch(() => false);
    record('多选工具栏可创建编组', groupCreated);
    let undoGroupWorked = false;
    let redoGroupWorked = false;
    if (groupCreated) {
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(500);
      undoGroupWorked = !(await groupedLocator.isVisible().catch(() => false));
      await page.keyboard.press('Control+Shift+z');
      await page.waitForTimeout(700);
      redoGroupWorked = await groupedLocator.isVisible().catch(() => false);
    }
    record('编组操作可一步撤销', undoGroupWorked);
    record('编组操作可一步重做', redoGroupWorked);
    const groupLayerRow = page.locator('[data-testid^="layer-row-"]', { hasText: GROUP_LAYER_TEXT }).first();
    const renameButton = groupLayerRow.locator('[data-testid^="layer-rename-"]').first();
    let renameWorked = false;
    if (await groupLayerRow.isVisible().catch(() => false)) {
      await groupLayerRow.hover();
    }
    if (await renameButton.isVisible().catch(() => false)) {
      await renameButton.click({ force: true });
      const renameInput = layersPanel.locator('[data-testid^="layer-name-input-"]').first();
      if (await renameInput.isVisible().catch(() => false)) {
        await renameInput.fill('测试编组');
        await renameInput.press('Enter');
        await page.mouse.click(1180, 140);
        await page.waitForTimeout(300);
        renameWorked = await page.locator('[data-testid^="layer-row-"]', { hasText: '测试编组' }).first().isVisible().catch(() => false);
      }
    }
    record('图层面板可重命名编组', renameWorked);

    const activeGroupRow = page.locator('[data-testid^="layer-row-"]', { hasText: renameWorked ? '测试编组' : GROUP_LAYER_TEXT }).first();
    const activeGroupRowId = (await activeGroupRow.getAttribute('data-testid'))?.replace('layer-row-', '') || '';
    if (await activeGroupRow.isVisible().catch(() => false)) {
      const activeGroupSelect = page.locator(`[data-testid="layer-select-${activeGroupRowId}"]`).first();
      const activeGroupLocate = activeGroupRow.getByRole('button', { name: '定位到画布' });
      if (await activeGroupSelect.isVisible().catch(() => false)) {
        await activeGroupSelect.click({ force: true });
        await page.waitForTimeout(300);
      }
      if (await activeGroupLocate.isVisible().catch(() => false)) {
        await activeGroupLocate.click({ force: true });
        await page.waitForTimeout(300);
      }
    }

    const frameBox = activeGroupRowId
      ? await page.locator(`[data-element-id="${activeGroupRowId}"]`).boundingBox().catch(() => null)
      : null;
    if (frameBox) {
      const contextPoints = [
        { x: frameBox.x + 8, y: frameBox.y + 8 },
        { x: frameBox.x + frameBox.width - 8, y: frameBox.y + 8 },
        { x: frameBox.x + 8, y: frameBox.y + frameBox.height - 8 },
      ];
      for (const point of contextPoints) {
        await page.mouse.click(point.x, point.y, { button: 'right' });
        await page.waitForTimeout(200);
        if (await page.getByText('解除编组', { exact: true }).isVisible().catch(() => false)) {
          break;
        }
        await page.keyboard.press('Escape').catch(() => {});
      }
    }
    const ungroupMenu = page.getByText('解除编组', { exact: true });
    const hasUngroupMenu = await ungroupMenu.isVisible().catch(() => false);
    record('编组右键菜单包含解除编组', hasUngroupMenu);
    if (hasUngroupMenu) {
      await ungroupMenu.click({ force: true });
    } else {
      const ungroupToolbarButton = page.getByText('解组', { exact: true });
      if (await ungroupToolbarButton.isVisible().catch(() => false)) {
        await ungroupToolbarButton.click();
      }
    }
    await page.waitForTimeout(600);
    record('可解除编组', activeGroupRowId ? !(await page.locator(`[data-testid="layer-row-${activeGroupRowId}"]`).isVisible().catch(() => false)) : false);
  }

  const needMediaSetup = shouldRunPhase('media-chat') || shouldRunPhase('image-tools') || shouldRunPhase('storyboard-export') || shouldRunPhase('worker-ux') || shouldRunPhase('layer-reorder') || shouldRunPhase('canvas-frame-adoption') || shouldRunPhase('frame-auto-layout');
  const getLayerTitles = async () => {
    const titles = await page.locator('[data-testid^="layer-row-"] [title="双击重命名"]').allTextContents();
    return titles.map((text) => text.trim()).filter(Boolean);
  };

  if (needMediaSetup) {
    setPhase('media-chat');
    const elementCards = page.locator('[data-element-id]');
    const countBeforeUpload = await elementCards.count();
    const fileInputs = page.locator('input[type="file"][accept="image/*"]');
    await fileInputs.first().setInputFiles(fixtureImageUpload);
    await page.waitForFunction(
      previousCount => document.querySelectorAll('[data-element-id]').length > previousCount,
      countBeforeUpload,
      { timeout: 10000 },
    );
    await page.waitForTimeout(1000);

    const imageLayerRow = page.locator('[data-testid^="layer-row-"]', { hasText: '图片' }).last();
    const imageLocateButton = imageLayerRow.getByRole('button', { name: '定位到画布' });
    if (await imageLocateButton.isVisible().catch(() => false)) {
      await imageLocateButton.click({ force: true });
      await page.waitForTimeout(600);
    }

    const importedLayerId = (await imageLayerRow.getAttribute('data-testid'))?.replace('layer-row-', '') || '';
    const importedCanvasElement = importedLayerId
      ? page.locator(`[data-element-id="${importedLayerId}"]`).first()
      : page.locator('[data-element-id]').last();
    const importedElementBox = await importedCanvasElement.boundingBox();
    if (!importedElementBox) {
      throw new Error('上传图片后未找到新增画布元素');
    }

    const importedCenterX = importedElementBox.x + importedElementBox.width / 2;
    const importedCenterY = importedElementBox.y + importedElementBox.height / 2;
    await page.mouse.click(importedCenterX, importedCenterY);
    await page.waitForTimeout(500);

    const openImageToolsMenu = async () => {
      const toolsButton = page.locator('[title="图片工具"]').first();
      await toolsButton.waitFor({ state: 'visible', timeout: 10000 });
      await toolsButton.click();
      await page.waitForTimeout(250);
    };

    if (shouldRunPhase('image-tools')) {
      setPhase('image-tools');
      await page.evaluate(() => {
        window.__OPENLOVART_DISABLE_IMAGE_WORKER__ = false;
        window.__OPENLOVART_LAST_IMAGE_WORKER_MODE__ = {};
      }).catch(() => {});
      const countBeforeCrop = await elementCards.count();
      await openImageToolsMenu();
      await page.getByText('裁剪图片', { exact: true }).last().click();
      const cropPanel = page.getByText('裁剪图片', { exact: true }).last();
      record('图片工具可打开裁剪面板', await cropPanel.isVisible().catch(() => false));
      await page.getByRole('button', { name: '开始裁剪' }).click();
      await page.waitForFunction(
        previousCount => document.querySelectorAll('[data-element-id]').length > previousCount,
        countBeforeCrop,
        { timeout: 15000 },
      ).catch(() => {});
      const countAfterCrop = await elementCards.count();
      record('裁剪工具可生成新图片', countAfterCrop > countBeforeCrop, `${countBeforeCrop} -> ${countAfterCrop}`);
      const cropWorkerMode = await page.evaluate(() => window.__OPENLOVART_LAST_IMAGE_WORKER_MODE__?.crop || null).catch(() => null);
      const cropWorkerError = await page.evaluate(() => window.__OPENLOVART_LAST_IMAGE_WORKER_ERROR__?.crop || null).catch(() => null);
      record('裁剪工具默认优先走 worker', cropWorkerMode === 'worker', cropWorkerMode === 'worker' ? String(cropWorkerMode) : `${String(cropWorkerMode)} | ${String(cropWorkerError)}`);

      const latestElement = page.locator('[data-element-id]').last();
      const latestBox = await latestElement.boundingBox().catch(() => null);
      if (latestBox) {
        await page.mouse.click(latestBox.x + latestBox.width / 2, latestBox.y + latestBox.height / 2);
        await page.waitForTimeout(400);
      }

      const countBeforeAnnotate = await elementCards.count();
      await openImageToolsMenu();
      await page.getByText('标注图片', { exact: true }).last().click();
      record('图片工具可打开标注面板', await page.getByText('标注图片', { exact: true }).last().isVisible().catch(() => false));
      await page.getByPlaceholder('例如：镜头 01 / 主视觉 / 重点说明').fill('QA 标注标题');
      await page.getByRole('button', { name: '生成标注图' }).click();
      await page.waitForFunction(
        previousCount => document.querySelectorAll('[data-element-id]').length > previousCount,
        countBeforeAnnotate,
        { timeout: 15000 },
      ).catch(() => {});
      const countAfterAnnotate = await elementCards.count();
      record('标注工具可生成新图片', countAfterAnnotate > countBeforeAnnotate, `${countBeforeAnnotate} -> ${countAfterAnnotate}`);
      const annotateWorkerMode = await page.evaluate(() => window.__OPENLOVART_LAST_IMAGE_WORKER_MODE__?.annotate || null).catch(() => null);
      record('标注工具默认优先走 worker', annotateWorkerMode === 'worker', String(annotateWorkerMode));

      if (latestBox) {
        await page.mouse.click(importedCenterX, importedCenterY);
        await page.waitForTimeout(300);
      }

      await page.evaluate(() => {
        window.__OPENLOVART_DISABLE_IMAGE_WORKER__ = true;
        window.__OPENLOVART_LAST_IMAGE_WORKER_MODE__ = {};
      }).catch(() => {});
      const countBeforeSplit = await elementCards.count();
      await openImageToolsMenu();
      await page.getByText('分镜切割', { exact: true }).last().click();
      record('图片工具可打开分镜切割面板', await page.getByText('分镜切割', { exact: true }).last().isVisible().catch(() => false));
      const splitNumberInputs = page.locator('input[type="number"]');
      await splitNumberInputs.nth(0).fill('1');
      await splitNumberInputs.nth(1).fill('2');
      await page.getByRole('button', { name: '开始切割' }).click();
      await page.waitForFunction(
        previousCount => document.querySelectorAll('[data-element-id]').length > previousCount,
        countBeforeSplit,
        { timeout: 15000 },
      ).catch(() => {});
      const countAfterSplit = await elementCards.count();
      record('分镜切割工具可生成新图片', countAfterSplit > countBeforeSplit, `${countBeforeSplit} -> ${countAfterSplit}`);
      const splitWorkerMode = await page.evaluate(() => window.__OPENLOVART_LAST_IMAGE_WORKER_MODE__?.split || null).catch(() => null);
      record('分镜切割可回退主线程处理', splitWorkerMode === 'fallback', String(splitWorkerMode));
      await page.evaluate(() => {
        window.__OPENLOVART_DISABLE_IMAGE_WORKER__ = false;
      }).catch(() => {});
    }

    if (shouldRunPhase('storyboard-export')) {
      setPhase('storyboard-export');
      await page.evaluate(() => {
        window.__OPENLOVART_LAST_IMAGE_WORKER_MODE__ = {
          ...(window.__OPENLOVART_LAST_IMAGE_WORKER_MODE__ || {}),
          export: undefined,
        };
      }).catch(() => {});
      await fileInputs.first().setInputFiles(fixtureImageUpload);
      await page.waitForFunction(
        previousCount => document.querySelectorAll('[data-element-id]').length > previousCount,
        await elementCards.count(),
        { timeout: 10000 },
      ).catch(() => {});
      await page.waitForTimeout(800);

      const imageRows = page.locator('[data-testid^="layer-row-"]', { hasText: '图片' });
      const imageRowCount = await imageRows.count();
      let exportVisible = false;
      if (imageRowCount >= 2) {
        const canvasElements = page.locator('[data-element-id]');
        const canvasCount = await canvasElements.count();
        const firstBox = await canvasElements.nth(Math.max(0, canvasCount - 2)).boundingBox().catch(() => null);
        const secondBox = await canvasElements.nth(Math.max(0, canvasCount - 1)).boundingBox().catch(() => null);

        if (firstBox && secondBox) {
          await page.mouse.click(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
          await page.keyboard.down('Shift');
          await page.mouse.click(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2);
          await page.keyboard.up('Shift');
        }
        await page.waitForTimeout(500);
        const exportButton = page.locator('[title="导出分镜表"]').first();
        exportVisible = await exportButton.isVisible().catch(() => false);
        record('多选图片后显示分镜表导出入口', exportVisible);
        if (exportVisible) {
          await exportButton.click();
          await page.waitForTimeout(400);
          record('可打开分镜表导出面板', await page.getByText('分镜表合成导出', { exact: true }).isVisible().catch(() => false));
          const submitButton = page.getByRole('button', { name: '导出分镜表' }).last();
          if (await submitButton.isVisible().catch(() => false)) {
            await submitButton.click();
            await page.waitForTimeout(1200);
          }
          const exportWorkerMode = await page.evaluate(() => window.__OPENLOVART_LAST_IMAGE_WORKER_MODE__?.export || null).catch(() => null);
          record('分镜表导出默认优先走 worker', exportWorkerMode === 'worker', String(exportWorkerMode));
          await page.getByRole('button', { name: '取消' }).click().catch(() => {});
        }
      } else {
        record('多选图片后显示分镜表导出入口', false, `图片图层数量不足：${imageRowCount}`);
      }
    }

    if (shouldRunPhase('worker-ux')) {
      setPhase('worker-ux');
      await page.evaluate(() => {
        window.__OPENLOVART_DISABLE_IMAGE_WORKER__ = false;
        window.__OPENLOVART_IMAGE_WORKER_DEBUG_DELAY_MS__ = 1500;
        window.__OPENLOVART_LAST_IMAGE_WORKER_MODE__ = {};
      }).catch(() => {});

      const cropStartCount = await elementCards.count();
      await page.mouse.click(importedCenterX, importedCenterY);
      await page.waitForTimeout(250);
      await openImageToolsMenu();
      await page.getByText('裁剪图片', { exact: true }).last().click();
      await page.getByRole('button', { name: '开始裁剪' }).click();
      const cropStatusVisible = await page.getByText(/正在(读取原图|后台裁剪图片|写入画布素材|计算展示尺寸)/).first().isVisible().catch(() => false);
      record('裁剪任务提交后显示阶段进度', cropStatusVisible);
      const cropCancelVisible = await page.getByRole('button', { name: '取消任务' }).first().isVisible().catch(() => false);
      record('裁剪任务提交后可取消', cropCancelVisible);
      if (cropCancelVisible) {
        await page.getByRole('button', { name: '取消任务' }).first().click();
        await page.waitForTimeout(1800);
      }
      const cropEndCount = await elementCards.count();
      record('取消裁剪任务后不生成新图片', cropEndCount === cropStartCount, `${cropStartCount} -> ${cropEndCount}`);

      await fileInputs.first().setInputFiles(fixtureImageUpload);
      await page.waitForFunction(
        previousCount => document.querySelectorAll('[data-element-id]').length > previousCount,
        await elementCards.count(),
        { timeout: 10000 },
      ).catch(() => {});
      await page.waitForTimeout(500);

      const cancelCanvasElements = page.locator('[data-element-id]');
      const cancelCanvasCount = await cancelCanvasElements.count();
      const cancelFirstBox = await cancelCanvasElements.nth(Math.max(0, cancelCanvasCount - 2)).boundingBox().catch(() => null);
      const cancelSecondBox = await cancelCanvasElements.nth(Math.max(0, cancelCanvasCount - 1)).boundingBox().catch(() => null);
      if (cancelFirstBox && cancelSecondBox) {
        await page.mouse.click(cancelFirstBox.x + cancelFirstBox.width / 2, cancelFirstBox.y + cancelFirstBox.height / 2);
        await page.keyboard.down('Shift');
        await page.mouse.click(cancelSecondBox.x + cancelSecondBox.width / 2, cancelSecondBox.y + cancelSecondBox.height / 2);
        await page.keyboard.up('Shift');
        await page.waitForTimeout(300);
      }

      const exportButton = page.locator('[title="导出分镜表"]').first();
      if (await exportButton.isVisible().catch(() => false)) {
        await exportButton.click();
        await page.waitForTimeout(300);
        const exportSubmitButton = page.getByRole('button', { name: '导出分镜表' }).last();
        if (await exportSubmitButton.isVisible().catch(() => false)) {
          await exportSubmitButton.click();
          const exportStatusVisible = await page.getByText(/正在(收集导出图片|后台合成分镜表|保存导出文件)/).first().isVisible().catch(() => false);
          record('分镜导出提交后显示阶段进度', exportStatusVisible);
          const exportCancelVisible = await page.getByRole('button', { name: '取消任务' }).first().isVisible().catch(() => false);
          record('分镜导出提交后可取消', exportCancelVisible);
          if (exportCancelVisible) {
            await page.getByRole('button', { name: '取消任务' }).first().click();
            await page.waitForTimeout(1800);
          }
          const exportSubmitVisibleAgain = await page.getByRole('button', { name: '导出分镜表' }).last().isVisible().catch(() => false);
          record('取消分镜导出后面板恢复可再次提交', exportSubmitVisibleAgain);
        }
        await page.getByRole('button', { name: '取消' }).click().catch(() => {});
      } else {
        record('分镜导出提交后显示阶段进度', false, '未显示导出入口');
        record('分镜导出提交后可取消', false, '未显示导出入口');
        record('取消分镜导出后面板恢复可再次提交', false, '未显示导出入口');
      }

      await page.evaluate(() => {
        window.__OPENLOVART_IMAGE_WORKER_DEBUG_DELAY_MS__ = 0;
      }).catch(() => {});
    }

    if (shouldRunPhase('media-chat')) {
      const sendButton = page.locator('[title="发送至对话"]');
      record('图片单选工具栏显示发送至对话', await sendButton.isVisible().catch(() => false));

      await page.mouse.click(importedCenterX, importedCenterY, { button: 'right' });
      record('图片右键菜单含发送至对话', await page.getByText('发送至对话', { exact: true }).isVisible().catch(() => false));

      if (await sendButton.isVisible().catch(() => false)) {
        await sendButton.click();
        await page.waitForTimeout(1200);
        const chatTextarea = page.locator('textarea').last();
        record('发送至对话后聊天面板可见', await chatTextarea.isVisible().catch(() => false));
      }

      const currentImageLayerId = (await imageLayerRow.getAttribute('data-testid'))?.replace('layer-row-', '') || '';
      let selectedImageKeepsNaturalStacking = false;
      if (currentImageLayerId) {
        const currentImageCanvasElement = page.locator(`[data-element-id="${currentImageLayerId}"]`).first();
        const className = await currentImageCanvasElement.evaluate((node) => node.className);
        selectedImageKeepsNaturalStacking = !String(className).includes('z-10');
      }
      record('选中图片不再强制提升层级', selectedImageKeepsNaturalStacking);

      let nonBase64SvgRendered = false;
      let nonBase64SvgSendToChatWorked = false;
      if (currentImageLayerId) {
        const qaSvgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="240" height="180" viewBox="0 0 240 180">
            <rect width="240" height="180" rx="24" fill="#4f46e5" />
            <circle cx="70" cy="72" r="28" fill="#c4b5fd" />
            <path d="M36 144L98 92L138 122L188 74L224 144Z" fill="#e0e7ff" />
            <text x="120" y="42" text-anchor="middle" font-size="20" font-family="Arial, sans-serif" fill="#ffffff">QA SVG</text>
          </svg>
        `)}`;

        await page.waitForFunction(() => new URL(window.location.href).searchParams.has('id'), { timeout: 15000 });
        const currentProjectId = await page.evaluate(() => new URL(window.location.href).searchParams.get('id'));

        if (currentProjectId) {
          const seededSvgDataUrl = await page.evaluate(async ({ projectId, elementId, dataUrl }) => {
            const openDb = () => new Promise((resolve, reject) => {
              const request = window.indexedDB.open('lovart_local_db', 2);
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error || new Error('open db failed'));
            });

            const db = await openDb();
            const tx = db.transaction('elements', 'readwrite');
            const store = tx.objectStore('elements');
            const key = `${projectId}::${elementId}`;

            const row = await new Promise((resolve, reject) => {
              const request = store.get(key);
              request.onsuccess = () => resolve(request.result || null);
              request.onerror = () => reject(request.error || new Error('load element failed'));
            });

            if (!row || !row.element_data) {
              db.close();
              return false;
            }

            row.element_data = {
              ...row.element_data,
              content: dataUrl,
            };
            store.put(row);

            await new Promise((resolve, reject) => {
              tx.oncomplete = () => resolve(true);
              tx.onerror = () => reject(tx.error || new Error('save element failed'));
              tx.onabort = () => reject(tx.error || new Error('save element aborted'));
            });

            db.close();
            return true;
          }, { projectId: currentProjectId, elementId: currentImageLayerId, dataUrl: qaSvgDataUrl }).catch(() => false);

          if (seededSvgDataUrl) {
            await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
            await page.waitForTimeout(1200);

            const reloadedImageElement = page.locator(`[data-element-id="${currentImageLayerId}"]`).first();
            const reloadedImageTag = reloadedImageElement.locator('img').first();
            nonBase64SvgRendered = await reloadedImageTag.isVisible().catch(() => false);

            if (nonBase64SvgRendered) {
              const svgElementBox = await reloadedImageElement.boundingBox();
              if (svgElementBox) {
                await page.mouse.click(svgElementBox.x + svgElementBox.width / 2, svgElementBox.y + svgElementBox.height / 2);
                await page.waitForTimeout(500);
                const svgSendButton = page.locator('[title="发送至对话"]');
                if (await svgSendButton.isVisible().catch(() => false)) {
                  await svgSendButton.click();
                  await page.waitForTimeout(800);
                  nonBase64SvgSendToChatWorked = await page.locator('textarea').last().isVisible().catch(() => false);
                }
              }
            }
          }
        }
      }

      record('非base64 SVG data URL 刷新后仍可渲染', nonBase64SvgRendered);
      record('非base64 SVG 图片仍可发送至对话', nonBase64SvgSendToChatWorked);
    }

    if (shouldRunPhase('media-library')) {
      setPhase('media-library');
      await page.waitForFunction(() => new URL(window.location.href).searchParams.has('id'), { timeout: 15000 }).catch(() => {});
      const currentProjectId = await page.evaluate(() => new URL(window.location.href).searchParams.get('id'));
      if (!currentProjectId) {
        record('可读取当前项目 ID 以准备媒体库验收', false, '缺少项目 ID');
      } else {
        const referenceCountBeforeSave = await page.evaluate((projectId) => {
          try {
            const raw = window.localStorage.getItem(`lovart_project_reference_library:${projectId}`);
            const items = raw ? JSON.parse(raw) : [];
            return Array.isArray(items) ? items.length : 0;
          } catch {
            return 0;
          }
        }, currentProjectId).catch(() => 0);

        const saveCurrentReferenceButton = page.getByRole('button', { name: '加入参考库' }).first();
        if (await saveCurrentReferenceButton.isVisible().catch(() => false)) {
          await saveCurrentReferenceButton.click({ force: true });
          await page.waitForTimeout(300);
        }

        const referenceCountAfterSave = await page.evaluate((projectId) => {
          try {
            const raw = window.localStorage.getItem(`lovart_project_reference_library:${projectId}`);
            const items = raw ? JSON.parse(raw) : [];
            return Array.isArray(items) ? items.length : 0;
          } catch {
            return 0;
          }
        }, currentProjectId).catch(() => 0);

        record('画布图片可直接加入项目参考库', referenceCountAfterSave > referenceCountBeforeSave, `${referenceCountBeforeSave} -> ${referenceCountAfterSave}`);

        const qaReferenceImageDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="240" height="180" viewBox="0 0 240 180">
            <rect width="240" height="180" rx="24" fill="#0f766e" />
            <circle cx="76" cy="70" r="30" fill="#99f6e4" />
            <path d="M28 142L92 88L132 118L182 78L220 142Z" fill="#ccfbf1" />
            <text x="120" y="44" text-anchor="middle" font-size="18" font-family="Arial, sans-serif" fill="#ffffff">QA REF 2</text>
          </svg>
        `)}`;

        await page.evaluate(({ projectId, imageDataUrl, secondaryImageDataUrl }) => {
          const mediaKey = `lovart_project_media_history:${projectId}`;
          const mediaEvent = `lovart:project-media-history:${projectId}`;
          const referenceKey = `lovart_project_reference_library:${projectId}`;
          const referenceEvent = `lovart:project-reference-library:${projectId}`;
          const now = Date.now();

          window.localStorage.setItem(mediaKey, JSON.stringify([
            {
              id: 'qa-media-image',
              projectId,
              kind: 'image',
              content: imageDataUrl,
              prompt: 'QA 媒体历史图片',
              model: 'gemini-3.1-flash-image-preview',
              aspectRatio: '16:9',
              imageSize: '2K',
              createdAt: now,
            },
          ]));

          window.localStorage.setItem(referenceKey, JSON.stringify([
            {
              id: 'qa-reference-image',
              projectId,
              image: imageDataUrl,
              label: 'QA 项目参考',
              prompt: 'QA 项目参考提示词',
              createdAt: now,
              lastUsedAt: now,
            },
            {
              id: 'qa-reference-image-2',
              projectId,
              image: secondaryImageDataUrl,
              label: 'QA 项目参考二号',
              prompt: 'QA 第二张项目参考提示词',
              createdAt: now - 1000,
              lastUsedAt: now - 1000,
            },
          ]));

          window.dispatchEvent(new CustomEvent(mediaEvent));
          window.dispatchEvent(new CustomEvent(referenceEvent));
        }, { projectId: currentProjectId, imageDataUrl: fixtureImageDataUrl, secondaryImageDataUrl: qaReferenceImageDataUrl });

        const mediaToggle = page.locator('[data-testid="canvas-media-toggle"]').first();
        await mediaToggle.click({ force: true });
        await page.waitForTimeout(500);
        const mediaPanel = page.getByText('媒体历史', { exact: true }).last();
        record('媒体历史面板可打开', await mediaPanel.isVisible().catch(() => false));
        record('媒体历史可显示项目图片结果', await page.getByText('QA 媒体历史图片', { exact: false }).isVisible().catch(() => false));

        const referenceToggle = page.locator('[data-testid="canvas-reference-toggle"]').first();
        if (await referenceToggle.isVisible().catch(() => false)) {
          await referenceToggle.click({ force: true });
          await page.waitForTimeout(500);
        }
        record('项目参考库面板可打开', await page.getByText('项目参考库', { exact: true }).last().isVisible().catch(() => false));
        record('项目参考库面板显示项目参考图', await page.getByText('QA 项目参考', { exact: false }).last().isVisible().catch(() => false));
        record('项目参考库面板显示第二张项目参考图', await page.getByText('QA 项目参考二号', { exact: false }).last().isVisible().catch(() => false));

        const selectAllButton = page.locator('[data-testid="project-reference-select-all"]:visible').first();
        if (await selectAllButton.isVisible().catch(() => false)) {
          await selectAllButton.click({ force: true });
          await page.waitForTimeout(250);
        }
        record('项目参考库面板支持多选参考图', await page.getByText('已选 2', { exact: false }).isVisible().catch(() => false));

        const canvasElementCountBeforeBatchInsert = await page.locator('[data-element-id]').count();
        const batchInsertButton = page.getByRole('button', { name: '批量回流' }).last();
        if (await batchInsertButton.isVisible().catch(() => false)) {
          await batchInsertButton.click({ force: true });
          await page.waitForTimeout(500);
        }
        const canvasElementCountAfterBatchInsert = await page.locator('[data-element-id]').count();
        record('项目参考图支持批量回流画布', canvasElementCountAfterBatchInsert >= canvasElementCountBeforeBatchInsert + 2, `${canvasElementCountBeforeBatchInsert} -> ${canvasElementCountAfterBatchInsert}`);

        await page.evaluate((projectId) => {
          const referenceKey = `lovart_project_reference_library:${projectId}`;
          const referenceEvent = `lovart:project-reference-library:${projectId}`;
          window.localStorage.setItem(referenceKey, JSON.stringify([]));
          window.dispatchEvent(new CustomEvent(referenceEvent));
        }, currentProjectId);
        await page.waitForTimeout(300);

        if (await referenceToggle.isVisible().catch(() => false)) {
          await referenceToggle.click({ force: true });
          await page.waitForTimeout(250);
        }

        const batchSaveReferenceButton = page.locator('[data-testid="canvas-multi-save-reference"]').first();
        const batchSaveVisible = await batchSaveReferenceButton.isVisible().catch(() => false);
        record('多选图片后显示批量入参考库入口', batchSaveVisible);

        const referenceCountBeforeBatchSave = await readProjectReferenceCount(currentProjectId);

        if (batchSaveVisible) {
          await batchSaveReferenceButton.click({ force: true });
          await page.waitForTimeout(400);
        }

        const referenceCountAfterBatchSave = await readProjectReferenceCount(currentProjectId);

        record('多选图片可批量加入项目参考库', referenceCountAfterBatchSave > referenceCountBeforeBatchSave, `${referenceCountBeforeBatchSave} -> ${referenceCountAfterBatchSave}`);

        if (await referenceToggle.isVisible().catch(() => false)) {
          await referenceToggle.click({ force: true });
          await page.waitForTimeout(400);
        }

        const canvasElementCountBeforeReferenceInsert = await page.locator('[data-element-id]').count();
        const insertReferenceButton = page.getByRole('button', { name: '回流画布' }).last();
        if (await insertReferenceButton.isVisible().catch(() => false)) {
          await insertReferenceButton.click({ force: true });
          await page.waitForTimeout(500);
        }
        const canvasElementCountAfterReferenceInsert = await page.locator('[data-element-id]').count();
        record('项目参考图可从面板回流画布', canvasElementCountAfterReferenceInsert > canvasElementCountBeforeReferenceInsert, `${canvasElementCountBeforeReferenceInsert} -> ${canvasElementCountAfterReferenceInsert}`);

        if (await referenceToggle.isVisible().catch(() => false)) {
          await referenceToggle.click({ force: true });
          await page.waitForTimeout(250);
        }

        const addReferenceButton = page.getByRole('button', { name: '加入参考库' }).first();
        const referenceCountBeforeAdd = await readProjectReferenceCount(currentProjectId);
        if (await addReferenceButton.isVisible().catch(() => false)) {
          await addReferenceButton.click({ force: true });
          await Promise.race([
            page.waitForFunction(
              ({ projectId, previousCount }) => {
                try {
                  const raw = window.localStorage.getItem(`lovart_project_reference_library:${projectId}`);
                  const items = raw ? JSON.parse(raw) : [];
                  return Array.isArray(items) && items.length > previousCount;
                } catch {
                  return false;
                }
              },
              { projectId: currentProjectId, previousCount: referenceCountBeforeAdd },
              { timeout: 2500 },
            ).catch(() => null),
            page.getByText('已入项目参考库', { exact: false }).first().waitFor({ state: 'visible', timeout: 2500 }).catch(() => null),
          ]);
          await waitForAppStable(6000);
        }
        const referenceCountAfterAdd = await readProjectReferenceCount(currentProjectId);
        const addedReferenceVisible = await page.getByText('已入项目参考库', { exact: false }).first().isVisible().catch(() => false);
        record('媒体历史图片可加入项目参考库', referenceCountAfterAdd > referenceCountBeforeAdd || addedReferenceVisible, `${referenceCountBeforeAdd} -> ${referenceCountAfterAdd}`);

        await page.evaluate(({ projectId, secondaryImageDataUrl }) => {
          const referenceKey = `lovart_project_reference_library:${projectId}`;
          const referenceEvent = `lovart:project-reference-library:${projectId}`;
          const now = Date.now();
          const raw = window.localStorage.getItem(referenceKey);
          const items = raw ? JSON.parse(raw) : [];
          const normalized = Array.isArray(items) ? items : [];
          const nextItems = normalized.some((item) => item?.id === 'qa-reference-image-2')
            ? normalized.map((item) => item?.id === 'qa-reference-image-2'
              ? {
                  ...item,
                  projectId,
                  image: secondaryImageDataUrl,
                  label: 'QA 项目参考二号',
                  prompt: 'QA 第二张项目参考提示词',
                  lastUsedAt: now,
                }
              : item)
            : [{
                id: 'qa-reference-image-2',
                projectId,
                image: secondaryImageDataUrl,
                label: 'QA 项目参考二号',
                prompt: 'QA 第二张项目参考提示词',
                createdAt: now,
                lastUsedAt: now,
              }, ...normalized];
          window.localStorage.setItem(referenceKey, JSON.stringify(nextItems));
          window.dispatchEvent(new CustomEvent(referenceEvent));
        }, { projectId: currentProjectId, secondaryImageDataUrl: qaReferenceImageDataUrl });
        await page.waitForTimeout(250);

        const importedLayerRowForMedia = importedLayerId
          ? page.locator(`[data-testid="layer-row-${importedLayerId}"]`).first()
          : null;
        const importedLocateButtonForMedia = importedLayerRowForMedia
          ? importedLayerRowForMedia.getByRole('button', { name: '定位到画布' })
          : null;
        if (importedLocateButtonForMedia && await importedLocateButtonForMedia.isVisible().catch(() => false)) {
          await importedLocateButtonForMedia.click({ force: true });
          await page.waitForTimeout(400);
        }
        const importedCanvasElementForMedia = importedLayerId
          ? page.locator(`[data-element-id="${importedLayerId}"]`).first()
          : page.locator('[data-element-id]').last();
        const importedElementBoxForMedia = await importedCanvasElementForMedia.boundingBox().catch(() => null);
        if (importedElementBoxForMedia) {
          await page.mouse.click(importedElementBoxForMedia.x + importedElementBoxForMedia.width / 2, importedElementBoxForMedia.y + importedElementBoxForMedia.height / 2);
          await page.waitForTimeout(300);
        } else {
          await page.mouse.click(importedCenterX, importedCenterY);
          await page.waitForTimeout(300);
        }
        const contextReferenceButton = page.locator('[data-testid="context-project-reference-button"]:visible').last();
        record('图片上下文工具栏显示项目参考库入口', await contextReferenceButton.isVisible().catch(() => false));
        if (await contextReferenceButton.isVisible().catch(() => false)) {
          await contextReferenceButton.dispatchEvent('click');
          const contextReferenceCard = page.locator('[data-testid="context-project-reference-qa-reference-image-2"]:visible').last();
          await contextReferenceCard.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);
          if (await contextReferenceCard.isVisible().catch(() => false)) {
            await contextReferenceCard.dispatchEvent('click');
            await page.waitForTimeout(300);
          }

          let lastAiEditPayload = null;
          const aiEditRoute = async (route) => {
            lastAiEditPayload = route.request().postDataJSON();
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ imageData: fixtureImageDataUrl }),
            });
          };

          await page.route('**/api/generate-image', aiEditRoute);
          const aiEditButton = page.locator('[title="AI 智能编辑"]').first();
          if (await aiEditButton.isVisible().catch(() => false)) {
            await aiEditButton.click({ force: true });
            await page.waitForTimeout(250);
            const aiEditInput = page.locator('input[placeholder*="把背景换成海边"]').first();
            if (await aiEditInput.isVisible().catch(() => false)) {
              await aiEditInput.fill('QA 检查项目参考图透传');
              await aiEditInput.press('Enter');
              await page.waitForTimeout(800);
            }
          }
          await page.unroute('**/api/generate-image', aiEditRoute);

          const aiEditReferenceImages = Array.isArray(lastAiEditPayload?.referenceImages)
            ? lastAiEditPayload.referenceImages
            : [];
          const hasSelectedProjectReference = aiEditReferenceImages.includes(qaReferenceImageDataUrl);
          const hasSourceAndSelectedReferences = hasSelectedProjectReference && aiEditReferenceImages.length >= 2;
          record('图片上下文工具栏可勾选项目参考图', hasSourceAndSelectedReferences, aiEditReferenceImages.length > 0 ? `referenceImages=${aiEditReferenceImages.length}` : '缺少 referenceImages');
          record('AI 编辑请求带上项目参考图', hasSourceAndSelectedReferences, aiEditReferenceImages.length > 0 ? `referenceImages=${aiEditReferenceImages.length}` : '缺少 referenceImages');

          const generatorReferenceCounts = page.locator('[data-testid="image-generator-reference-count"]:visible');
          const generatorCountBeforeContinue = await generatorReferenceCounts.count().catch(() => 0);
          const continueGenerateButton = page.locator('[data-testid="context-connect-flow-button"]:visible').last();
          if (await continueGenerateButton.isVisible().catch(() => false)) {
            await continueGenerateButton.click({ force: true });
            await page.waitForFunction(
              previousCount => document.querySelectorAll('[data-testid="image-generator-reference-count"]').length > previousCount,
              generatorCountBeforeContinue,
              { timeout: 5000 },
            ).catch(() => {});
            await page.waitForTimeout(600);
          }
          const continuedGeneratorReferenceCount = page.locator('[data-testid="image-generator-reference-count"]:visible').last();
          const continuedGeneratorReferenceText = await continuedGeneratorReferenceCount.textContent().catch(() => '');
          record('继续生成可继承当前图片与项目参考图', continuedGeneratorReferenceText?.includes('2 张参考图') ?? false, continuedGeneratorReferenceText || '未读取到参考图计数');
        } else {
          record('图片上下文工具栏可勾选项目参考图', false, '未显示项目参考库入口');
          record('AI 编辑请求带上项目参考图', false, '未显示项目参考库入口');
          record('继续生成可继承当前图片与项目参考图', false, '未显示项目参考库入口');
        }

        await page.locator('[title="图像生成器 (A)"]').first().click({ force: true });
        await page.waitForTimeout(700);
        record('图片生成器显示项目参考库', await page.getByText('项目参考库', { exact: true }).first().isVisible().catch(() => false));
        record('图片生成器可读取项目参考素材', await page.getByText('QA 项目参考', { exact: false }).first().isVisible().catch(() => false));

        await page.mouse.click(1180, 120).catch(() => {});
        await page.waitForTimeout(250);
        await page.locator('[title="添加与生成"]').first().click({ force: true });
        await page.waitForTimeout(250);
        await page.getByText('视频生成器', { exact: true }).last().click({ force: true });
        await page.waitForTimeout(700);
        record('视频生成器显示项目参考库', await page.getByText('项目参考库', { exact: true }).last().isVisible().catch(() => false));
        record('视频生成器显示任务恢复入口', await page.getByText('任务恢复', { exact: true }).isVisible().catch(() => false));
        record('视频生成器显示查询并接管按钮', await page.getByRole('button', { name: '查询并接管' }).isVisible().catch(() => false));

        await page.mouse.click(1180, 120).catch(() => {});
        await page.waitForTimeout(250);
        if (await referenceToggle.isVisible().catch(() => false)) {
          await referenceToggle.click({ force: true });
          await page.waitForTimeout(250);
          await referenceToggle.click({ force: true });
          await page.waitForTimeout(400);
        }
        const referencePanelTitle = page.getByText('项目参考库', { exact: true }).last();
        if (!(await referencePanelTitle.isVisible().catch(() => false)) && await referenceToggle.isVisible().catch(() => false)) {
          await referenceToggle.click({ force: true });
          await referencePanelTitle.waitFor({ state: 'visible', timeout: 1500 }).catch(() => {});
        }
        const visibleReferenceSelectButtons = page.locator('[data-testid^="project-reference-select-"]:visible');
        const visibleReferenceSelectCount = await visibleReferenceSelectButtons.count();
        if (visibleReferenceSelectCount >= 3) {
          await visibleReferenceSelectButtons.nth(1).evaluate((node) => node.click());
          await page.waitForTimeout(120);
          await visibleReferenceSelectButtons.nth(2).evaluate((node) => node.click());
          await page.getByText('已选 2', { exact: false }).waitFor({ state: 'visible', timeout: 1500 }).catch(() => {});
          await page.locator('[data-testid="project-reference-batch-delete"]:visible').first().waitFor({ state: 'visible', timeout: 1500 }).catch(() => {});
        }
        const referenceCountBeforeBatchDelete = await readProjectReferenceCount(currentProjectId);
        const batchDeleteButton = page.locator('[data-testid="project-reference-batch-delete"]:visible').first();
        if (await batchDeleteButton.isVisible().catch(() => false)) {
          await batchDeleteButton.evaluate((node) => node.click());
          await page.waitForFunction(
            ({ projectId, previousCount }) => {
              try {
                const raw = window.localStorage.getItem(`lovart_project_reference_library:${projectId}`);
                const items = raw ? JSON.parse(raw) : [];
                return Array.isArray(items) && items.length < previousCount;
              } catch {
                return false;
              }
            },
            { projectId: currentProjectId, previousCount: referenceCountBeforeBatchDelete },
            { timeout: 3000 },
          ).catch(() => null);
          await waitForAppStable(6000);
        }
        const referenceCountAfterBatchDelete = await readProjectReferenceCount(currentProjectId);
        record('项目参考图支持批量移出参考库', referenceCountAfterBatchDelete < referenceCountBeforeBatchDelete, `${referenceCountBeforeBatchDelete} -> ${referenceCountAfterBatchDelete}`);
      }
    }
  }

  if (shouldRunPhase('layer-reorder')) {
    setPhase('layer-reorder');
    await ensureLayersPanelVisible();
    const titlesBeforeReorder = await getLayerTitles();
    const allLayerRows = page.locator('[data-testid^="layer-row-"]');
    const dragRow = allLayerRows.nth(0);
    const targetRow = allLayerRows.nth(1);
    const draggedTitle = titlesBeforeReorder[0] || '';
    const dragRowTestId = await dragRow.getAttribute('data-testid');
    const targetRowTestId = await targetRow.getAttribute('data-testid');
    const dragRowId = dragRowTestId?.replace('layer-row-', '') || '';
    const targetRowId = targetRowTestId?.replace('layer-row-', '') || '';
    let dragSortWorked = false;
    if (dragRowId && targetRowId && draggedTitle) {
      console.log(`CHECKPOINT: before panel reorder dragged=${dragRowId} target=${targetRowId}`);
      await dispatchLayerReorder(dragRowId, targetRowId, 'before');
      console.log('CHECKPOINT: after panel reorder');
      await page.waitForTimeout(600);
      const titlesAfterReorder = await getLayerTitles();
      const draggedIndexBefore = titlesBeforeReorder.indexOf(draggedTitle);
      const draggedIndexAfter = titlesAfterReorder.indexOf(draggedTitle);
      dragSortWorked = draggedIndexBefore >= 0 && draggedIndexAfter > draggedIndexBefore;
      record('图层面板可拖拽排序', dragSortWorked, `${draggedIndexBefore} -> ${draggedIndexAfter}`);
    } else {
      record('图层面板可拖拽排序', false, '未找到可排序图层行');
    }

  }

  if (shouldRunPhase('canvas-frame-adoption')) {
    setPhase('canvas-frame-adoption');
    await ensureLayersPanelVisible();
    await drawFrame(720, 420, 980, 700);
    await page.waitForTimeout(800);

    const frameLayerRow = page.locator('[data-testid^="layer-row-"]', { hasText: FRAME_LAYER_TEXT }).first();
    const frameLayerTestId = await frameLayerRow.getAttribute('data-testid');
    const frameLayerId = frameLayerTestId?.replace('layer-row-', '') || '';
    const currentImageLayerRow = page.locator('[data-testid^="layer-row-"]', { hasText: '图片' }).first();
    const currentImageLayerTestId = await currentImageLayerRow.getAttribute('data-testid');
    const currentImageLayerId = currentImageLayerTestId?.replace('layer-row-', '') || '';
    let moveIntoFrameWorked = false;
    if (frameLayerId && currentImageLayerId) {
      await frameLayerRow.scrollIntoViewIfNeeded().catch(() => {});
      console.log(`CHECKPOINT: before canvas action into frame image=${currentImageLayerId} frame=${frameLayerId}`);
      await dispatchCanvasMoveToFrame(currentImageLayerId, frameLayerId);
      console.log('CHECKPOINT: after canvas action into frame');
      await page.waitForTimeout(700);
      moveIntoFrameWorked = await layerRowHasChildCount(frameLayerRow, 1);
    }
    record('画布元素可进入画板层级', moveIntoFrameWorked);

    const nestedImageLayerRow = page.locator('[data-testid^="layer-row-"]', { hasText: '图片' }).first();
    let moveOutToRootWorked = false;
    if (moveIntoFrameWorked && currentImageLayerId) {
      console.log(`CHECKPOINT: before canvas action to root image=${currentImageLayerId}`);
      await dispatchCanvasMoveToFrame(currentImageLayerId, null);
      console.log('CHECKPOINT: after canvas action to root');
      await page.waitForTimeout(700);
      moveOutToRootWorked = await nestedImageLayerRow.isVisible().catch(() => false)
        && !(await layerRowHasChildCount(frameLayerRow, 1));
    }
    record('画布元素可移回根层级', moveOutToRootWorked);
  }

  if (shouldRunPhase('benchmark-panel')) {
    setPhase('benchmark-panel');
    const panel = page.locator('[data-testid="benchmark-panel"]');
    record('性能面板可见', await panel.isVisible().catch(() => false));
    record('性能面板显示实时渲染指标', await page.locator('[data-testid="benchmark-live-metrics"]').isVisible().catch(() => false));
    record('性能面板显示分区指标', await page.locator('[data-testid="benchmark-metric-partitions"]').isVisible().catch(() => false));
    record('性能面板显示逻辑分块指标', await page.locator('[data-testid="benchmark-chunk-metrics"]').isVisible().catch(() => false));
    record('性能面板显示历史面板', await page.locator('[data-testid="benchmark-history-panel"]').isVisible().catch(() => false));
    record('性能面板显示分块预热面板', await page.locator('[data-testid="benchmark-chunk-preheat"]').isVisible().catch(() => false));
    record('性能面板显示激活块指标', await page.locator('[data-testid="benchmark-chunk-active"]').isVisible().catch(() => false));
    record('性能面板显示固定块指标', await page.locator('[data-testid="benchmark-chunk-pinned"]').isVisible().catch(() => false));
    record('性能面板显示运行态卸载指标', await page.locator('[data-testid="benchmark-chunk-unloaded"]').isVisible().catch(() => false));
    record('性能面板显示历史时间线', await page.locator('[data-testid="benchmark-history-timeline"]').isVisible().catch(() => false));

    const historyToggle = page.locator('[title="打开历史侧栏"], [title="关闭历史侧栏"]').first();
    record('头部提供独立历史侧栏入口', await historyToggle.isVisible().catch(() => false));

    let historySidebarVisible = false;
    if (await historyToggle.isVisible().catch(() => false)) {
      await historyToggle.click({ force: true });
      await page.waitForTimeout(500);
      historySidebarVisible = await page.locator('[data-testid="history-sidebar"]').isVisible().catch(() => false);
    }
    record('可打开独立历史侧栏', historySidebarVisible);
    record('独立历史侧栏显示时间线', historySidebarVisible && await page.locator('[data-testid="history-sidebar-timeline"]').isVisible().catch(() => false));
    record('独立历史侧栏显示分块列表', historySidebarVisible && await page.locator('[data-testid="history-sidebar-chunks"]').isVisible().catch(() => false));

    let pinChunkWorked = false;
    if (historySidebarVisible) {
      const pinnedMetric = page.locator('[data-testid="benchmark-chunk-pinned"]');
      const pinnedBeforeText = await pinnedMetric.textContent().catch(() => '0');
      const pinnedBefore = Number.parseInt((pinnedBeforeText || '0').trim(), 10) || 0;
      const activatablePinButton = page.locator('[title="固定激活该分块"]').first();

      if (await activatablePinButton.isVisible().catch(() => false)) {
        await activatablePinButton.click({ force: true });
        await page.waitForTimeout(400);
        const pinnedAfterText = await pinnedMetric.textContent().catch(() => '0');
        const pinnedAfter = Number.parseInt((pinnedAfterText || '0').trim(), 10) || 0;
        pinChunkWorked = pinnedAfter >= Math.max(1, pinnedBefore + 1);
      } else {
        pinChunkWorked = pinnedBefore >= 1;
      }
    }
    record('独立历史侧栏可固定激活分块', pinChunkWorked);

    const appendButtonVisible = await page.locator('[data-testid="benchmark-run-append-250"]').isVisible().catch(() => false);
    record('性能面板提供追加压测场景', appendButtonVisible);

    let benchmarkRunWorked = false;
    const runButton = page.locator('[data-testid="benchmark-run-100"]').first();
    if (await runButton.isVisible().catch(() => false)) {
      await runButton.click({ force: true });
      await page.waitForTimeout(1800);
      benchmarkRunWorked = await page.locator('[data-testid="benchmark-results"]').getByText('100 张', { exact: false }).first().isVisible().catch(() => false);
    }
    record('性能面板可执行基础压测', benchmarkRunWorked);
  }

  if (shouldRunPhase('frame-auto-layout')) {
    setPhase('frame-auto-layout');
    await ensureLayersPanelVisible();
    const targetFrameRow = page.locator('[data-testid^="layer-row-"]', { hasText: FRAME_LAYER_TEXT }).first();
    const targetFrameId = ((await targetFrameRow.getAttribute('data-testid')) || '').replace('layer-row-', '');

    const collectShapeIds = async () => {
      const shapeRows = page.locator('[data-testid^="layer-row-"]', { hasText: '矩形' });
      const ids = [];
      const count = await shapeRows.count();
      for (let index = 0; index < Math.min(count, 3); index += 1) {
        const testId = await shapeRows.nth(index).getAttribute('data-testid');
        if (testId) ids.push(testId.replace('layer-row-', ''));
      }
      return ids;
    };

    let shapeIds = await collectShapeIds();
    while (shapeIds.length < 2) {
      const placement = [
        { x: 420, y: 220 },
        { x: 520, y: 260 },
        { x: 620, y: 300 },
      ][shapeIds.length] || { x: 420, y: 220 };
      await page.mouse.click(placement.x, placement.y, { button: 'right' });
      await clickContextMenuItem('添加形状');
      await page.waitForTimeout(500);
      shapeIds = await collectShapeIds();
    }

    const currentImageRow = page.locator('[data-testid^="layer-row-"]', { hasText: '图片' }).first();
    const currentImageId = ((await currentImageRow.getAttribute('data-testid')) || '').replace('layer-row-', '');

    if (targetFrameId && shapeIds.length >= 2) {
      for (const id of [...shapeIds, currentImageId].filter(Boolean)) {
        await dispatchLayerMoveToParent(id, targetFrameId);
      }
      await page.waitForTimeout(700);

      const frameSelectButton = page.locator(`[data-testid="layer-select-${targetFrameId}"]`).first();
      if (await frameSelectButton.isVisible().catch(() => false)) {
        await frameSelectButton.click({ force: true });
        await page.waitForTimeout(300);
      }
      const frameLocateButton = targetFrameRow.getByRole('button', { name: '定位到画布' });
      if (await frameLocateButton.isVisible().catch(() => false)) {
        await frameLocateButton.click({ force: true });
        await page.waitForTimeout(500);
      }

      const frameCanvas = page.locator(`[data-element-id="${targetFrameId}"]`).first();
      await frameCanvas.click({ position: { x: 20, y: 20 }, force: true }).catch(() => {});
      await page.waitForTimeout(500);

      const getBoxes = async (ids) => {
        const boxes = [];
        for (const id of ids) {
          const box = await page.locator(`[data-element-id="${id}"]`).boundingBox().catch(() => null);
          if (box) boxes.push(box);
        }
        return boxes;
      };

      const trackedIds = [...shapeIds, currentImageId].filter(Boolean);
      await dispatchFrameAutoLayout(targetFrameId, { enabled: true, mode: 'row', gap: 18, align: 'center' });
      await page.waitForTimeout(700);
      {
        const rowBoxes = await getBoxes(shapeIds.slice(0, 2));
        const rowAligned = rowBoxes.length >= 2 && Math.abs(rowBoxes[0].y - rowBoxes[1].y) < 18;
        record('画板自动布局支持横排模式', rowAligned);
      }

      await dispatchFrameAutoLayout(targetFrameId, { enabled: true, mode: 'column', gap: 20, align: 'center' });
      await page.waitForTimeout(700);
      {
        const columnBoxes = await getBoxes(shapeIds.slice(0, 2));
        const columnAligned = columnBoxes.length >= 2
          && Math.abs(columnBoxes[0].x - columnBoxes[1].x) < 18
          && Math.abs(columnBoxes[0].y - columnBoxes[1].y) > 24;
        record('画板自动布局支持竖排模式', columnAligned);
      }

      await dispatchFrameAutoLayout(targetFrameId, { enabled: true, mode: 'column', gap: 18, align: 'start' });
      await page.waitForTimeout(600);
      const startAlignedBoxes = await getBoxes([currentImageId]);
      const startAlignedX = startAlignedBoxes[0]?.x ?? null;
      await dispatchFrameAutoLayout(targetFrameId, { enabled: true, mode: 'column', gap: 18, align: 'center' });
      await page.waitForTimeout(600);
      const centerAlignedBoxes = await getBoxes([currentImageId]);
      const centerAlignedX = centerAlignedBoxes[0]?.x ?? null;
      record('画板自动布局支持起始/居中对齐切换', startAlignedX !== null && centerAlignedX !== null && centerAlignedX > startAlignedX + 5);

      if (trackedIds.length >= 3) {
        await dispatchFrameAutoLayout(targetFrameId, { enabled: true, mode: 'grid', gap: 22, align: 'center' });
        await page.waitForTimeout(700);
        const gridBoxes = await getBoxes(trackedIds.slice(0, 3));
        const uniqueXs = new Set(gridBoxes.map((box) => Math.round(box.x / 10)));
        const uniqueYs = new Set(gridBoxes.map((box) => Math.round(box.y / 10)));
        record('画板自动布局支持网格模式', uniqueXs.size >= 2 && uniqueYs.size >= 2);
      } else {
        record('画板自动布局支持网格模式', false, '元素不足');
      }
    } else {
      record('画板自动布局支持横排模式', false, '缺少验证所需画板或元素');
      record('画板自动布局支持竖排模式', false, '缺少验证所需画板或元素');
      record('画板自动布局支持起始/居中对齐切换', false, '缺少验证所需画板或元素');
      record('画板自动布局支持网格模式', false, '缺少验证所需画板或元素');
    }
  }

  await page.screenshot({ path: path.join(outDir, '02-final.png'), fullPage: true });
} catch (error) {
  console.error(error);
  record('自动化脚本执行', false, error instanceof Error ? error.message : String(error));
  await page.screenshot({ path: path.join(outDir, 'error.png'), fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

const summaryPath = path.join(outDir, 'summary.json');
await fs.writeFile(summaryPath, JSON.stringify(results, null, 2), 'utf8');
const groupedSummary = results.reduce((acc, item) => {
  const phase = item.phase || 'ungrouped';
  if (!acc[phase]) {
    acc[phase] = {
      total: 0,
      passed: 0,
      failed: 0,
      items: [],
    };
  }

  acc[phase].total += 1;
  if (item.ok) {
    acc[phase].passed += 1;
  } else {
    acc[phase].failed += 1;
  }
  acc[phase].items.push(item);
  return acc;
}, {});
const groupedSummaryPath = path.join(outDir, 'summary.grouped.json');
await fs.writeFile(groupedSummaryPath, JSON.stringify(groupedSummary, null, 2), 'utf8');
const failed = results.filter(item => !item.ok);
const relativeOutDir = path.relative(process.cwd(), outDir);
const markdownLines = [
  '# Canvas QA Report',
  '',
  `- Artifacts: ${relativeOutDir}`,
  `- Total: ${results.length}`,
  `- Passed: ${results.length - failed.length}`,
  `- Failed: ${failed.length}`,
  '',
  '## Phase Summary',
  '',
  '| Phase | Passed | Failed | Total |',
  '| --- | ---: | ---: | ---: |',
  ...Object.entries(groupedSummary).map(([phase, summary]) => `| ${phase} | ${summary.passed} | ${summary.failed} | ${summary.total} |`),
  '',
];

if (failed.length > 0) {
  markdownLines.push('## Failed Checks', '');
  failed.forEach((item) => {
    markdownLines.push(`- [${item.phase}] ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
  });
  markdownLines.push('');
} else {
  markdownLines.push('## Failed Checks', '', '- None', '');
}

markdownLines.push('## All Checks', '');
results.forEach((item) => {
  markdownLines.push(`- ${item.ok ? 'PASS' : 'FAIL'} [${item.phase}] ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
});
markdownLines.push('');

const markdownSummaryPath = path.join(outDir, 'summary.md');
await fs.writeFile(markdownSummaryPath, markdownLines.join('\n'), 'utf8');
console.log(`SUMMARY: ${results.length - failed.length}/${results.length} passed`);
console.log(`ARTIFACTS: ${relativeOutDir}`);
console.log('PHASE SUMMARY:');
Object.entries(groupedSummary).forEach(([phase, summary]) => {
  const status = summary.failed > 0 ? 'FAIL' : 'PASS';
  console.log(`- ${status} ${phase}: ${summary.passed}/${summary.total}`);
});
console.log(`REPORT: ${path.relative(process.cwd(), markdownSummaryPath)}`);
if (failed.length > 0) {
  console.log('FAILED CHECKS:');
  failed.forEach((item) => {
    console.log(`- [${item.phase}] ${item.name}${item.detail ? ` :: ${item.detail}` : ''}`);
  });
  process.exitCode = 1;
}
