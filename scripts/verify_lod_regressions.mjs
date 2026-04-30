import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const workbenchImagePath = path.join(workspaceRoot, 'src/components/lovart/WorkbenchImage.tsx');
const canvasAreaContentLayerPath = path.join(workspaceRoot, 'src/components/lovart/CanvasAreaContentLayer.tsx');
const canvasElementRendererPath = path.join(workspaceRoot, 'src/components/lovart/CanvasElementRenderer.tsx');
const pointerInteractionPath = path.join(workspaceRoot, 'src/components/lovart/use-canvas-pointer-interaction.ts');
const imageStorePath = path.join(workspaceRoot, 'src/lib/image-store.ts');
const lodRequestUtilsPath = path.join(workspaceRoot, 'src/lib/lod-request-utils.ts');
const globalsCssPath = path.join(workspaceRoot, 'src/app/globals.css');

const workbenchImageSource = fs.readFileSync(workbenchImagePath, 'utf8');
const canvasAreaContentLayerSource = fs.readFileSync(canvasAreaContentLayerPath, 'utf8');
const canvasElementRendererSource = fs.readFileSync(canvasElementRendererPath, 'utf8');
const pointerInteractionSource = fs.readFileSync(pointerInteractionPath, 'utf8');
const imageStoreSource = fs.readFileSync(imageStorePath, 'utf8');
const lodRequestUtilsSource = fs.readFileSync(lodRequestUtilsPath, 'utf8');
const globalsCssSource = fs.readFileSync(globalsCssPath, 'utf8');

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
    ok: /if \(canvasScale <= 0\.12\) \{\s*return 512;\s*\}/m.test(lodRequestUtilsSource),
  },
  {
    name: 'final 升级条件集中在纯函数',
    ok: workbenchImageSource.includes('shouldRequestFinalLod({')
      && lodRequestUtilsSource.includes('export function shouldRequestFinalLod('),
  },
  {
    name: 'priority 图片可绕过普通低缩放 final gate',
    ok: lodRequestUtilsSource.includes('prioritizeDetail || canvasScale > 0.18'),
  },
  {
    name: 'resize 过程中可延后 final 升级',
    ok: workbenchImageSource.includes('deferFinalUpgrade')
      && canvasElementRendererSource.includes('deferFinalUpgrade={deferImageDetailUpgrade}')
      && canvasAreaContentLayerSource.includes('deferImageDetailUpgrade={isResizing && resizingElementId === el.id}'),
  },
  {
    name: 'resize 松手触发一次图片高清请求',
    ok: pointerInteractionSource.includes('requestImageDetailUpgrade(resizedElementId);')
      && canvasAreaContentLayerSource.includes('imageDetailRequestKey={imageDetailRequestVersions[el.id]}')
      && canvasElementRendererSource.includes('detailRequestKey={imageDetailRequestKey}')
      && workbenchImageSource.includes('detailRequestPendingRef.current = true'),
  },
  {
    name: 'promotion 时重排 LOD 缓存优先级',
    ok: workbenchImageSource.includes('reprioritizeImageLodCache(')
      && imageStoreSource.includes('export function reprioritizeImageLodCache(')
      && imageStoreSource.includes('function demoteLRU(id: string): void'),
  },
  {
    name: '高缩放图片默认保持平滑采样',
    ok: globalsCssSource.includes('.workbench-image-hires')
      && globalsCssSource.includes('image-rendering: auto')
      && !globalsCssSource.includes('image-rendering: crisp-edges')
      && !globalsCssSource.includes('image-rendering: -webkit-optimize-contrast'),
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