/**
 * generation-persistence.ts — 生成任务的 sessionStorage 持久化
 *
 * 解决的问题：
 * 用户在生成进行中离开画布页面再回来时，生成状态丢失。
 * 原因是 IndexedDB 写入是异步的，组件卸载时的 fire-and-forget 保存可能来不及完成。
 *
 * 方案：
 * 1. 每当生成任务状态变化时，同步写入 sessionStorage（微秒级，无竞态风险）。
 * 2. 在 API 请求发起前就记录"提交中"状态（含 prompt/model 等参数）。
 * 3. 重新加载画布时，从 sessionStorage 恢复未完成的生成任务：
 *    - 有 taskId → 直接恢复轮询
 *    - 无 taskId（提交被中断）→ 自动重新发起生成请求
 */

const STORAGE_KEY = 'lovart_active_generations';
const SUBMISSION_KEY = 'lovart_pending_submissions';

export interface PendingGeneration {
    taskId: string;
    taskType: 'image' | 'video';
    progress: number;
    savedPrompt?: string;
}

export interface PendingSubmission {
    prompt: string;
    model: string;
    aspectRatio: string;
    imageSize: string;
    generateCount?: number;
    taskType: 'image' | 'video';
    duration?: string;
    timestamp: number;
}

type GenerationMap = Record<string, PendingGeneration>; // elementId → task info
type ProjectGenerations = Record<string, GenerationMap>; // projectId → elements
type SubmissionMap = Record<string, PendingSubmission>; // elementId → submission
type ProjectSubmissions = Record<string, SubmissionMap>; // projectId → elements

// ── 读写底层 ──────────────────────────────────────────

function readAll(): ProjectGenerations {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function writeAll(data: ProjectGenerations): void {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
        // sessionStorage 满了或不可用，静默忽略
    }
}

function readSubmissions(): ProjectSubmissions {
    try {
        const raw = sessionStorage.getItem(SUBMISSION_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function writeSubmissions(data: ProjectSubmissions): void {
    try {
        sessionStorage.setItem(SUBMISSION_KEY, JSON.stringify(data));
    } catch {
        // sessionStorage 满了或不可用，静默忽略
    }
}

// ── Generation（已获 taskId）公共 API ────────────────────

/**
 * 保存/更新一个生成任务（同步）
 */
export function persistGeneration(
    projectId: string,
    elementId: string,
    task: PendingGeneration,
): void {
    const all = readAll();
    if (!all[projectId]) all[projectId] = {};
    all[projectId][elementId] = task;
    writeAll(all);
}

/**
 * 更新生成进度（同步）
 */
export function persistGenerationProgress(
    projectId: string,
    elementId: string,
    progress: number,
): void {
    const all = readAll();
    const entry = all[projectId]?.[elementId];
    if (entry) {
        entry.progress = progress;
        writeAll(all);
    }
}

/**
 * 移除一个已完成/失败的生成任务（同步）
 */
export function removeGeneration(
    projectId: string,
    elementId: string,
): void {
    const all = readAll();
    if (all[projectId]) {
        delete all[projectId][elementId];
        if (Object.keys(all[projectId]).length === 0) {
            delete all[projectId];
        }
        writeAll(all);
    }
}

/**
 * 读取某个项目所有未完成的生成任务
 */
export function loadPendingGenerations(
    projectId: string,
): GenerationMap {
    const all = readAll();
    return all[projectId] || {};
}

/**
 * 清除某个项目的所有生成记录
 */
export function clearProjectGenerations(projectId: string): void {
    const all = readAll();
    delete all[projectId];
    writeAll(all);
}

/**
 * 清除某个项目的所有提交记录
 */
export function clearProjectSubmissions(projectId: string): void {
    const all = readSubmissions();
    delete all[projectId];
    writeSubmissions(all);
}

/**
 * 批量同步：以当前元素列表为准，将所有活跃生成任务写入 sessionStorage
 */
export function syncGenerationsFromElements<T extends {
    id: string;
    generatingTaskId?: string;
    generatingTaskType?: 'image' | 'video';
    generatingProgress?: number;
    savedPrompt?: string;
}>(
    projectId: string,
    elements: T[],
): void {
    const existingProjectMap = readAll()[projectId] || {};
    const liveElementIds = new Set(elements.map((el) => el.id));
    const map: GenerationMap = {};
    for (const el of elements) {
        if (el.generatingTaskId && el.generatingTaskId !== 'ai-editing') {
            map[el.id] = {
                taskId: el.generatingTaskId,
                taskType: el.generatingTaskType || 'image',
                progress: el.generatingProgress || 0,
                savedPrompt: el.savedPrompt,
            };
        }
    }

    // 页面刷新/卸载瞬间，某些会话级生成状态可能尚未回流到当前元素快照。
    // 对仍然存在于当前画布里的元素，保留已有的 sessionStorage 记录，避免误清空。
    for (const [elementId, task] of Object.entries(existingProjectMap)) {
        if (!map[elementId] && liveElementIds.has(elementId)) {
            map[elementId] = task;
        }
    }

    const all = readAll();
    if (Object.keys(map).length === 0) {
        delete all[projectId];
    } else {
        all[projectId] = map;
    }
    writeAll(all);
}

// ── Submission（API 请求发起前）公共 API ─────────────────

/**
 * 记录一个生成提交（在 API 请求发起之前调用）
 */
export function persistSubmission(
    projectId: string,
    elementId: string,
    params: PendingSubmission,
): void {
    const all = readSubmissions();
    if (!all[projectId]) all[projectId] = {};
    all[projectId][elementId] = params;
    writeSubmissions(all);
}

/**
 * 清除一个提交记录（API 返回后或重试完成后调用）
 */
export function clearSubmission(
    projectId: string,
    elementId: string,
): void {
    const all = readSubmissions();
    if (all[projectId]) {
        delete all[projectId][elementId];
        if (Object.keys(all[projectId]).length === 0) {
            delete all[projectId];
        }
        writeSubmissions(all);
    }
}

/**
 * 读取某个项目所有待处理的提交
 */
export function loadPendingSubmissions(
    projectId: string,
): SubmissionMap {
    return readSubmissions()[projectId] || {};
}
