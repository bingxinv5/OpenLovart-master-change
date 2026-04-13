import { spawnSync } from 'node:child_process';

const baseUrl = process.env.CANVAS_QA_BASE_URL || 'http://127.0.0.1:3000/canvas';
const benchmarkUrl = baseUrl.includes('?') ? `${baseUrl}&bench=1` : `${baseUrl}?bench=1`;

const result = spawnSync(process.execPath, [
  'scripts/canvas_qa.mjs',
  '--phases=bootstrap,benchmark-panel',
  '--out-dir=artifacts/canvas-qa/benchmark',
], {
  stdio: 'inherit',
  env: {
    ...process.env,
    CANVAS_QA_BASE_URL: benchmarkUrl,
  },
});

if (typeof result.status === 'number') {
  process.exitCode = result.status;
} else if (result.error) {
  throw result.error;
} else {
  process.exitCode = 1;
}
