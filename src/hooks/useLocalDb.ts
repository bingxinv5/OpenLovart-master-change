import { localDb } from '@/lib/editor-kernel';

/**
 * Returns the local database client used by the current demo/local-first runtime.
 */
export function useLocalDb() {
  return localDb;
}
