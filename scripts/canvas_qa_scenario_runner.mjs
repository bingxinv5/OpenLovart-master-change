import { spawnSync } from 'node:child_process';

export function runCanvasQaScenario(name, phases) {
  const phaseArg = `--phases=${phases.join(',')}`;
  const outDirArg = `--out-dir=artifacts/canvas-qa/${name}`;
  const result = spawnSync(process.execPath, ['scripts/canvas_qa.mjs', phaseArg, outDirArg], {
    stdio: 'inherit',
    env: process.env,
  });

  if (typeof result.status === 'number') {
    process.exitCode = result.status;
  } else if (result.error) {
    throw result.error;
  } else {
    process.exitCode = 1;
  }
}
