/**
 * typed-local-collection.ts — 类型化的 localStorage 集合工具
 *
 * 提供对 localStorage 中 JSON 数组的统一读/写/清除/订阅操作，
 * 消除各模块重复的 localStorage + CustomEvent 样板代码。
 */

export interface LocalCollectionOptions<T> {
    /** localStorage 存储键 */
    storageKey: string;
    /** 自定义变更事件名称 */
    changeEvent: string;
    /** 将 unknown 解析结果规范化为类型安全数组 */
    normalize: (raw: unknown) => T[];
}

export interface LocalCollection<T> {
    read(): T[];
    write(items: T[]): void;
    clear(): void;
    subscribe(listener: () => void): () => void;
}

export function createLocalCollection<T>(options: LocalCollectionOptions<T>): LocalCollection<T> {
    function read(): T[] {
        if (typeof window === 'undefined') return [];
        try {
            const raw = window.localStorage.getItem(options.storageKey);
            if (!raw) return [];
            return options.normalize(JSON.parse(raw) as unknown);
        } catch {
            return [];
        }
    }

    function write(items: T[]): void {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(options.storageKey, JSON.stringify(items));
            window.dispatchEvent(new CustomEvent(options.changeEvent));
        } catch {
            // Ignore storage quota / privacy mode failures.
        }
    }

    function clear(): void {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.removeItem(options.storageKey);
            window.dispatchEvent(new CustomEvent(options.changeEvent));
        } catch {
            // Ignore storage quota / privacy mode failures.
        }
    }

    function subscribe(listener: () => void): () => void {
        if (typeof window === 'undefined') return () => {};

        const handleCustom = () => listener();
        const handleStorage = (event: StorageEvent) => {
            if (event.key === null || event.key === options.storageKey) {
                listener();
            }
        };

        window.addEventListener(options.changeEvent, handleCustom);
        window.addEventListener('storage', handleStorage);

        return () => {
            window.removeEventListener(options.changeEvent, handleCustom);
            window.removeEventListener('storage', handleStorage);
        };
    }

    return { read, write, clear, subscribe };
}
