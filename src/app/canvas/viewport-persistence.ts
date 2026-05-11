import { clampCanvasScale } from '@/components/lovart/canvas-viewport-utils';

/**
 * viewport-persistence.ts — 画布视口状态的 localStorage 持久化
 *
 * 解决的问题：
 * 用户在画布中平移/缩放到某个位置后，返回项目列表再进入同一项目时，
 * 视口位置会重置到原点(0,0)/100%。
 *
 * 方案：
 * 1. 每当 scale/pan 变化时，同步写入 localStorage（按 projectId 隔离）。
 * 2. 组件卸载和 beforeunload 时也会写入，确保不丢失。
 * 3. 重新加载画布时，从 localStorage 恢复上次的视口位置。
 *
 * 使用 localStorage：关闭浏览器后重新打开仍能恢复到上次的视口位置。
 */

const STORAGE_KEY = 'lovart_viewport_state';

export interface ViewportState {
  scale: number;
  panX: number;
  panY: number;
}

type ProjectViewports = Record<string, ViewportState>; // projectId → viewport

// ── 读写底层 ──────────────────────────────────────────

function readAll(): ProjectViewports {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
} 

function writeAll(data: ProjectViewports): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage 满了或不可用，静默忽略
  }
}

// ── Public API ────────────────────────────────────────

/**
 * 保存当前视口状态到 sessionStorage
 */
export function saveViewportState(
  projectId: string,
  scale: number,
  pan: { x: number; y: number },
): void {
  const all = readAll();
  all[projectId] = { scale: clampCanvasScale(scale), panX: pan.x, panY: pan.y };
  writeAll(all);
}

/**
 * 从 sessionStorage 恢复视口状态
 * @returns ViewportState 或 null（无保存记录时）
 */
export function loadViewportState(projectId: string): ViewportState | null {
  const all = readAll();
  const state = all[projectId];
  if (!state) return null;

  // 基本合理性校验
  if (
    typeof state.scale !== 'number' ||
    typeof state.panX !== 'number' ||
    typeof state.panY !== 'number' ||
    !isFinite(state.scale) ||
    !isFinite(state.panX) ||
    !isFinite(state.panY) ||
    state.scale <= 0 ||
    state.scale > 20
  ) {
    return null;
  }

  return { ...state, scale: clampCanvasScale(state.scale) };
}

/**
 * 清除某个项目的视口状态（项目删除时调用）
 */
export function clearViewportState(projectId: string): void {
  const all = readAll();
  delete all[projectId];
  writeAll(all);
}
