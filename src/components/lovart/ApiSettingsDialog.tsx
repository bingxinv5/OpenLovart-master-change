'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Settings, Eye, EyeOff, Check, X, Trash2, HardDrive, SlidersHorizontal, Sparkles, User as UserIcon } from 'lucide-react';
import { useUser } from '@/lib/mock-clerk';
import { clearApiSettings, getApiSettings, saveApiSettings, subscribeApiSettingsChange } from '@/lib/api-settings';
import {
    clearCdnCacheDirectory,
    getCdnCacheSettings,
    resetCdnCacheDirectory,
    saveCdnCacheDirectory,
    subscribeCdnCacheSettingsChange,
    type CdnCacheSettings,
} from '@/lib/cache-settings';
import {
    getUpscaleServiceSettings,
    resetUpscaleServiceBaseUrl,
    saveUpscaleServiceBaseUrl,
    subscribeUpscaleServiceSettingsChange,
    type UpscaleServiceSettings,
} from '@/lib/upscale-service-settings';
import {
    DEFAULT_WORKBENCH_SETTINGS,
    VIDEO_DURATION_OPTIONS,
    getAutoSaveDirectoryHandle,
    getStorageEstimateInfo,
    getWorkbenchSettings,
    hasDirectoryPickerSupport,
    requestAutoSaveDirectoryHandle,
    requestPersistentStorage,
    saveWorkbenchSettings,
    subscribeWorkbenchSettingsChange,
    type StorageEstimateInfo,
    type WorkbenchSettings,
} from '@/lib/workbench-settings';
import {
    OPENAI_GPT_IMAGE_PIXEL_SIZES,
    STANDARD_IMAGE_SIZE_OPTIONS,
    isStandardImageSize,
    resolveOpenAiGptImageAspectRatio,
    resolveOpenAiGptImagePixelSize,
} from '@/lib/image-generation-models';

type SettingsTab = 'api' | 'workspace' | 'defaults' | 'account';

type SettingsCenterContentProps = {
    mode?: 'dialog' | 'page';
    onClose?: () => void;
};

function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }
    return `${value >= 100 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function hasCustomWorkbenchSettings(settings: WorkbenchSettings) {
    return JSON.stringify(settings) !== JSON.stringify(DEFAULT_WORKBENCH_SETTINGS);
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
    return (
        <section className="rounded-xl border border-gray-100 bg-white p-5">
            <div className="mb-4">
                <h3 className="text-[13px] font-semibold text-gray-900">{title}</h3>
                <p className="mt-0.5 text-[11px] leading-4 text-gray-400">{description}</p>
            </div>
            <div className="space-y-3">{children}</div>
        </section>
    );
}

function LabeledField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <div className="mb-1 flex items-center justify-between gap-3">
                <span className="text-[12px] font-medium text-gray-600">{label}</span>
                {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
            </div>
            {children}
        </label>
    );
}

function selectClassName() {
    return 'w-full rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2 text-[13px] text-gray-800 outline-none transition focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-gray-900/5';
}

function inputClassName() {
    return 'w-full rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2 text-[13px] text-gray-800 outline-none transition focus:border-gray-300 focus:bg-white focus:ring-2 focus:ring-gray-900/5';
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : '操作失败，请稍后重试';
}

export function SettingsCenterContent({ mode = 'dialog', onClose }: SettingsCenterContentProps) {
    const { user } = useUser();
    const [activeTab, setActiveTab] = useState<SettingsTab>('workspace');
    const [baseUrl, setBaseUrl] = useState(() => getApiSettings().baseUrl);
    const [apiKey, setApiKey] = useState(() => getApiSettings().apiKey);
    const [showKey, setShowKey] = useState(false);
    const [settings, setSettings] = useState<WorkbenchSettings>(() => getWorkbenchSettings());
    const [saved, setSaved] = useState(false);
    const [storageEstimate, setStorageEstimate] = useState<StorageEstimateInfo | null>(null);
    const [hasAutoSaveDirectory, setHasAutoSaveDirectory] = useState(false);
    const [cdnCacheSettings, setCdnCacheSettings] = useState<CdnCacheSettings | null>(null);
    const [cdnCacheDirectoryInput, setCdnCacheDirectoryInput] = useState('');
    const [cdnCacheLoading, setCdnCacheLoading] = useState(true);
    const [cdnCacheSaving, setCdnCacheSaving] = useState(false);
    const [cdnCacheClearing, setCdnCacheClearing] = useState(false);
    const [cdnCacheMessage, setCdnCacheMessage] = useState('');
    const [cdnCacheError, setCdnCacheError] = useState('');
    const [upscaleServiceSettings, setUpscaleServiceSettings] = useState<UpscaleServiceSettings | null>(null);
    const [upscaleServiceBaseUrlInput, setUpscaleServiceBaseUrlInput] = useState('');
    const [upscaleServiceLoading, setUpscaleServiceLoading] = useState(true);
    const [upscaleServiceSaving, setUpscaleServiceSaving] = useState(false);
    const [upscaleServiceRefreshing, setUpscaleServiceRefreshing] = useState(false);
    const [upscaleServiceMessage, setUpscaleServiceMessage] = useState('');
    const [upscaleServiceError, setUpscaleServiceError] = useState('');

    const applyCdnCacheSettings = (nextSettings: CdnCacheSettings) => {
        setCdnCacheSettings(nextSettings);
        setCdnCacheDirectoryInput(nextSettings.configuredDirectory ?? '');
    };

    const applyUpscaleServiceSettings = (nextSettings: UpscaleServiceSettings) => {
        setUpscaleServiceSettings(nextSettings);
        setUpscaleServiceBaseUrlInput(nextSettings.configuredBaseUrl ?? '');
    };

    const showSavedState = () => {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1800);
    };

    useEffect(() => {
        let isDisposed = false;

        void getStorageEstimateInfo().then((nextEstimate) => {
            if (!isDisposed) {
                setStorageEstimate(nextEstimate);
            }
        });

        void getAutoSaveDirectoryHandle().then((handle) => {
            if (!isDisposed) {
                setHasAutoSaveDirectory(!!handle);
            }
        });

        void getCdnCacheSettings()
            .then((nextSettings) => {
                if (isDisposed) return;
                applyCdnCacheSettings(nextSettings);
                setCdnCacheError('');
            })
            .catch((error: unknown) => {
                if (isDisposed) return;
                setCdnCacheError(getErrorMessage(error));
            })
            .finally(() => {
                if (!isDisposed) {
                    setCdnCacheLoading(false);
                }
            });

        void getUpscaleServiceSettings()
            .then((nextSettings) => {
                if (isDisposed) return;
                applyUpscaleServiceSettings(nextSettings);
                setUpscaleServiceError('');
            })
            .catch((error: unknown) => {
                if (isDisposed) return;
                setUpscaleServiceError(getErrorMessage(error));
            })
            .finally(() => {
                if (!isDisposed) {
                    setUpscaleServiceLoading(false);
                }
            });

        return () => {
            isDisposed = true;
        };
    }, []);

    const tabs = useMemo(() => ([
        { key: 'workspace' as const, label: '工作台', icon: HardDrive },
        { key: 'defaults' as const, label: '生成默认值', icon: Sparkles },
        { key: 'api' as const, label: 'API', icon: SlidersHorizontal },
        { key: 'account' as const, label: '账户', icon: UserIcon },
    ]), []);

    const isOpenAiGptImageDefaultModel = settings.imageDefaults.model === 'gpt-image-2';
    const imageDefaultAspectRatioOptions = ['auto', '1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '4:5', '5:4', '21:9'];
    const imageDefaultSizeOptions = isOpenAiGptImageDefaultModel
        ? [...OPENAI_GPT_IMAGE_PIXEL_SIZES]
        : [...STANDARD_IMAGE_SIZE_OPTIONS];
    const derivedOpenAiGptImageDefaultAspectRatio = resolveOpenAiGptImageAspectRatio(settings.imageDefaults.imageSize, settings.imageDefaults.aspectRatio);

    const hasCustomSettings = !!baseUrl || !!apiKey || hasCustomWorkbenchSettings(settings) || !!cdnCacheSettings?.isCustomDirectory || !!upscaleServiceSettings?.isCustomBaseUrl;

    const handleSave = () => {
        saveApiSettings({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim() });
        saveWorkbenchSettings(settings);
        showSavedState();
    };

    const handleReset = async () => {
        clearApiSettings();
        setBaseUrl('');
        setApiKey('');
        setSettings(DEFAULT_WORKBENCH_SETTINGS);
        saveWorkbenchSettings(DEFAULT_WORKBENCH_SETTINGS);

        try {
            const nextSettings = await resetCdnCacheDirectory();
            applyCdnCacheSettings(nextSettings);
            setCdnCacheMessage('已恢复默认缓存目录');
            setCdnCacheError('');
        } catch (error: unknown) {
            setCdnCacheError(getErrorMessage(error));
            setCdnCacheMessage('');
        }

        try {
            const nextSettings = await resetUpscaleServiceBaseUrl();
            applyUpscaleServiceSettings(nextSettings);
            setUpscaleServiceMessage('已恢复默认 Upscayl 服务地址');
            setUpscaleServiceError('');
        } catch (error: unknown) {
            setUpscaleServiceError(getErrorMessage(error));
            setUpscaleServiceMessage('');
        }

        showSavedState();
    };

    const handleToggleAutoSave = async () => {
        let nextAutoSave = !settings.autoSaveGenerated;
        if (nextAutoSave && hasDirectoryPickerSupport()) {
            try {
                const handle = await requestAutoSaveDirectoryHandle();
                setHasAutoSaveDirectory(!!handle);
            } catch {
                nextAutoSave = true;
            }
        }
        setSettings((prev) => ({ ...prev, autoSaveGenerated: nextAutoSave }));
    };

    const handleChooseDirectory = async () => {
        try {
            const handle = await requestAutoSaveDirectoryHandle();
            setHasAutoSaveDirectory(!!handle);
        } catch {
            setHasAutoSaveDirectory(false);
        }
    };

    const handleRequestPersistentStorage = async () => {
        await requestPersistentStorage();
        setStorageEstimate(await getStorageEstimateInfo());
    };

    const handleSaveCdnCacheDirectory = async () => {
        setCdnCacheSaving(true);
        setCdnCacheError('');
        setCdnCacheMessage('');

        try {
            const nextSettings = cdnCacheDirectoryInput.trim()
                ? await saveCdnCacheDirectory(cdnCacheDirectoryInput)
                : await resetCdnCacheDirectory();

            applyCdnCacheSettings(nextSettings);
            setCdnCacheMessage(nextSettings.isCustomDirectory ? '缓存目录已更新' : '已恢复默认缓存目录');
        } catch (error: unknown) {
            setCdnCacheError(getErrorMessage(error));
        } finally {
            setCdnCacheSaving(false);
        }
    };

    const handleResetCdnCacheDirectory = async () => {
        setCdnCacheSaving(true);
        setCdnCacheError('');
        setCdnCacheMessage('');

        try {
            const nextSettings = await resetCdnCacheDirectory();
            applyCdnCacheSettings(nextSettings);
            setCdnCacheMessage('已恢复默认缓存目录');
        } catch (error: unknown) {
            setCdnCacheError(getErrorMessage(error));
        } finally {
            setCdnCacheSaving(false);
        }
    };

    const handleClearCdnCacheDirectory = async () => {
        if (!cdnCacheSettings) return;

        const confirmed = window.confirm(
            `确认清空当前缓存目录？\n\n${cdnCacheSettings.effectiveDirectory}\n\n只会删除当前生效缓存目录中的文件，目录本身会保留。`,
        );

        if (!confirmed) {
            return;
        }

        setCdnCacheClearing(true);
        setCdnCacheError('');
        setCdnCacheMessage('');

        try {
            const result = await clearCdnCacheDirectory();
            applyCdnCacheSettings(result);
            setCdnCacheMessage(`已清空 ${result.clearedFiles} 个缓存文件，释放 ${formatBytes(result.clearedBytes)}`);
        } catch (error: unknown) {
            setCdnCacheError(getErrorMessage(error));
        } finally {
            setCdnCacheClearing(false);
        }
    };

    const refreshUpscaleServiceStatus = async (showBusy = true) => {
        if (showBusy) {
            setUpscaleServiceRefreshing(true);
        }

        try {
            const nextSettings = await getUpscaleServiceSettings();
            applyUpscaleServiceSettings(nextSettings);
            setUpscaleServiceError('');
            return nextSettings;
        } catch (error: unknown) {
            setUpscaleServiceError(getErrorMessage(error));
            return null;
        } finally {
            if (showBusy) {
                setUpscaleServiceRefreshing(false);
            }
        }
    };

    const handleSaveUpscaleServiceBaseUrl = async () => {
        setUpscaleServiceSaving(true);
        setUpscaleServiceError('');
        setUpscaleServiceMessage('');

        try {
            const nextSettings = upscaleServiceBaseUrlInput.trim()
                ? await saveUpscaleServiceBaseUrl(upscaleServiceBaseUrlInput)
                : await resetUpscaleServiceBaseUrl();

            applyUpscaleServiceSettings(nextSettings);
            setUpscaleServiceMessage(nextSettings.isCustomBaseUrl ? 'Upscayl 服务地址已更新' : '已恢复默认 Upscayl 服务地址');
        } catch (error: unknown) {
            setUpscaleServiceError(getErrorMessage(error));
        } finally {
            setUpscaleServiceSaving(false);
        }
    };

    const handleResetUpscaleServiceBaseUrl = async () => {
        setUpscaleServiceSaving(true);
        setUpscaleServiceError('');
        setUpscaleServiceMessage('');

        try {
            const nextSettings = await resetUpscaleServiceBaseUrl();
            applyUpscaleServiceSettings(nextSettings);
            setUpscaleServiceMessage('已恢复默认 Upscayl 服务地址');
        } catch (error: unknown) {
            setUpscaleServiceError(getErrorMessage(error));
        } finally {
            setUpscaleServiceSaving(false);
        }
    };

    const shellClassName = mode === 'page'
        ? 'mx-auto w-full max-w-6xl px-6 py-8'
        : 'w-[880px] max-w-[94vw] rounded-2xl border border-gray-200 bg-[#f5f5f7] shadow-2xl';

    return (
        <div data-testid={`settings-center-${mode}`} className={shellClassName}>
            <div className={mode === 'page' ? 'grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]' : 'grid min-h-[580px] gap-0 lg:grid-cols-[200px_minmax(0,1fr)]'}>
                <aside className={mode === 'page' ? 'rounded-2xl border border-gray-200 bg-white p-4 shadow-sm' : 'rounded-l-2xl border-r border-gray-100 bg-white p-4'}>
                    <div className="mb-4 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white">
                                <Settings size={15} />
                            </div>
                            <div>
                                <h2 className="text-[13px] font-semibold text-gray-900">设置中心</h2>
                                <p className="text-[10px] text-gray-400">接口 · 工作台 · 默认值</p>
                            </div>
                        </div>
                        {mode === 'dialog' && onClose && (
                            <button title="关闭设置中心" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    <div className="space-y-0.5">
                        {tabs.map(({ key, label, icon: Icon }) => (
                            <button
                                key={key}
                                type="button"
                                data-testid={`settings-tab-${key}`}
                                onClick={() => setActiveTab(key)}
                                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition ${activeTab === key ? 'bg-gray-900 text-white font-medium' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}
                            >
                                <Icon size={15} />
                                <span>{label}</span>
                            </button>
                        ))}
                    </div>

                    <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2.5 text-[10px] leading-4 text-gray-400">
                        {hasCustomSettings ? '检测到自定义设置，优先使用本地偏好。' : '当前使用默认设置。'}
                    </div>
                </aside>

                <div className={mode === 'page' ? 'space-y-5' : 'overflow-y-auto rounded-r-2xl p-5 lg:p-6'}>
                    {activeTab === 'workspace' && (
                        <div className="space-y-5">
                            <SettingsSection title="工作台行为" description="控制自动落盘与本地存储提醒。">
                                <div className="divide-y divide-gray-100">
                                    <div className="flex items-center justify-between gap-4 pb-3">
                                        <div className="min-w-0">
                                            <div className="text-[13px] font-medium text-gray-800">生成结果自动落盘</div>
                                            <div className="mt-0.5 text-[11px] leading-4 text-gray-400">开启后优先写入已授权目录；未授权时回退为普通下载。</div>
                                            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-400">
                                                <span>{hasAutoSaveDirectory ? '已授权自动保存目录' : '尚未选择自动保存目录'}</span>
                                                <button type="button" onClick={() => void handleChooseDirectory()} className="rounded px-1.5 py-0.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700">
                                                    {hasAutoSaveDirectory ? '更换目录' : '选择目录'}
                                                </button>
                                            </div>
                                        </div>
                                        <button title="切换自动落盘" data-testid="settings-toggle-auto-save" type="button" onClick={() => void handleToggleAutoSave()} className={`flex-none inline-flex h-6 w-10 items-center rounded-full p-0.5 transition ${settings.autoSaveGenerated ? 'bg-gray-900' : 'bg-gray-200'}`}>
                                            <span className={`h-5 w-5 rounded-full bg-white shadow-sm transition ${settings.autoSaveGenerated ? 'translate-x-4' : 'translate-x-0'}`} />
                                        </button>
                                    </div>

                                    <div className="flex items-center justify-between gap-4 py-3">
                                        <div className="min-w-0">
                                            <div className="text-[13px] font-medium text-gray-800">本地存储预警</div>
                                            <div className="mt-0.5 text-[11px] leading-4 text-gray-400">缓存使用率偏高时给出提醒，减少浏览器存储耗尽风险。</div>
                                        </div>
                                        <button title="切换本地存储预警" data-testid="settings-toggle-storage-warning" type="button" onClick={() => setSettings((prev) => ({ ...prev, warnOnHighStorage: !prev.warnOnHighStorage }))} className={`flex-none inline-flex h-6 w-10 items-center rounded-full p-0.5 transition ${settings.warnOnHighStorage ? 'bg-gray-900' : 'bg-gray-200'}`}>
                                            <span className={`h-5 w-5 rounded-full bg-white shadow-sm transition ${settings.warnOnHighStorage ? 'translate-x-4' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                </div>
                            </SettingsSection>

                            <SettingsSection title="显示偏好" description="图片展示方式与背景设置。">
                                <div className="grid gap-3 md:grid-cols-2">
                                    <LabeledField label="默认图片适配方式">
                                        <select title="默认图片适配方式" data-testid="settings-default-image-fit" className={selectClassName()} value={settings.defaultImageFit} onChange={(event) => setSettings((prev) => ({ ...prev, defaultImageFit: event.target.value as WorkbenchSettings['defaultImageFit'] }))}>
                                            <option value="contain">完整显示</option>
                                            <option value="cover">铺满裁切</option>
                                        </select>
                                    </LabeledField>

                                    <LabeledField label="默认图片背景">
                                        <select title="默认图片背景" data-testid="settings-default-image-surface" className={selectClassName()} value={settings.defaultImageSurface} onChange={(event) => setSettings((prev) => ({ ...prev, defaultImageSurface: event.target.value as WorkbenchSettings['defaultImageSurface'] }))}>
                                            <option value="checker">棋盘底</option>
                                            <option value="light">浅色底</option>
                                            <option value="dark">深色底</option>
                                        </select>
                                    </LabeledField>
                                </div>
                            </SettingsSection>

                            <SettingsSection title="本地存储" description="查看当前缓存占用，并请求浏览器持久化存储权限。">
                                <div className="flex items-center gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline justify-between">
                                            <span className="text-[13px] font-medium text-gray-800">当前缓存</span>
                                            <span className="text-[11px] text-gray-400">
                                                {storageEstimate
                                                    ? `${formatBytes(storageEstimate.usageBytes)} / ${formatBytes(storageEstimate.quotaBytes)} · ${Math.round(storageEstimate.usageRatio * 100)}%`
                                                    : '暂无法获取'}
                                            </span>
                                        </div>
                                        {storageEstimate && (
                                            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                                                <div
                                                    className={`h-full rounded-full transition-all ${storageEstimate.usageRatio > 0.8 ? 'bg-amber-500' : storageEstimate.usageRatio > 0.6 ? 'bg-yellow-400' : 'bg-gray-900'}`}
                                                    style={{ width: `${Math.min(Math.max(storageEstimate.usageRatio * 100, 0), 100)}%` }}
                                                />
                                            </div>
                                        )}
                                        <div className="mt-1.5 text-[10px] text-gray-400">持久化：{storageEstimate?.persisted ? '已开启' : '未开启'}</div>
                                    </div>
                                    <button data-testid="settings-request-persistent-storage" type="button" onClick={() => void handleRequestPersistentStorage()} disabled={storageEstimate?.persisted} className={`flex-none rounded-lg px-3.5 py-1.5 text-[12px] font-medium transition ${storageEstimate?.persisted ? 'bg-emerald-50 text-emerald-600 cursor-default' : 'bg-gray-900 text-white hover:bg-gray-800'}`}>
                                        {storageEstimate?.persisted ? '✓ 已开启' : '请求持久化'}
                                    </button>
                                </div>
                            </SettingsSection>

                            <SettingsSection title="CDN 缓存目录" description="控制远程图片和视频素材的服务端缓存落盘目录，只影响当前机器运行实例。">
                                {cdnCacheLoading ? (
                                    <div data-testid="settings-cache-loading" className="rounded-lg bg-gray-50/80 px-4 py-3 text-[12px] text-gray-400">
                                        正在读取缓存目录状态...
                                    </div>
                                ) : (
                                    <>
                                        <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-[11px] text-gray-400">当前生效目录</div>
                                                    <div data-testid="settings-cache-effective-directory" className="mt-1 break-all text-[13px] font-medium text-gray-900">
                                                        {cdnCacheSettings?.effectiveDirectory || '暂无法获取'}
                                                    </div>
                                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-gray-500">
                                                        <span className={`rounded-full px-2 py-0.5 ${cdnCacheSettings?.isCustomDirectory ? 'bg-gray-900 text-white' : 'border border-gray-200 bg-white text-gray-500'}`}>
                                                            {cdnCacheSettings?.isCustomDirectory ? '自定义目录' : '默认目录'}
                                                        </span>
                                                        <span className={`rounded-full px-2 py-0.5 ${cdnCacheSettings?.writable ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                                                            {cdnCacheSettings?.writable ? '可写' : '不可写'}
                                                        </span>
                                                        <span className={`rounded-full px-2 py-0.5 ${cdnCacheSettings?.exists ? 'border border-gray-200 bg-white text-gray-500' : 'bg-red-50 text-red-600'}`}>
                                                            {cdnCacheSettings?.exists ? '目录已就绪' : '目录不存在'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[11px] text-gray-400">当前占用</div>
                                                    <div className="mt-1 text-[16px] font-semibold text-gray-900">{formatBytes(cdnCacheSettings?.usageBytes ?? 0)}</div>
                                                    <div data-testid="settings-cache-file-count" className="mt-1 text-[11px] text-gray-400">
                                                        {(cdnCacheSettings?.fileCount ?? 0)} 个缓存文件
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <LabeledField label="自定义缓存目录" hint="留空时使用默认目录">
                                            <input
                                                data-testid="settings-cache-directory-input"
                                                className={inputClassName()}
                                                type="text"
                                                value={cdnCacheDirectoryInput}
                                                onChange={(event) => setCdnCacheDirectoryInput(event.target.value)}
                                                placeholder={cdnCacheSettings?.defaultDirectory || '例如 D:\\OpenLovartCache'}
                                            />
                                        </LabeledField>

                                        <div className="space-y-1 rounded-lg border border-gray-100 bg-white px-3 py-2.5 text-[11px] leading-4 text-gray-500">
                                            <div className="break-all">默认目录：{cdnCacheSettings?.defaultDirectory || '暂无法获取'}</div>
                                            <div>只影响当前机器运行实例，不会同步到其他设备。切换目录只影响后续写入，旧目录里的缓存不会自动迁移。</div>
                                        </div>

                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    data-testid="settings-cache-save-button"
                                                    type="button"
                                                    onClick={() => void handleSaveCdnCacheDirectory()}
                                                    disabled={cdnCacheSaving || cdnCacheClearing}
                                                    className="rounded-lg bg-gray-900 px-3.5 py-1.5 text-[12px] font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                                                >
                                                    {cdnCacheSaving ? '保存中...' : '保存缓存目录'}
                                                </button>
                                                <button
                                                    data-testid="settings-cache-reset-button"
                                                    type="button"
                                                    onClick={() => void handleResetCdnCacheDirectory()}
                                                    disabled={cdnCacheSaving || cdnCacheClearing}
                                                    className="rounded-lg border border-gray-200 bg-white px-3.5 py-1.5 text-[12px] font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-100 disabled:text-gray-300"
                                                >
                                                    恢复默认目录
                                                </button>
                                            </div>
                                            <button
                                                data-testid="settings-cache-clear-button"
                                                type="button"
                                                onClick={() => void handleClearCdnCacheDirectory()}
                                                disabled={cdnCacheSaving || cdnCacheClearing}
                                                className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-1.5 text-[12px] font-medium text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:border-gray-100 disabled:bg-gray-100 disabled:text-gray-300"
                                            >
                                                {cdnCacheClearing ? '清理中...' : '清空当前缓存'}
                                            </button>
                                        </div>

                                        {cdnCacheMessage && (
                                            <div data-testid="settings-cache-message" className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-[11px] leading-4 text-emerald-600">
                                                {cdnCacheMessage}
                                            </div>
                                        )}

                                        {cdnCacheError && (
                                            <div data-testid="settings-cache-error" className="rounded-lg border border-red-100 bg-red-50/70 px-3 py-2 text-[11px] leading-4 text-red-600">
                                                {cdnCacheError}
                                            </div>
                                        )}
                                    </>
                                )}
                            </SettingsSection>
                        </div>
                    )}

                    {activeTab === 'defaults' && (
                        <div className="space-y-4">
                            <SettingsSection title="图片生成默认值" description="新建图片生成器节点时优先套用这里的模型、比例、尺寸和张数。">
                                <div className="grid gap-3 md:grid-cols-2">
                                    <LabeledField label="默认模型">
                                        <select title="图片默认模型" data-testid="settings-image-model" className={selectClassName()} value={settings.imageDefaults.model} onChange={(event) => setSettings((prev) => {
                                            const nextModel = event.target.value as WorkbenchSettings['imageDefaults']['model'];
                                            const nextImageSize = nextModel === 'gpt-image-2'
                                                ? resolveOpenAiGptImagePixelSize(prev.imageDefaults.imageSize, prev.imageDefaults.aspectRatio)
                                                : isStandardImageSize(prev.imageDefaults.imageSize)
                                                    ? prev.imageDefaults.imageSize
                                                    : DEFAULT_WORKBENCH_SETTINGS.imageDefaults.imageSize;
                                            const nextAspectRatio = nextModel === 'gpt-image-2'
                                                ? resolveOpenAiGptImageAspectRatio(nextImageSize, prev.imageDefaults.aspectRatio)
                                                : prev.imageDefaults.aspectRatio === '9:21'
                                                    ? '9:16'
                                                    : prev.imageDefaults.aspectRatio;

                                            return {
                                                ...prev,
                                                imageDefaults: {
                                                    ...prev.imageDefaults,
                                                    model: nextModel,
                                                    imageSize: nextImageSize,
                                                    aspectRatio: nextAspectRatio,
                                                },
                                            };
                                        })}>
                                            <option value="gemini-3.1-flash-image-preview">gemini-3.1-flash-image-preview</option>
                                            <option value="nano-banana-2">nano-banana-2</option>
                                            <option value="gpt-image-2">gpt-image-2</option>
                                            <option value="grok-4.2-image">grok-4.2-image</option>
                                            <option value="doubao-seedream-5-0-260128">doubao-seedream-5-0-260128</option>
                                        </select>
                                    </LabeledField>
                                    <LabeledField label="默认图片尺寸">
                                        <select title="图片默认尺寸" data-testid="settings-image-size" className={selectClassName()} value={settings.imageDefaults.imageSize} onChange={(event) => setSettings((prev) => {
                                            const nextImageSize = event.target.value as WorkbenchSettings['imageDefaults']['imageSize'];
                                            return {
                                                ...prev,
                                                imageDefaults: {
                                                    ...prev.imageDefaults,
                                                    imageSize: nextImageSize,
                                                    aspectRatio: prev.imageDefaults.model === 'gpt-image-2'
                                                        ? resolveOpenAiGptImageAspectRatio(nextImageSize, prev.imageDefaults.aspectRatio)
                                                        : prev.imageDefaults.aspectRatio,
                                                },
                                            };
                                        })}>
                                            {imageDefaultSizeOptions.map((value) => (
                                                <option key={value} value={value}>{value}</option>
                                            ))}
                                        </select>
                                    </LabeledField>
                                    <LabeledField label={isOpenAiGptImageDefaultModel ? '派生宽高比' : '默认宽高比'}>
                                        {isOpenAiGptImageDefaultModel ? (
                                            <div className={`${selectClassName()} flex items-center justify-between`}>
                                                <span>{derivedOpenAiGptImageDefaultAspectRatio}</span>
                                                <span className="text-[11px] text-gray-400">由尺寸自动推导</span>
                                            </div>
                                        ) : (
                                            <select title="图片默认宽高比" data-testid="settings-image-aspect-ratio" className={selectClassName()} value={settings.imageDefaults.aspectRatio} onChange={(event) => setSettings((prev) => ({ ...prev, imageDefaults: { ...prev.imageDefaults, aspectRatio: event.target.value as WorkbenchSettings['imageDefaults']['aspectRatio'] } }))}>
                                                {imageDefaultAspectRatioOptions.map((value) => (
                                                    <option key={value} value={value}>{value}</option>
                                                ))}
                                            </select>
                                        )}
                                    </LabeledField>
                                    <LabeledField label="默认生成张数">
                                        <select title="图片默认生成张数" data-testid="settings-image-generate-count" className={selectClassName()} value={settings.imageDefaults.generateCount} onChange={(event) => setSettings((prev) => ({ ...prev, imageDefaults: { ...prev.imageDefaults, generateCount: Number(event.target.value) as WorkbenchSettings['imageDefaults']['generateCount'] } }))}>
                                            {[1, 2, 3, 4].map((value) => (
                                                <option key={value} value={value}>{value} 张</option>
                                            ))}
                                        </select>
                                    </LabeledField>
                                </div>
                                {isOpenAiGptImageDefaultModel && (
                                    <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2 text-[11px] leading-4 text-gray-500">
                                        gpt-image-2 当前按比例优先生成，像素尺寸作为期望输入；更细的像素控制建议在生成器里使用实验尺寸。
                                    </div>
                                )}
                            </SettingsSection>

                            <SettingsSection title="视频生成默认值" description="新建视频生成器节点时默认带入模型、比例、时长与提示增强选项。">
                                <div className="grid gap-3 md:grid-cols-2">
                                    <LabeledField label="默认模型">
                                        <select title="视频默认模型" data-testid="settings-video-model" className={selectClassName()} value={settings.videoDefaults.model} onChange={(event) => setSettings((prev) => ({ ...prev, videoDefaults: { ...prev.videoDefaults, model: event.target.value as WorkbenchSettings['videoDefaults']['model'] } }))}>
                                            <option value="veo3.1">Veo 3.1</option>
                                            <option value="veo3.1-fast">Veo 3.1 Fast</option>
                                            <option value="veo3.1-components">Veo 3.1 Components</option>
                                            <option value="doubao-seedance-2-0-260128">Doubao Seedance 2.0</option>
                                        </select>
                                    </LabeledField>
                                    <LabeledField label="默认宽高比">
                                        <select title="视频默认宽高比" data-testid="settings-video-aspect-ratio" className={selectClassName()} value={settings.videoDefaults.aspectRatio} onChange={(event) => setSettings((prev) => ({ ...prev, videoDefaults: { ...prev.videoDefaults, aspectRatio: event.target.value as WorkbenchSettings['videoDefaults']['aspectRatio'] } }))}>
                                            {['16:9', '9:16', '1:1', '4:3', '3:4'].map((value) => (
                                                <option key={value} value={value}>{value}</option>
                                            ))}
                                        </select>
                                    </LabeledField>
                                    <LabeledField label="默认时长">
                                        <select title="视频默认时长" data-testid="settings-video-duration" className={selectClassName()} value={settings.videoDefaults.duration} onChange={(event) => setSettings((prev) => ({ ...prev, videoDefaults: { ...prev.videoDefaults, duration: event.target.value as WorkbenchSettings['videoDefaults']['duration'] } }))}>
                                            {((settings.videoDefaults.model === 'doubao-seedance-2-0-260128' ? VIDEO_DURATION_OPTIONS : ['5s', '8s']) as WorkbenchSettings['videoDefaults']['duration'][]).map((value) => (
                                                <option key={value} value={value}>{value}</option>
                                            ))}
                                        </select>
                                    </LabeledField>
                                    <div className="flex items-center justify-between gap-4 rounded-lg bg-gray-50/80 px-3 py-2.5">
                                        <div className="min-w-0">
                                            <div className="text-[13px] font-medium text-gray-800">增强提示词</div>
                                            <div className="mt-0.5 text-[11px] leading-4 text-gray-400">新建视频生成器时默认启用。</div>
                                        </div>
                                        <button title="切换视频增强提示词" data-testid="settings-video-enhance-prompt" type="button" onClick={() => setSettings((prev) => ({ ...prev, videoDefaults: { ...prev.videoDefaults, enhancePrompt: !prev.videoDefaults.enhancePrompt } }))} className={`flex-none inline-flex h-6 w-10 items-center rounded-full p-0.5 transition ${settings.videoDefaults.enhancePrompt ? 'bg-gray-900' : 'bg-gray-200'}`}>
                                            <span className={`h-5 w-5 rounded-full bg-white shadow-sm transition ${settings.videoDefaults.enhancePrompt ? 'translate-x-4' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                </div>
                            </SettingsSection>
                        </div>
                    )}

                    {activeTab === 'api' && (
                        <div className="space-y-4">
                            <SettingsSection title="AI 接口设置" description="用于浏览器直连和服务端代理请求的基础地址与密钥。">
                                <LabeledField label="API Base URL" hint="留空时回退到默认服务地址">
                                    <input data-testid="settings-api-base-url" className={inputClassName()} type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.bltcy.ai" />
                                </LabeledField>
                                <LabeledField label="API Key" hint="仅保存在当前浏览器 localStorage">
                                    <div className="relative">
                                        <input data-testid="settings-api-key" className={`${inputClassName()} pr-10 font-mono`} type={showKey ? 'text' : 'password'} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-xxxxxxxxxxxxxxxx" />
                                        <button title={showKey ? '隐藏 API Key' : '显示 API Key'} data-testid="settings-api-key-toggle" type="button" onClick={() => setShowKey((prev) => !prev)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
                                            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                    </div>
                                </LabeledField>
                                <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2.5 text-[11px] leading-4 text-amber-600">
                                    密钥仅用于当前设备，不会同步到其他服务；在公共设备上使用后建议执行“恢复默认”。
                                </div>
                            </SettingsSection>

                            <SettingsSection title="Upscayl 服务" description="配置分镜切割 AI 放大的服务地址，只影响当前机器运行实例。">
                                {upscaleServiceLoading ? (
                                    <div data-testid="settings-upscale-loading" className="rounded-lg bg-gray-50/80 px-4 py-3 text-[12px] text-gray-400">
                                        正在读取 Upscayl 服务状态...
                                    </div>
                                ) : (
                                    <>
                                        <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-[11px] text-gray-400">当前生效地址</div>
                                                    <div data-testid="settings-upscale-effective-base-url" className="mt-1 break-all text-[13px] font-medium text-gray-900">
                                                        {upscaleServiceSettings?.effectiveBaseUrl || '暂无法获取'}
                                                    </div>
                                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-gray-500">
                                                        <span className={`rounded-full px-2 py-0.5 ${upscaleServiceSettings?.isCustomBaseUrl ? 'bg-gray-900 text-white' : 'border border-gray-200 bg-white text-gray-500'}`}>
                                                            {upscaleServiceSettings?.isCustomBaseUrl ? '自定义地址' : '默认地址'}
                                                        </span>
                                                        <span className={`rounded-full px-2 py-0.5 ${upscaleServiceSettings?.health.ok ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                                                            {upscaleServiceSettings?.health.ok ? '服务可用' : '服务不可用'}
                                                        </span>
                                                        {upscaleServiceSettings?.health.gpu && (
                                                            <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5">
                                                                GPU: {upscaleServiceSettings.health.gpu}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <LabeledField label="Upscayl 服务地址" hint="留空时使用默认地址">
                                            <input
                                                data-testid="settings-upscale-base-url-input"
                                                className={inputClassName()}
                                                type="url"
                                                value={upscaleServiceBaseUrlInput}
                                                onChange={(event) => setUpscaleServiceBaseUrlInput(event.target.value)}
                                                placeholder={upscaleServiceSettings?.defaultBaseUrl || '例如 http://127.0.0.1:3001'}
                                            />
                                        </LabeledField>

                                        <div className="space-y-1 rounded-lg border border-gray-100 bg-white px-3 py-2.5 text-[11px] leading-4 text-gray-500">
                                            <div className="break-all">默认地址：{upscaleServiceSettings?.defaultBaseUrl || '暂无法获取'}</div>
                                            <div>Next 服务端会代理到这个地址，浏览器不会再直接访问 localhost。切换后建议点一次“检测连接”。</div>
                                            {upscaleServiceSettings?.health.details && (
                                                <div className="text-red-500">当前状态：{upscaleServiceSettings.health.details}</div>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                data-testid="settings-upscale-save-button"
                                                type="button"
                                                onClick={() => void handleSaveUpscaleServiceBaseUrl()}
                                                disabled={upscaleServiceSaving || upscaleServiceRefreshing}
                                                className="rounded-lg bg-gray-900 px-3.5 py-1.5 text-[12px] font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                                            >
                                                {upscaleServiceSaving ? '保存中...' : '保存服务地址'}
                                            </button>
                                            <button
                                                data-testid="settings-upscale-reset-button"
                                                type="button"
                                                onClick={() => void handleResetUpscaleServiceBaseUrl()}
                                                disabled={upscaleServiceSaving || upscaleServiceRefreshing}
                                                className="rounded-lg border border-gray-200 bg-white px-3.5 py-1.5 text-[12px] font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-100 disabled:text-gray-300"
                                            >
                                                恢复默认地址
                                            </button>
                                            <button
                                                data-testid="settings-upscale-refresh-button"
                                                type="button"
                                                onClick={() => void refreshUpscaleServiceStatus()}
                                                disabled={upscaleServiceSaving || upscaleServiceRefreshing}
                                                className="rounded-lg border border-gray-200 bg-white px-3.5 py-1.5 text-[12px] font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-100 disabled:text-gray-300"
                                            >
                                                {upscaleServiceRefreshing ? '检测中...' : '检测连接'}
                                            </button>
                                        </div>

                                        {upscaleServiceMessage && (
                                            <div data-testid="settings-upscale-message" className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-[11px] leading-4 text-emerald-600">
                                                {upscaleServiceMessage}
                                            </div>
                                        )}

                                        {upscaleServiceError && (
                                            <div data-testid="settings-upscale-error" className="rounded-lg border border-red-100 bg-red-50/70 px-3 py-2 text-[11px] leading-4 text-red-600">
                                                {upscaleServiceError}
                                            </div>
                                        )}
                                    </>
                                )}
                            </SettingsSection>
                        </div>
                    )}

                    {activeTab === 'account' && (
                        <div className="space-y-4">
                            <SettingsSection title="账户信息" description="展示当前登录状态与设置作用范围。">
                                {user ? (
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <div className="rounded-lg bg-gray-50/80 px-4 py-3">
                                            <div className="text-[11px] text-gray-400">用户</div>
                                            <div className="mt-0.5 text-[13px] font-semibold text-gray-900">{user.firstName || user.username || '当前用户'}</div>
                                            <div className="mt-0.5 text-[11px] text-gray-400">{user.primaryEmailAddress?.emailAddress || '暂无邮箱信息'}</div>
                                        </div>
                                        <div className="rounded-lg bg-gray-50/80 px-4 py-3">
                                            <div className="text-[11px] text-gray-400">生效范围</div>
                                            <div className="mt-0.5 text-[13px] font-semibold text-gray-900">浏览器偏好 + 当前机器运行实例</div>
                                            <div className="mt-0.5 text-[11px] text-gray-400">API 和工作台设置保存在当前浏览器；CDN 缓存目录与 Upscayl 服务地址作用于当前机器运行实例。</div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-lg bg-gray-50/80 px-4 py-3 text-[13px] text-gray-500">
                                        当前未登录，设置仍可在本地生效，但不会同步到其他设备。
                                    </div>
                                )}
                            </SettingsSection>
                        </div>
                    )}

                    <div className={`flex items-center justify-between gap-3 ${mode === 'page' ? '' : 'mt-5 border-t border-gray-100 pt-3'}`}>
                        <button data-testid="settings-reset-button" type="button" onClick={handleReset} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] text-gray-400 transition hover:bg-red-50 hover:text-red-500">
                            <Trash2 size={13} /> 恢复默认
                        </button>
                        <div className="flex items-center gap-1.5">
                            {mode === 'dialog' && onClose && (
                                <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-[12px] text-gray-500 transition hover:bg-gray-100">
                                    关闭
                                </button>
                            )}
                            <button data-testid="settings-save-button" type="button" onClick={handleSave} className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[12px] font-medium transition ${saved ? 'bg-emerald-500 text-white' : 'bg-gray-900 text-white hover:bg-gray-800'}`}>
                                {saved ? <Check size={13} /> : <Settings size={13} />}
                                {saved ? '已保存' : '保存设置'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

interface ApiSettingsDialogProps {
    onClose: () => void;
}

export function ApiSettingsDialog({ onClose }: ApiSettingsDialogProps) {
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dialogRef.current && !dialogRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEsc);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEsc);
        };
    }, [onClose]);

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4 py-6 backdrop-blur-sm animate-in fade-in duration-200">
            <div ref={dialogRef} className="max-h-full overflow-auto">
                <SettingsCenterContent onClose={onClose} />
            </div>
        </div>,
        document.body,
    );
}

export function ApiSettingsButton() {
    const [showDialog, setShowDialog] = useState(false);
    const [hasCustomConfig, setHasCustomConfig] = useState(false);

    useEffect(() => {
        const syncState = () => {
            const apiSettings = getApiSettings();
            const workbenchSettings = getWorkbenchSettings();
            const hasLocalCustomConfig = !!apiSettings.baseUrl || !!apiSettings.apiKey || hasCustomWorkbenchSettings(workbenchSettings);
            setHasCustomConfig(hasLocalCustomConfig);

            void Promise.all([
                getCdnCacheSettings().catch(() => null),
                getUpscaleServiceSettings().catch(() => null),
            ])
                .then(([cacheSettings, serviceSettings]) => {
                    setHasCustomConfig(hasLocalCustomConfig || !!cacheSettings?.isCustomDirectory || !!serviceSettings?.isCustomBaseUrl);
                })
                .catch(() => {
                    // Ignore fetch failures here and keep the local indicator only.
                });
        };

        syncState();
        const unsubscribeApi = subscribeApiSettingsChange(syncState);
        const unsubscribeWorkbench = subscribeWorkbenchSettingsChange(syncState);
        const unsubscribeCdnCache = subscribeCdnCacheSettingsChange(syncState);
        const unsubscribeUpscaleService = subscribeUpscaleServiceSettingsChange(syncState);

        return () => {
            unsubscribeApi();
            unsubscribeWorkbench();
            unsubscribeCdnCache();
            unsubscribeUpscaleService();
        };
    }, []);

    return (
        <>
            <button
                data-testid="settings-open-button"
                onClick={() => setShowDialog(true)}
                className={`relative flex h-8 w-8 items-center justify-center rounded-full transition-colors ${hasCustomConfig ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'text-gray-500 hover:bg-gray-100'}`}
                title="设置中心"
            >
                <Settings size={16} />
                {hasCustomConfig && (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-500" />
                )}
            </button>
            {showDialog && <ApiSettingsDialog onClose={() => setShowDialog(false)} />}
        </>
    );
}
