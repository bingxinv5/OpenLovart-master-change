import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const workbenchImagePath = path.join(workspaceRoot, 'src/components/lovart/WorkbenchImage.tsx');
const imageStorePath = path.join(workspaceRoot, 'src/lib/image-store.ts');

const workbenchImageSource = fs.readFileSync(workbenchImagePath, 'utf8');
const imageStoreSource = fs.readFileSync(imageStorePath, 'utf8');

const checks = [
  {
    name: 'preview 使用实时 canvasScale',
    ok: workbenchImageSource.includes("getPriorityPreviewRequestPixels(previewDisplayPixels, canvasScale)")
      && workbenchImageSource.includes("getPreviewRequestPixels(previewDisplayPixels, canvasScale)"),
  },
  {
    name: 'final 继续使用 stableCanvasScale',
    ok: workbenchImageSource.includes("getPriorityFinalRequestPixels(finalDisplayPixels, stableCanvasScale)")
      && workbenchImageSource.includes("getFinalRequestPixels(finalDisplayPixels, stableCanvasScale)"),
  },
  {
    name: 'priority final 在极低缩放时提升到 512',
    ok: /if \(canvasScale <= 0\.12\) \{\s*return 512;\s*\}/m.test(workbenchImageSource),
  },
  {
    name: 'promotion 时重排 LOD 缓存优先级',
    ok: workbenchImageSource.includes('reprioritizeImageLodCache(')
      && imageStoreSource.includes('export function reprioritizeImageLodCache(')
      && imageStoreSource.includes('function demoteLRU(id: string): void'),
  },
];

let failed = 0;
for (const check of checks) {
  if (check.ok) {
    console.log(`PASS: ${check.name}`);
  } else {
    failed += 1;
    console.log(`FAIL: ${check.name}`);
  }
}

if (failed > 0) {
  console.log(`SUMMARY: ${checks.length - failed}/${checks.length} passed`);
  process.exitCode = 1;
} else {
  console.log(`SUMMARY: ${checks.length}/${checks.length} passed`);
}