export const DEBUG_LOGS_ENABLED = process.env.NEXT_PUBLIC_OPENLOVART_DEBUG_LOGS === '1'
    || process.env.OPENLOVART_DEBUG_LOGS === '1';

export function debugLog(...args: unknown[]) {
    if (DEBUG_LOGS_ENABLED) {
        console.log(...args);
    }
}