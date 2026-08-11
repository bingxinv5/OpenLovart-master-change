import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrlArg = process.argv.find((argument) => argument.startsWith('--base-url='));
const outputArg = process.argv.find((argument) => argument.startsWith('--out='));
const baseUrl = baseUrlArg?.slice('--base-url='.length) || 'http://localhost:3002/canvas?bench=1';
const outputPath = path.resolve(outputArg?.slice('--out='.length) || 'artifacts/canvas-qa/pan-performance.json');
const targetScales = [0.5, 0.4, 0.3, 0.2, 0.14];
const frameBudgetMs = 20;

function percentile(values, ratio) {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function median(values) {
  return percentile(values, 0.5);
}

async function readCanvasState(canvas) {
  return canvas.evaluate((node) => ({
    scale: Number(node.getAttribute('data-scale') || 0),
    panX: Number(node.getAttribute('data-pan-x') || 0),
    panY: Number(node.getAttribute('data-pan-y') || 0),
    visualPanX: Number(node.getAttribute('data-visual-pan-x') || 0),
    visualPanY: Number(node.getAttribute('data-visual-pan-y') || 0),
    total: Number(node.getAttribute('data-total-elements') || 0),
    visible: Number(node.getAttribute('data-visible-elements') || 0),
    overview: Number(node.getAttribute('data-overview-elements') || 0),
    renderMode: node.getAttribute('data-pan-render-mode') || 'unknown',
    isPanning: node.getAttribute('data-is-panning') === 'true',
    motionActive: node.getAttribute('data-is-pan-motion-active') === 'true',
  }));
}

async function setScale(page, canvas, targetScale) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box is unavailable');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const current = (await readCanvasState(canvas)).scale;
    if (Math.abs(current - targetScale) <= 0.0025) return current;
    const rawDelta = Math.log(targetScale / current) / Math.log(0.9) * 120;
    const delta = Math.max(-240, Math.min(240, rawDelta));
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, delta);
    await page.keyboard.up('Control');
    await page.waitForFunction(
      () => document.querySelector('[data-testid="canvas-area"]')?.getAttribute('data-is-zooming') === 'true',
      undefined,
      { timeout: 1000 },
    );
    await page.waitForFunction(
      () => document.querySelector('[data-testid="canvas-area"]')?.getAttribute('data-is-zooming') === 'false',
      undefined,
      { timeout: 5000 },
    );
  }
  const actual = (await readCanvasState(canvas)).scale;
  if (Math.abs(actual - targetScale) > 0.006) {
    throw new Error(`Unable to set scale ${targetScale}; actual=${actual}`);
  }
  return actual;
}

async function waitForMotionEnd(page) {
  await page.waitForFunction(
    () => document.querySelector('[data-testid="canvas-area"]')?.getAttribute('data-is-pan-motion-active') === 'false',
    undefined,
    { timeout: 10000 },
  ).catch(() => {});
}

async function startFrameSampler(page) {
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="canvas-area"]');
    const readFormalPan = () => `${canvas?.getAttribute('data-pan-x') || '0'}:${canvas?.getAttribute('data-pan-y') || '0'}`;
    const state = { active: false, last: 0, intervals: [], trackCommits: false, commitCount: 0, lastFormalPan: readFormalPan() };
    window.__OPENLOVART_PAN_FRAME_SAMPLE__ = state;
    if (canvas) {
      new MutationObserver(() => {
        if (!state.trackCommits) return;
        const nextFormalPan = readFormalPan();
        if (nextFormalPan === state.lastFormalPan) return;
        state.lastFormalPan = nextFormalPan;
        state.commitCount += 1;
      }).observe(canvas, { attributes: true, attributeFilter: ['data-pan-x', 'data-pan-y'] });
    }
    const sample = (timestamp) => {
      if (state.active) {
        if (state.last > 0) state.intervals.push(timestamp - state.last);
        state.last = timestamp;
      } else {
        state.last = 0;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function runTimedMiddleDrag(page, canvas, direction = 1) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box is unavailable');
  const distance = Math.min(1200, box.width - 220);
  const start = {
    x: direction > 0 ? box.x + 110 : box.x + box.width - 110,
    y: box.y + Math.min(box.height - 120, 700),
  };
  const end = { x: start.x + (distance * direction), y: start.y };
  const before = await readCanvasState(canvas);
  await page.mouse.move(start.x, start.y);
  await page.evaluate(() => {
    const sample = window.__OPENLOVART_PAN_FRAME_SAMPLE__;
    sample.intervals.length = 0;
    sample.active = true;
    sample.trackCommits = true;
    sample.commitCount = 0;
    const canvas = document.querySelector('[data-testid="canvas-area"]');
    sample.lastFormalPan = `${canvas?.getAttribute('data-pan-x') || '0'}:${canvas?.getAttribute('data-pan-y') || '0'}`;
  });
  await page.mouse.down({ button: 'middle' });
  let modeDuringDrag = 'unknown';
  let overviewDuringDrag = 0;
  // Playwright mouse.move itself crosses an async browser boundary; 60 x 16 ms
  // yields a stable ~2 second drag on the target workstation.
  const steps = 60;
  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    await page.mouse.move(start.x + (end.x - start.x) * progress, start.y);
    if (index === Math.floor(steps / 2)) {
      const middleState = await readCanvasState(canvas);
      modeDuringDrag = middleState.renderMode;
      overviewDuringDrag = middleState.overview;
    }
    await page.waitForTimeout(16);
  }
  const beforeRelease = await readCanvasState(canvas);
  const overviewCoversViewport = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="canvas-area"]');
    const overview = document.querySelector('[data-testid="canvas-low-zoom-overview"]');
    if (!root || !overview) return null;
    const rootRect = root.getBoundingClientRect();
    const overviewRect = overview.getBoundingClientRect();
    return overviewRect.left <= rootRect.left + 1
      && overviewRect.top <= rootRect.top + 1
      && overviewRect.right >= rootRect.right - 1
      && overviewRect.bottom >= rootRect.bottom - 1;
  });
  await page.evaluate(() => { window.__OPENLOVART_PAN_FRAME_SAMPLE__.active = false; });
  await page.mouse.up({ button: 'middle' });
  await waitForMotionEnd(page);
  const after = await readCanvasState(canvas);
  const sampleState = await page.evaluate(() => {
    const sample = window.__OPENLOVART_PAN_FRAME_SAMPLE__;
    sample.trackCommits = false;
    return { intervals: [...sample.intervals], commitCount: sample.commitCount };
  });
  const intervals = sampleState.intervals;
  return {
    samples: intervals.length,
    p95Ms: Math.round(percentile(intervals, 0.95) * 100) / 100,
    maxMs: Math.round(Math.max(0, ...intervals) * 100) / 100,
    requestedDistance: end.x - start.x,
    visualDistance: Math.round((beforeRelease.visualPanX - before.visualPanX) * 100) / 100,
    endpointError: Math.round(Math.hypot(after.panX - after.visualPanX, after.panY - after.visualPanY) * 100) / 100,
    officialCommitCount: sampleState.commitCount,
    modeDuringDrag,
    overviewDuringDrag,
    overviewCoversViewport,
  };
}

async function getConnectorMidpoint(page) {
  return page.locator('.canvas-reference-connector-hit-path').first().evaluate((pathElement) => {
    const length = pathElement.getTotalLength();
    const point = pathElement.getPointAtLength(length / 2);
    const matrix = pathElement.getScreenCTM();
    if (!matrix) return null;
    return {
      x: point.x * matrix.a + point.y * matrix.c + matrix.e,
      y: point.x * matrix.b + point.y * matrix.d + matrix.f,
    };
  }).catch(() => null);
}

async function getBlankCanvasPoint(page, canvas) {
  return canvas.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const candidates = [
      [0.5, 0.9], [0.5, 0.75], [0.75, 0.9], [0.25, 0.9],
      [0.62, 0.68], [0.38, 0.68], [0.5, 0.5],
    ];
    for (const [xRatio, yRatio] of candidates) {
      const x = rect.left + rect.width * xRatio;
      const y = rect.top + rect.height * yRatio;
      const target = document.elementFromPoint(x, y);
      if (
        target
        && node.contains(target)
        && !target.closest('[data-element-type], button, input, textarea, [data-reference-node-menu="true"], .canvas-reference-connector-hit-path')
      ) {
        return { x, y };
      }
    }
    return { x: rect.left + rect.width / 2, y: rect.bottom - 80 };
  });
}

async function getVisibleElementCenter(page, canvas, selector) {
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) return null;
  const candidates = page.locator(selector);
  const count = await candidates.count();
  for (let index = 0; index < count; index += 1) {
    const box = await candidates.nth(index).boundingBox();
    if (!box) continue;
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    if (
      point.x >= canvasBox.x + 20
      && point.x <= canvasBox.x + canvasBox.width - 20
      && point.y >= canvasBox.y + 20
      && point.y <= canvasBox.y + canvasBox.height - 20
    ) {
      const isTopmostCanvasContent = await page.evaluate(({ x, y }) => (
        document.elementFromPoint(x, y)?.closest('[data-testid="canvas-area"]') !== null
      ), point);
      if (isTopmostCanvasContent) return point;
    }
  }
  return null;
}

async function verifyMiddleDragAt(page, canvas, point, label) {
  const before = await readCanvasState(canvas);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(point.x + 64, point.y + 36, { steps: 8 });
  const during = await readCanvasState(canvas);
  await page.mouse.up({ button: 'middle' });
  await waitForMotionEnd(page);
  return {
    label,
    passed: during.isPanning && Math.abs(during.visualPanX - before.visualPanX) >= 55,
    deltaX: Math.round((during.visualPanX - before.visualPanX) * 100) / 100,
    deltaY: Math.round((during.visualPanY - before.visualPanY) * 100) / 100,
  };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(error.message));

const report = {
  baseUrl,
  generatedAt: new Date().toISOString(),
  functional: [],
  scales: [],
  consoleErrors,
  passed: false,
};

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const canvas = page.locator('[data-testid="canvas-area"]').first();
  await canvas.waitFor({ state: 'visible', timeout: 60000 });
  const mixedButton = page.locator('[data-testid="benchmark-run-mixed-300"]');
  await mixedButton.waitFor({ state: 'visible', timeout: 30000 });
  await mixedButton.click();
  await page.waitForFunction(
    () => Number(document.querySelector('[data-testid="canvas-area"]')?.getAttribute('data-total-elements') || 0) > 0,
    undefined,
    { timeout: 120000 },
  );
  await mixedButton.waitFor({ state: 'attached' });
  await page.waitForTimeout(1200);
  await startFrameSampler(page);

  await setScale(page, canvas, 0.5);
  await page.waitForFunction(
    () => document.querySelector('[data-testid="canvas-area"]')?.getAttribute('data-total-elements') === '300',
    undefined,
    { timeout: 10000 },
  );
  await page.locator('[data-testid="benchmark-panel"]').evaluate((node) => {
    node.style.opacity = '0';
    node.style.pointerEvents = 'none';
  });
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error('Canvas bounding box is unavailable');
  const blankPoint = await getBlankCanvasPoint(page, canvas);
  report.functional.push(await verifyMiddleDragAt(page, canvas, blankPoint, 'blank-canvas'));

  const imagePoint = await getVisibleElementCenter(page, canvas, '[data-element-type="image"]');
  if (imagePoint) {
    report.functional.push(await verifyMiddleDragAt(page, canvas, imagePoint, 'image-element'));
  }

  const connectorPoint = await getConnectorMidpoint(page);
  if (connectorPoint) {
    report.functional.push(await verifyMiddleDragAt(page, canvas, connectorPoint, 'connector-hit-path'));
  }

  for (const targetScale of targetScales) {
    await setScale(page, canvas, targetScale);
    await runTimedMiddleDrag(page, canvas, 1); // warm-up
    const runs = [];
    for (let runIndex = 0; runIndex < 3; runIndex += 1) {
      runs.push(await runTimedMiddleDrag(page, canvas, runIndex % 2 === 0 ? -1 : 1));
    }
    const p95Ms = Math.round(median(runs.map((run) => run.p95Ms)) * 100) / 100;
    report.scales.push({
      targetScale,
      actualScale: (await readCanvasState(canvas)).scale,
      p95Ms,
      passed: p95Ms <= frameBudgetMs,
      runs,
    });
  }

  report.passed = report.functional.every((entry) => entry.passed)
    && report.scales.every((entry) => entry.passed)
    && report.scales.every((entry) => entry.runs.every((run) => (
      Math.abs(Math.abs(run.visualDistance) - Math.abs(run.requestedDistance)) <= 2
      && run.endpointError <= 2
      && run.officialCommitCount <= 8
    )))
    && report.scales
      .filter((entry) => entry.targetScale <= 0.3)
      .every((entry) => entry.runs.every((run) => (
        run.modeDuringDrag === 'overview'
        && run.overviewDuringDrag === 300
        && run.overviewCoversViewport === true
      )));
} finally {
  await browser.close();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
