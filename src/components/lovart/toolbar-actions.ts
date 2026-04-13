/**
 * Pure data constants and helpers extracted from ContextToolbar.tsx.
 */

import { Smartphone, Coffee, ShoppingBag, CreditCard, Monitor } from 'lucide-react';

// ========== Mockup templates ==========
export const mockupTemplates = [
    { id: 'phone', label: '📱 手机屏幕', icon: Smartphone, bgColor: '#1a1a2e', description: '将图片展示在手机屏幕上', prompt: 'Place this image on a modern smartphone screen, realistic perspective mockup, professional product photography' },
    { id: 'laptop', label: '💻 笔记本电脑', icon: Monitor, bgColor: '#16213e', description: '将图片展示在笔记本屏幕上', prompt: 'Place this image on a laptop screen, MacBook style, realistic workspace mockup, professional photography' },
    { id: 'mug', label: '☕ 马克杯', icon: Coffee, bgColor: '#f5f0e8', description: '将图片印在马克杯上', prompt: 'Print this image on a white ceramic coffee mug, realistic mockup, clean studio background' },
    { id: 'bag', label: '👜 手提袋', icon: ShoppingBag, bgColor: '#e8e8e8', description: '将图片印在手提袋上', prompt: 'Print this image on a canvas tote bag, realistic fashion mockup, clean background' },
    { id: 'card', label: '💳 名片', icon: CreditCard, bgColor: '#ffffff', description: '将图片作为名片展示', prompt: 'Place this image on a business card, realistic mockup, professional presentation' },
] as const;

// ========== Background options ==========
export const bgOptions = [
    { id: 'transparent', label: '🔲 透明背景', prompt: 'Remove the background completely, make it transparent, keep only the main subject' },
    { id: 'white', label: '⬜ 白色背景', prompt: 'Replace the background with a clean pure white background, keep only the main subject' },
    { id: 'gradient', label: '🌈 渐变背景', prompt: 'Replace the background with a beautiful gradient background, keep only the main subject' },
    { id: 'blur', label: '🔮 模糊背景', prompt: 'Blur the background while keeping the main subject sharp and clear' },
    { id: 'studio', label: '📸 影棚背景', prompt: 'Replace the background with a professional photography studio lighting background' },
] as const;

/** Parse a JSON-encoded array of reference image strings, returning [] on any failure. */
export function parseSavedReferenceImages(value?: string): string[] {
    if (!value?.trim()) return [];
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    } catch {
        return [];
    }
}
