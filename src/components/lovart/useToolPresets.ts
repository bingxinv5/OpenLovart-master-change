import { useCallback, useState } from 'react';
import {
  deleteToolPreset,
  listToolPresets,
  loadToolPreset,
  saveNamedToolPreset,
  saveToolPreset,
  type CanvasToolPresetKey,
  type ToolPresetEntry,
} from '@/lib/tool-presets';

export function useToolPresets<T>(key: CanvasToolPresetKey, defaultPresetName: string) {
  const [presetHint, setPresetHint] = useState('');
  const [presetName, setPresetName] = useState('');
  const [presets, setPresets] = useState<ToolPresetEntry<T>[]>(() => listToolPresets<T>(key));

  const refreshPresets = useCallback(() => {
    setPresets(listToolPresets<T>(key));
  }, [key]);

  const saveNamedPreset = useCallback((value: T) => {
    const next = saveNamedToolPreset(key, presetName || defaultPresetName, value);
    setPresets(next);
    setPresetHint('已保存命名预设');
    setPresetName('');
  }, [defaultPresetName, key, presetName]);

  const rememberPreset = useCallback((value: T) => {
    saveToolPreset(key, value);
    refreshPresets();
    setPresetHint('已更新上次使用');
  }, [key, refreshPresets]);

  const loadLastPreset = useCallback((apply: (value: Partial<T>) => void) => {
    const preset = loadToolPreset<T>(key);
    if (preset) {
      apply(preset);
      setPresetHint('已载入上次使用');
      return;
    }

    setPresetHint('暂无可用预设');
  }, [key]);

  const applyPreset = useCallback((preset: ToolPresetEntry<T>, apply: (value: T) => void) => {
    apply(preset.value);
    setPresetHint(`已载入预设：${preset.name}`);
  }, []);

  const removePreset = useCallback((preset: ToolPresetEntry<T>) => {
    const next = deleteToolPreset(key, preset.id) as ToolPresetEntry<T>[];
    setPresets(next);
    setPresetHint(`已删除预设：${preset.name}`);
  }, [key]);

  return {
    presetHint,
    presetName,
    presets,
    setPresetName,
    saveNamedPreset,
    rememberPreset,
    loadLastPreset,
    applyPreset,
    removePreset,
  };
}