import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrlArg = process.argv.find((argument) => argument.startsWith('--base-url='));
const outputArg = process.argv.find((argument) => argument.startsWith('--out='));
const baseUrl = baseUrlArg?.slice('--base-url='.length) || 'http://localhost:3100/canvas?bench=1';
const outputPath = path.resolve(outputArg?.slice('--out='.length) || 'artifacts/canvas-qa/zoom-performance.json');
const frameBudgetMs = 20;
const targetSequence = [0.5, 0.4, 0.3, 0.2, 0.14, 0.2, 0.3, 0.4, 0.5];

function percentile(values, ratio) {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function median(values) {
  return percentile(values, 0.5);
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function readCanvasState(canvas) {
  return canvas.evaluate((node) => ({
    scale: Number(node.getAttribute('data-scale') || 0),
    visualScale: Number(node.getAttribute('data-visual-scale') || 0),
    panX: Number(node.getAttribute('data-pan-x') || 0),
    panY: Number(node.getAttribute('data-pan-y') || 0),
    visualPanX: Number(node.getAttribute('data-visual-pan-x') || 0),
    visualPanY: Number(node.getAttribute('data-visual-pan-y') || 0),
    total: Number(node.getAttribute('data-total-elements') || 0),
    overview: Number(node.getAttribute('data-overview-elements') || 0),
    renderMode: node.getAttribute('data-zoom-render-mode') || 'unknown',
    isZooming: node.getAttribute('data-is-zooming') === 'true',
    commitCount: Number(node.getAttribute('data-zoom-commit-count') || 0),
  }));
}

async function waitForZoomEnd(page) {
  await page.waitForFunction(
    () => document.querySelector('[data-testid="canvas-area"]')?.getAttribute('data-is-zooming') === 'false',
    undefined,
    { timeout: 10000 },
  );
}

async function emitCtrlWheel(page, delta) {
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, delta);
  await page.keyboard.up('Control');
}

async function setScale(page, canvas, targetScale) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box is unavailable');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const current = (await readCanvasState(canvas)).scale;
    if (Math.abs(current - targetScale) <= 0.0025) return current;
    const rawDelta = Math.log(targetScale / current) / Math.log(0.9) * 120;
    await emitCtrlWheel(page, Math.max(-240, Math.min(240, rawDelta)));
    await page.waitForFunction(
      () => document.querySelector('[data-testid="canvas-area"]')?.getAttribute('data-is-zooming') === 'true',
      undefined,
      { timeout: 1000 },
    );
    await waitForZoomEnd(page);
  }
  const actual = (await readCanvasState(canvas)).scale;
  if (Math.abs(actual - targetScale) > 0.006) {
    throw new Error(`Unable to set scale ${targetScale}; actual=${actual}`);
  }
  return actual;
}

async function startFrameSampler(page) {
  await page.evaluate(() => {
    window.__OPENLOVART_ZOOM_FRAME_SAMPLE__ = {
      active: false,
      last: 0,
      intervals: [],
      scaleRatios: [],
      anchorErrors: [],
      lastScale: 0,
      anchor: null,
      maxOverviewElements: 0,
      overviewCovered: true,
    };
    const sample = (timestamp) => {
      const state = window.__OPENLOVART_ZOOM_FRAME_SAMPLE__;
      const canvas = document.querySelector('[data-testid="canvas-area"]');
      if (state.active && canvas && canvas.getAttribute('data-is-zooming') === 'true') {
        const scale = Number(canvas.getAttribute('data-visual-scale') || 0);
        const panX = Number(canvas.getAttribute('data-visual-pan-x') || 0);
        const panY = Number(canvas.getAttribute('data-visual-pan-y') || 0);
        const scaleChanged = state.lastScale > 0 && scale > 0 && Math.abs(scale - state.lastScale) > 1e-8;
        if (scaleChanged && state.last > 0) state.intervals.push(timestamp - state.last);
        if (scaleChanged) state.scaleRatios.push(Math.abs(scale / state.lastScale - 1));
        if (state.anchor && scale > 0) {
          const projectedX = state.anchor.canvasX * scale + panX;
          const projectedY = state.anchor.canvasY * scale + panY;
          state.anchorErrors.push(Math.hypot(projectedX - state.anchor.screenX, projectedY - state.anchor.screenY));
        }
        state.last = timestamp;
        state.lastScale = scale;
        const overviewElements = Number(canvas.getAttribute('data-overview-elements') || 0);
        state.maxOverviewElements = Math.max(state.maxOverviewElements, overviewElements);
        if (canvas.getAttribute('data-zoom-render-mode') === 'overview') {
          const overview = document.querySelector('[data-testid="canvas-zoom-overview"]');
          state.overviewCovered = state.overviewCovered && !!overview;
        }
      } else {
        state.last = 0;
        state.lastScale = 0;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function beginSample(page, canvas, cursor) {
  const before = await readCanvasState(canvas);
  await page.evaluate(({ cursor, before }) => {
    const state = window.__OPENLOVART_ZOOM_FRAME_SAMPLE__;
    state.active = true;
    state.last = 0;
    state.lastScale = before.visualScale;
    state.intervals.length = 0;
    state.scaleRatios.length = 0;
    state.anchorErrors.length = 0;
    state.maxOverviewElements = 0;
    state.overviewCovered = true;
    state.anchor = {
      screenX: cursor.x,
      screenY: cursor.y,
      canvasX: (cursor.x - before.visualPanX) / before.visualScale,
      canvasY: (cursor.y - before.visualPanY) / before.visualScale,
    };
  }, { cursor, before });
  return before;
}

async function endSample(page) {
  return page.evaluate(() => {
    const state = window.__OPENLOVART_ZOOM_FRAME_SAMPLE__;
    state.active = false;
    const overview = document.querySelector('[data-testid="canvas-zoom-overview"]');
    const overviewStyle = overview ? getComputedStyle(overview) : null;
    const overviewCoversCanvas = !!overviewStyle
      && overviewStyle.position === 'absolute'
      && overviewStyle.left === '0px'
      && overviewStyle.top === '0px'
      && overviewStyle.right === '0px'
      && overviewStyle.bottom === '0px';
    return {
      intervals: [...state.intervals],
      scaleRatios: [...state.scaleRatios],
      anchorErrors: [...state.anchorErrors],
      maxOverviewElements: state.maxOverviewElements,
      overviewCovered: state.overviewCovered && overviewCoversCanvas,
    };
  });
}

async function runZoomTransition(page, canvas, targetScale, inputStep) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box is unavailable');
  const cursorClient = { x: box.x + box.width * 0.57, y: box.y + box.height * 0.46 };
  const cursorLocal = { x: cursorClient.x - box.x, y: cursorClient.y - box.y };
  await page.mouse.move(cursorClient.x, cursorClient.y);
  const before = await beginSample(page, canvas, cursorLocal);
  const totalDelta = Math.log(targetScale / before.visualScale) / Math.log(0.9) * 120;
  let remaining = totalDelta;
  await page.keyboard.down('Control');
  while (Math.abs(remaining) > 0.01) {
    const delta = Math.sign(remaining) * Math.min(Math.abs(remaining), inputStep);
    await page.mouse.wheel(0, delta);
    remaining -= delta;
    await page.waitForTimeout(8);
  }
  await page.keyboard.up('Control');
  await waitForZoomEnd(page);
  const after = await readCanvasState(canvas);
  const sample = await endSample(page);
  return {
    fromScale: before.scale,
    targetScale,
    actualScale: after.scale,
    p95Ms: round(percentile(sample.intervals, 0.95)),
    maxMs: round(Math.max(0, ...sample.intervals)),
    samples: sample.intervals.length,
    maxFrameScaleChange: round(Math.max(0, ...sample.scaleRatios) * 100, 3),
    maxAnchorError: round(Math.max(0, ...sample.anchorErrors), 3),
    finalScaleErrorPercent: round(Math.abs(after.visualScale - after.scale) / Math.max(after.scale, 0.0001) * 100, 4),
    finalPanError: round(Math.hypot(after.visualPanX - after.panX, after.visualPanY - after.panY), 3),
    officialCommitCount: after.commitCount - before.commitCount,
    overviewElements: sample.maxOverviewElements,
    overviewCovered: sample.overviewCovered,
  };
}

async function verifyOneNotchAndOrdinaryPan(page, canvas) {
  await setScale(page, canvas, 0.5);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box is unavailable');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const beforeZoom = await readCanvasState(canvas);
  await emitCtrlWheel(page, 120);
  const activeObserved = await page.waitForFunction(
    () => document.querySelector('[data-testid="canvas-area"]')?.getAttribute('data-is-zooming') === 'true',
    undefined,
    { timeout: 1000 },
  ).then(() => true).catch(() => false);
  await waitForZoomEnd(page);
  const afterZoom = await readCanvasState(canvas);
  const beforePan = afterZoom;
  await page.mouse.wheel(0, 80);
  await page.waitForTimeout(50);
  const afterPan = await readCanvasState(canvas);
  return {
    ctrlActiveObserved: activeObserved,
    oneNotchFactor: round(afterZoom.scale / beforeZoom.scale, 4),
    zoomCommitCount: afterZoom.commitCount - beforeZoom.commitCount,
    ordinaryWheelScaleUnchanged: Math.abs(afterPan.scale - beforePan.scale) <= 0.0001,
    ordinaryWheelPanDistance: round(Math.hypot(afterPan.panX - beforePan.panX, afterPan.panY - beforePan.panY)),
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
  functional: null,
  modes: [],
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
    () => document.querySelector('[data-testid="canvas-area"]')?.getAttribute('data-total-elements') === '300',
    undefined,
    { timeout: 120000 },
  );
  await page.waitForTimeout(1200);
  await page.locator('[data-testid="benchmark-panel"]').evaluate((node) => {
    node.style.display = 'none';
  });
  await startFrameSampler(page);
  report.functional = await verifyOneNotchAndOrdinaryPan(page, canvas);

  for (const mode of [
    { name: 'mouse-120', inputStep: 120 },
    { name: 'high-precision-12', inputStep: 12 },
  ]) {
    await setScale(page, canvas, targetSequence[0]);
    for (const targetScale of targetSequence.slice(1)) {
      await runZoomTransition(page, canvas, targetScale, mode.inputStep);
    }
    await setScale(page, canvas, targetSequence[0]);

    const runs = [];
    for (let runIndex = 0; runIndex < 3; runIndex += 1) {
      const transitions = [];
      for (const targetScale of targetSequence.slice(1)) {
        transitions.push(await runZoomTransition(page, canvas, targetScale, mode.inputStep));
      }
      runs.push(transitions);
    }

    const scaleRows = targetSequence.slice(1).map((targetScale, transitionIndex) => {
      const samples = runs.map((run) => run[transitionIndex]);
      return {
        targetScale,
        direction: targetScale < samples[0].fromScale ? 'out' : 'in',
        medianP95Ms: round(median(samples.map((sample) => sample.p95Ms))),
        samples,
      };
    });
    report.modes.push({ ...mode, scaleRows });
  }

  const measuredTransitions = report.modes.flatMap((mode) => mode.scaleRows.flatMap((row) => row.samples));
  report.passed = report.functional.ctrlActiveObserved
    && Math.abs(report.functional.oneNotchFactor - 0.9) <= 0.005
    && report.functional.zoomCommitCount <= 2
    && report.functional.ordinaryWheelScaleUnchanged
    && report.functional.ordinaryWheelPanDistance >= 75
    && report.modes.every((mode) => mode.scaleRows.every((row) => row.medianP95Ms <= frameBudgetMs))
    && measuredTransitions.every((entry) => (
      entry.maxFrameScaleChange <= 4.1
      && entry.maxAnchorError <= 1
      && entry.finalScaleErrorPercent <= 0.5
      && entry.finalPanError <= 2
      && entry.officialCommitCount <= 2
      && Math.abs(entry.actualScale - entry.targetScale) <= 0.006
      && (Math.min(entry.fromScale, entry.targetScale) > 0.32 || (entry.overviewElements === 300 && entry.overviewCovered))
    ));
} finally {
  await browser.close();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
