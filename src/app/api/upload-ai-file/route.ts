import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { isLaomandiProvider } from '@/lib/ai-providers';
import {
    AI_UPSTREAM_TIMEOUT_MS,
    ApiRouteError,
    createAiHeaders,
    createUpstreamConnectionError,
    getApiErrorMessage,
    getErrorMessage,
    getNestedValue,
    handleApiRouteError,
    resolveRequestOrigin,
    resolveAiServiceConfig,
} from '../_shared/ai-service';

const LAOMANDI_ASSET_BASE_URL = 'https://api.laomandi.com';
const PURPOSE_FALLBACK = 'assistants';
const LAOMANDI_ASSET_POLL_INTERVAL_MS = 2_000;
const LAOMANDI_ASSET_ACTIVE_TIMEOUT_MS = 120_000;
const PUBLIC_BASE_URL_ENV_KEYS = [
    'OPENLOVART_PUBLIC_BASE_URL',
    'LOVART_PUBLIC_BASE_URL',
    'NEXT_PUBLIC_OPENLOVART_PUBLIC_BASE_URL',
] as const;
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

type LaomandiAssetType = 'Image' | 'Video' | 'Audio';

type UploadAttempt = {
    endpoint: string;
    purpose: string | null;
};

type UpstreamUploadPayload = {
    data: Record<string, unknown>;
    rawText: string;
};

type PersistedReferenceAsset = {
    id: string;
    filename: string;
    contentType: string;
    bytes: number;
};

type PersistedReferenceAssetMetadata = PersistedReferenceAsset & {
    createdAt: string;
};

export async function GET(request: NextRequest) {
    try {
        const assetId = request.nextUrl.searchParams.get('asset');
        if (!assetId || !isReferenceAssetId(assetId)) {
            return NextResponse.json({ error: '无效的素材地址' }, { status: 400 });
        }

        const asset = await readPersistedReferenceAsset(assetId);
        if (!asset) {
            return NextResponse.json({ error: '素材文件不存在或已过期' }, { status: 404 });
        }

        return new NextResponse(new Uint8Array(asset.data), {
            headers: {
                'Content-Type': asset.metadata.contentType,
                'Content-Length': asset.data.byteLength.toString(),
                'Content-Disposition': `inline; filename="${encodeURIComponent(sanitizeFilename(asset.metadata.filename))}"`,
                'Cache-Control': 'public, max-age=3600',
            },
        });
    } catch (error: unknown) {
        console.error('[upload-ai-file] Serve asset error:', getErrorMessage(error));
        return handleApiRouteError(error, '读取参考素材失败', 'upload-ai-file');
    }
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');

        if (!(file instanceof File)) {
            return NextResponse.json({ error: '缺少上传文件' }, { status: 400 });
        }

        if (file.size <= 0) {
            return NextResponse.json({ error: '上传文件为空' }, { status: 400 });
        }

        const { providerId, apiKey, baseUrl } = resolveAiServiceConfig(request);

        if (isLaomandiProvider(providerId)) {
            return await uploadLaomandiReferenceAsset(request, file, apiKey);
        }

        const attempts = buildUploadAttempts(providerId, baseUrl);
        const failures: string[] = [];

        for (const attempt of attempts) {
            let response: Response;

            try {
                response = await fetch(attempt.endpoint, {
                    method: 'POST',
                    headers: createAiHeaders(apiKey),
                    body: createUploadFormData(file, attempt.purpose),
                    signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
                        ? AbortSignal.timeout(AI_UPSTREAM_TIMEOUT_MS.submit)
                        : undefined,
                });
            } catch (error: unknown) {
                throw createUpstreamConnectionError(attempt.endpoint, error);
            }

            const { data, rawText } = await readUpstreamUploadPayload(response);

            if (!response.ok) {
                const fallbackMessage = normalizeRawUploadErrorText(rawText) || `HTTP ${response.status}`;
                const message = getApiErrorMessage(data, fallbackMessage);
                failures.push(`${describeAttempt(attempt)}: ${message}`);
                continue;
            }

            const reference = resolveUploadedReference(data);

            if (reference) {
                return NextResponse.json({
                    reference,
                    filename: file.name,
                    mimeType: file.type || undefined,
                    bytes: file.size,
                });
            }

            console.error('[upload-ai-file] Invalid upstream response:', JSON.stringify(data));
            failures.push(`${describeAttempt(attempt)}: 上传成功，但未获取到可用素材地址`);
        }

        throw new ApiRouteError(
            '上传参考素材失败',
            502,
            failures.length > 0 ? failures.join('；') : '上游文件上传服务未返回可用素材地址',
        );
    } catch (error: unknown) {
        console.error('[upload-ai-file] Error:', getErrorMessage(error));
        return handleApiRouteError(error, '上传参考素材失败', 'upload-ai-file');
    }
}

async function uploadLaomandiReferenceAsset(request: NextRequest, file: File, apiKey: string) {
    const assetType = resolveLaomandiAssetType(file);
    const publicBaseUrl = resolvePublicReferenceBaseUrl(request);
    const persistedAsset = await persistReferenceAsset(file);
    const assetUrl = buildPersistedReferenceAssetUrl(publicBaseUrl, persistedAsset.id);
    const groupId = await resolveLaomandiAssetGroupId(apiKey);
    const createdAsset = await createLaomandiAsset(apiKey, {
        groupId,
        url: assetUrl,
        name: truncateAssetName(file.name),
        assetType,
    });
    const assetId = resolveLaomandiPayloadId(createdAsset);

    if (!assetId) {
        throw new ApiRouteError('上传参考素材失败', 502, `Laomandi CreateAsset 未返回素材 Id: ${JSON.stringify(createdAsset)}`);
    }

    await waitForLaomandiAssetActive(apiKey, assetId);

    return NextResponse.json({
        reference: `asset://${assetId}`,
        filename: file.name,
        mimeType: file.type || undefined,
        bytes: file.size,
    });
}

function resolvePublicReferenceBaseUrl(request: NextRequest): string {
    const configuredBaseUrl = PUBLIC_BASE_URL_ENV_KEYS
        .map((key) => process.env[key]?.trim())
        .find((value): value is string => !!value);
    const candidate = configuredBaseUrl || resolveRequestOrigin(request.headers, request.nextUrl.origin);

    let parsedUrl: URL;

    try {
        parsedUrl = new URL(candidate);
    } catch {
        throw new ApiRouteError('上传参考素材失败', 500, `公开访问地址无效: ${candidate}`);
    }

    if (parsedUrl.protocol !== 'https:') {
        throw new ApiRouteError(
            '上传参考素材失败',
            400,
            'Laomandi 素材 API 需要先让当前 OpenLovart 服务具备 HTTPS 公网访问地址。请通过 OPENLOVART_PUBLIC_BASE_URL 配置可被外网访问的域名或隧道地址。',
        );
    }

    if (isLocalOrPrivateHostname(parsedUrl.hostname)) {
        throw new ApiRouteError(
            '上传参考素材失败',
            400,
            'Laomandi CreateAsset 只接收公共可访问素材 URL，localhost/内网地址无法被上游拉取。请通过 OPENLOVART_PUBLIC_BASE_URL 配置 HTTPS 公网域名或隧道地址。',
        );
    }

    parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, '');
    parsedUrl.search = '';
    parsedUrl.hash = '';
    return parsedUrl.toString().replace(/\/+$/, '');
}

function buildPersistedReferenceAssetUrl(publicBaseUrl: string, assetId: string): string {
    const url = new URL('/api/upload-ai-file', `${publicBaseUrl}/`);
    url.searchParams.set('asset', assetId);
    return url.toString();
}

async function resolveLaomandiAssetGroupId(apiKey: string): Promise<string> {
    const cachedGroupId = await readCachedLaomandiAssetGroupId(apiKey);
    if (cachedGroupId) {
        return cachedGroupId;
    }

    const payload = await postLaomandiAssetJson(apiKey, '/asset/CreateAssetGroup', {
        Name: 'OpenLovart Reference Assets',
        Description: 'Reference media uploaded by OpenLovart for Seedance video generation.',
    });
    const groupId = resolveLaomandiPayloadId(payload);

    if (!groupId) {
        throw new ApiRouteError('上传参考素材失败', 502, `Laomandi CreateAssetGroup 未返回素材组 Id: ${JSON.stringify(payload)}`);
    }

    await writeCachedLaomandiAssetGroupId(apiKey, groupId);
    return groupId;
}

async function createLaomandiAsset(
    apiKey: string,
    params: { groupId: string; url: string; name: string; assetType: LaomandiAssetType },
): Promise<Record<string, unknown>> {
    return await postLaomandiAssetJson(apiKey, '/asset/CreateAsset', {
        GroupId: params.groupId,
        URL: params.url,
        Name: params.name,
        AssetType: params.assetType,
    });
}

async function waitForLaomandiAssetActive(apiKey: string, assetId: string): Promise<void> {
    const startedAt = Date.now();
    let lastStatus = 'Processing';
    let lastError: unknown = null;

    while (Date.now() - startedAt <= LAOMANDI_ASSET_ACTIVE_TIMEOUT_MS) {
        const payload = await postLaomandiAssetJson(apiKey, '/asset/GetAsset', { Id: assetId });
        const status = getStringValue(payload, 'Status') ?? getStringValue(payload, 'data', 'Status') ?? getStringValue(payload, 'status');
        lastStatus = status || lastStatus;
        lastError = getNestedValue(payload, 'Error') ?? getNestedValue(payload, 'data', 'Error') ?? null;

        if (lastStatus === 'Active') {
            return;
        }

        if (lastStatus === 'Failed') {
            throw new ApiRouteError(
                '上传参考素材失败',
                502,
                `Laomandi 素材预处理失败: ${lastError ? JSON.stringify(lastError) : JSON.stringify(payload)}`,
            );
        }

        await delay(LAOMANDI_ASSET_POLL_INTERVAL_MS);
    }

    throw new ApiRouteError(
        '上传参考素材失败',
        504,
        `Laomandi 素材仍在预处理，超过 ${Math.round(LAOMANDI_ASSET_ACTIVE_TIMEOUT_MS / 1000)} 秒未变为 Active。当前状态: ${lastStatus}`,
    );
}

async function postLaomandiAssetJson(
    apiKey: string,
    pathname: string,
    body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const endpoint = `${LAOMANDI_ASSET_BASE_URL}${pathname}`;
    let response: Response;

    try {
        response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'sd-key': apiKey,
            },
            body: JSON.stringify(body),
            signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
                ? AbortSignal.timeout(AI_UPSTREAM_TIMEOUT_MS.submit)
                : undefined,
        });
    } catch (error: unknown) {
        throw createUpstreamConnectionError(endpoint, error);
    }

    const { data, rawText } = await readUpstreamUploadPayload(response);

    if (!response.ok) {
        const fallbackMessage = normalizeRawUploadErrorText(rawText) || `HTTP ${response.status}`;
        throw new ApiRouteError('上传参考素材失败', 502, `${endpoint}: ${getApiErrorMessage(data, fallbackMessage)}`);
    }

    return data;
}

function createUploadFormData(file: File, purpose: string | null): FormData {
    const formData = new FormData();
    formData.append('file', file, file.name);
    if (purpose) {
        formData.append('purpose', purpose);
    }
    return formData;
}

function buildUploadAttempts(providerId: unknown, baseUrl: string): UploadAttempt[] {
    const endpoints = resolveUploadEndpoints(providerId, baseUrl);
    return endpoints.flatMap((endpoint) => [
        { endpoint, purpose: null },
        { endpoint, purpose: PURPOSE_FALLBACK },
    ]);
}

function resolveUploadEndpoints(providerId: unknown, baseUrl: string): string[] {
    const endpoints = new Set<string>();
    const uploadBaseUrl = isLaomandiProvider(providerId) && isArkOfficialBaseUrl(baseUrl)
        ? LAOMANDI_ASSET_BASE_URL
        : baseUrl;

    endpoints.add(buildFilesEndpoint(uploadBaseUrl));

    if (isLaomandiProvider(providerId) && uploadBaseUrl !== LAOMANDI_ASSET_BASE_URL) {
        endpoints.add(buildFilesEndpoint(LAOMANDI_ASSET_BASE_URL));
    }

    return [...endpoints];
}

function buildFilesEndpoint(baseUrl: string): string {
    const parsedUrl = new URL(baseUrl);
    const pathname = parsedUrl.pathname.replace(/\/+$/, '');
    parsedUrl.pathname = pathname.endsWith('/v1') ? `${pathname}/files` : `${pathname}/v1/files`;
    parsedUrl.search = '';
    parsedUrl.hash = '';
    return parsedUrl.toString();
}

function isArkOfficialBaseUrl(baseUrl: string): boolean {
    try {
        return new URL(baseUrl).hostname.toLowerCase() === 'ark.cn-beijing.volces.com';
    } catch {
        return false;
    }
}

async function readUpstreamUploadPayload(response: Response): Promise<UpstreamUploadPayload> {
    const rawText = await response.text();
    if (!rawText.trim()) {
        return { data: {}, rawText: '' };
    }

    try {
        const parsed = JSON.parse(rawText) as unknown;
        return {
            data: parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {},
            rawText,
        };
    } catch {
        return { data: {}, rawText };
    }
}

function resolveUploadedReference(data: Record<string, unknown>): string | null {
    const rawUrl = getNestedValue(data, 'url')
        ?? getNestedValue(data, 'data', 'url')
        ?? getNestedValue(data, 'file', 'url')
        ?? getNestedValue(data, 'data', 'file', 'url')
        ?? getNestedValue(data, 'result', 'url');
    const rawId = getNestedValue(data, 'id')
        ?? getNestedValue(data, 'data', 'id')
        ?? getNestedValue(data, 'file', 'id')
        ?? getNestedValue(data, 'data', 'file', 'id')
        ?? getNestedValue(data, 'file_id')
        ?? getNestedValue(data, 'data', 'file_id');

    if (typeof rawUrl === 'string' && rawUrl.trim()) {
        return rawUrl.trim();
    }

    if (typeof rawId === 'string' && rawId.trim()) {
        return `asset://${rawId.trim()}`;
    }

    return null;
}

function normalizeRawUploadErrorText(rawText: string): string {
    const normalized = rawText.trim();
    return normalized === '{}' ? '' : normalized;
}

function describeAttempt(attempt: UploadAttempt): string {
    const purposeSuffix = attempt.purpose ? ` purpose=${attempt.purpose}` : ' 默认上传';
    return `${attempt.endpoint}${purposeSuffix}`;
}

function resolveLaomandiAssetType(file: File): LaomandiAssetType {
    const mimeType = file.type.toLowerCase();
    const extension = path.extname(file.name).toLowerCase();

    if (mimeType.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.gif', '.heic', '.heif'].includes(extension)) {
        return 'Image';
    }

    if (mimeType.startsWith('video/') || ['.mp4', '.mov'].includes(extension)) {
        return 'Video';
    }

    if (mimeType.startsWith('audio/') || ['.wav', '.mp3'].includes(extension)) {
        return 'Audio';
    }

    throw new ApiRouteError('上传参考素材失败', 400, 'Laomandi 素材 API 仅支持图片、mp4/mov 视频、wav/mp3 音频作为参考素材。');
}

async function persistReferenceAsset(file: File): Promise<PersistedReferenceAsset> {
    const id = crypto.randomUUID();
    const directory = getReferenceUploadDirectory();
    const dataPath = getReferenceAssetDataPath(id);
    const metadataPath = getReferenceAssetMetadataPath(id);
    const data = Buffer.from(await file.arrayBuffer());
    const metadata: PersistedReferenceAssetMetadata = {
        id,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        bytes: data.byteLength,
        createdAt: new Date().toISOString(),
    };

    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(dataPath, data);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');

    return {
        id,
        filename: metadata.filename,
        contentType: metadata.contentType,
        bytes: metadata.bytes,
    };
}

async function readPersistedReferenceAsset(assetId: string): Promise<{ metadata: PersistedReferenceAssetMetadata; data: Buffer } | null> {
    try {
        const [metadataText, data] = await Promise.all([
            fs.readFile(getReferenceAssetMetadataPath(assetId), 'utf8'),
            fs.readFile(getReferenceAssetDataPath(assetId)),
        ]);
        const metadata = JSON.parse(metadataText) as PersistedReferenceAssetMetadata;
        return { metadata, data };
    } catch {
        return null;
    }
}

async function readCachedLaomandiAssetGroupId(apiKey: string): Promise<string | null> {
    try {
        const text = await fs.readFile(getLaomandiAssetGroupCachePath(apiKey), 'utf8');
        const parsed = JSON.parse(text) as { groupId?: unknown };
        return typeof parsed.groupId === 'string' && parsed.groupId.trim() ? parsed.groupId.trim() : null;
    } catch {
        return null;
    }
}

async function writeCachedLaomandiAssetGroupId(apiKey: string, groupId: string): Promise<void> {
    const cachePath = getLaomandiAssetGroupCachePath(apiKey);
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify({ groupId, createdAt: new Date().toISOString() }, null, 2), 'utf8');
}

function getReferenceRuntimeDirectory(): string {
    return process.env.OPENLOVART_REFERENCE_UPLOAD_DIR?.trim() || path.join(process.cwd(), '.runtime', 'reference-uploads');
}

function getReferenceUploadDirectory(): string {
    return path.join(getReferenceRuntimeDirectory(), 'files');
}

function getReferenceAssetDataPath(assetId: string): string {
    return path.join(getReferenceUploadDirectory(), `${assetId}.bin`);
}

function getReferenceAssetMetadataPath(assetId: string): string {
    return path.join(getReferenceUploadDirectory(), `${assetId}.json`);
}

function getLaomandiAssetGroupCachePath(apiKey: string): string {
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
    return path.join(getReferenceRuntimeDirectory(), 'laomandi', `${keyHash}.json`);
}

function resolveLaomandiPayloadId(payload: Record<string, unknown>): string | null {
    return getStringValue(payload, 'Id')
        ?? getStringValue(payload, 'id')
        ?? getStringValue(payload, 'data', 'Id')
        ?? getStringValue(payload, 'data', 'id');
}

function getStringValue(payload: unknown, ...pathSegments: string[]): string | null {
    const value = getNestedValue(payload, ...pathSegments);
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function truncateAssetName(filename: string): string {
    const sanitized = sanitizeFilename(filename);
    return sanitized.length > 64 ? sanitized.slice(0, 64) : sanitized;
}

function sanitizeFilename(filename: string): string {
    const trimmed = filename.trim();
    return trimmed.replace(/[\\/:*?"<>|\r\n]+/g, '_') || 'reference-media';
}

function isReferenceAssetId(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isLocalOrPrivateHostname(hostname: string): boolean {
    const normalized = hostname.toLowerCase();
    if (LOCAL_HOSTNAMES.has(normalized)) {
        return true;
    }

    if (/^10\.\d+\.\d+\.\d+$/.test(normalized) || /^192\.168\.\d+\.\d+$/.test(normalized)) {
        return true;
    }

    const private172Match = /^172\.(\d+)\.\d+\.\d+$/.exec(normalized);
    if (private172Match) {
        const secondOctet = Number.parseInt(private172Match[1] || '', 10);
        return secondOctet >= 16 && secondOctet <= 31;
    }

    return normalized.endsWith('.local') || normalized.endsWith('.lan') || normalized.endsWith('.internal');
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
