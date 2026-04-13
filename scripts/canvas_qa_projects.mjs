import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const appBaseUrl = (process.env.CANVAS_QA_BASE_URL || 'http://127.0.0.1:3000/canvas').replace(/\/canvas\/?$/, '');
const baseUrl = process.env.CANVAS_QA_PROJECTS_BASE_URL || `${appBaseUrl}/projects`;
const outDirArg = process.argv.find(arg => arg.startsWith('--out-dir='));
const outDir = outDirArg
  ? path.resolve(outDirArg.replace('--out-dir=', ''))
  : path.resolve('artifacts', 'canvas-qa', 'projects');
await fs.mkdir(outDir, { recursive: true });

const results = [];
const phase = 'projects';
const record = (name, ok, detail = '') => {
  results.push({ phase, name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

async function waitForCard(title, timeout = 10000) {
  const card = page.locator('[data-testid^="project-card-"]', { hasText: title }).first();
  await card.waitFor({ state: 'visible', timeout });
  return card;
}

async function openProjectMenu(card) {
  await card.hover();
  const button = card.locator('[data-testid^="project-menu-button-"]').first();
  await button.click({ force: true });
}

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, '01-projects-initial.png'), fullPage: true });
  record('打开项目页', page.url().includes('/projects'), page.url());

  const title = `QA 项目 ${Date.now()}`;
  const duplicateTitle = `${title} (副本)`;

  await page.locator('[data-testid="projects-create-button"]').click();
  await page.locator('[data-testid="projects-new-name-input"]').fill(title);
  await page.locator('[data-testid="projects-create-confirm"]').click();
  const createdCard = await waitForCard(title);
  record('可创建新项目', await createdCard.isVisible().catch(() => false), title);

  await createdCard.hover();
  const favoriteButton = createdCard.locator('[data-testid^="project-favorite-"]').first();
  await favoriteButton.click({ force: true });
  await page.waitForTimeout(300);
  record('可收藏项目', (await favoriteButton.getAttribute('aria-label')) === '取消收藏');

  const favoritesFilter = page.locator('[data-testid="projects-filter-favorites"]');
  await favoritesFilter.click();
  await page.waitForTimeout(300);
  record('收藏筛选可显示收藏项目', await page.locator('[data-testid^="project-card-"]', { hasText: title }).first().isVisible().catch(() => false));

  const allFilter = page.locator('[data-testid="projects-filter-all"]');
  await allFilter.click();
  await page.waitForTimeout(250);

  const searchInput = page.locator('[data-testid="projects-search-input"]');
  await searchInput.fill(title);
  await page.waitForTimeout(250);
  record('项目搜索可命中新建项目', await page.locator('[data-testid^="project-card-"]', { hasText: title }).first().isVisible().catch(() => false));
  await searchInput.fill('');

  await openProjectMenu(createdCard);
  await createdCard.locator('[data-testid^="project-duplicate-"]').first().click();
  const duplicateCard = await waitForCard(duplicateTitle);
  record('可复制项目', await duplicateCard.isVisible().catch(() => false), duplicateTitle);

  await openProjectMenu(duplicateCard);
  await duplicateCard.locator('[data-testid^="project-delete-"]').first().click();
  await page.locator('[data-testid="projects-delete-confirm"]').click();
  await page.waitForTimeout(600);
  record('可删除复制项目', await page.locator('[data-testid^="project-card-"]', { hasText: duplicateTitle }).count() === 0, duplicateTitle);

  await openProjectMenu(createdCard);
  await createdCard.locator('[data-testid^="project-delete-"]').first().click();
  await page.locator('[data-testid="projects-delete-confirm"]').click();
  await page.waitForTimeout(600);
  record('可删除新建项目', await page.locator('[data-testid^="project-card-"]', { hasText: title }).count() === 0, title);

  await page.screenshot({ path: path.join(outDir, '02-projects-final.png'), fullPage: true });
} catch (error) {
  record('项目自动化脚本执行', false, error instanceof Error ? error.message : String(error));
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
  '# Projects QA Report',
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
