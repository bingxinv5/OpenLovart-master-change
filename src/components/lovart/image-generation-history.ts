"use client";

import { ensureImageRef } from '@/lib/editor-kernel';
import {
    getMaxReferenceImagesForImageModel,
    resolveOpenAiGptImageQuality,
    isStandardImageSize,
    resolveOpenAiGptImageAspectRatio,
    resolveOpenAiGptImageSize,
} from '@/lib/image-generation-models';
import { createLocalCollection } from '@/lib/typed-local-collection';

export type ImageHistoryModel = 'gemini-3.1-flash-image-preview' | 'nano-banana-2' | 'gpt-image-2' | 'grok-4.2-image' | 'doubao-seedream-5-0-260128';
export type ImageHistoryAspectRatio = 'auto' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '2:3' | '3:2' | '4:5' | '5:4' | '21:9' | '9:21';
export type ImageHistorySize = string;
export type ImageHistoryQuality = 'auto' | 'low' | 'medium' | 'high';
export type ImageHistoryGenerateCount = 1 | 2 | 3 | 4;

export interface ImageGenerationHistoryItem {
    id: string;
    prompt: string;
    model: ImageHistoryModel;
    aspectRatio: ImageHistoryAspectRatio;
    imageSize: ImageHistorySize;
    quality: ImageHistoryQuality;
    generateCount: ImageHistoryGenerateCount;
    referenceImages: string[];
    createdAt: number;
}

export interface RecentReferenceImageItem {
    image: string;
    prompt: string;
    historyId: string;
    createdAt: number;
}

export interface FavoriteReferenceImageItem {
    id: string;
    image: string;
    label: string;
    createdAt: number;
    lastUsedAt: number;
}

export interface ImageGenerationHistoryDraft {
    prompt: string;
    model: ImageHistoryModel;
    aspectRatio: ImageHistoryAspectRatio;
    imageSize: ImageHistorySize;
    quality: ImageHistoryQuality;
    generateCount: ImageHistoryGenerateCount;
    referenceImages?: string[];
}

const STORAGE_KEY = 'lovart_image_generation_history';
const STORAGE_EVENT = 'lovart:image-generation-history-changed';
const FAVORITE_REFERENCE_STORAGE_KEY = 'lovart_favorite_reference_images';
const FAVORITE_REFERENCE_STORAGE_EVENT = 'lovart:favorite-reference-images-changed';
const MAX_ITEMS = 8;
const MAX_FAVORITE_REFERENCES = 16;

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function areStringArraysEqual(left: string[], right: string[]) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) return false;
    }
    return true;
}

async function persistReferenceImages(images: string[], model: ImageHistoryModel): Promise<string[]> {
    const nextImages: string[] = [];
    const maxReferenceImages = getMaxReferenceImagesForImageModel(model);

    for (const image of images.slice(0, maxReferenceImages)) {
        if (typeof image !== 'string' || !image) continue;
        const persistedImage = await ensureImageRef(image);
        if (persistedImage) {
            nextImages.push(persistedImage);
        }
    }

    return nextImages;
}

async function persistHistoryItems(items: ImageGenerationHistoryItem[]): Promise<ImageGenerationHistoryItem[]> {
    const nextItems: ImageGenerationHistoryItem[] = [];

    for (const item of items) {
        const referenceImages = await persistReferenceImages(item.referenceImages, item.model);
        nextItems.push(areStringArraysEqual(item.referenceImages, referenceImages) ? item : { ...item, referenceImages });
    }

    return nextItems;
}

async function persistFavoriteItems(items: FavoriteReferenceImageItem[]): Promise<FavoriteReferenceImageItem[]> {
    const nextItems: FavoriteReferenceImageItem[] = [];

    for (const item of items) {
        const image = await ensureImageRef(item.image);
        nextItems.push(image === item.image ? item : { ...item, image });
    }

    return nextItems;
}

function areHistoryItemsEqual(left: ImageGenerationHistoryItem[], right: ImageGenerationHistoryItem[]) {
    if (left.length !== right.length) return false;

    for (let index = 0; index < left.length; index += 1) {
        const leftItem = left[index];
        const rightItem = right[index];
        if (
            leftItem.id !== rightItem.id
            || leftItem.prompt !== rightItem.prompt
            || leftItem.model !== rightItem.model
            || leftItem.aspectRatio !== rightItem.aspectRatio
            || leftItem.imageSize !== rightItem.imageSize
            || leftItem.quality !== rightItem.quality
            || leftItem.generateCount !== rightItem.generateCount
            || leftItem.createdAt !== rightItem.createdAt
            || !areStringArraysEqual(leftItem.referenceImages, rightItem.referenceImages)
        ) {
            return false;
        }
    }

    return true;
}

function areFavoriteItemsEqual(left: FavoriteReferenceImageItem[], right: FavoriteReferenceImageItem[]) {
    if (left.length !== right.length) return false;

    for (let index = 0; index < left.length; index += 1) {
        const leftItem = left[index];
        const rightItem = right[index];
        if (
            leftItem.id !== rightItem.id
            || leftItem.image !== rightItem.image
            || leftItem.label !== rightItem.label
            || leftItem.createdAt !== rightItem.createdAt
            || leftItem.lastUsedAt !== rightItem.lastUsedAt
        ) {
            return false;
        }
    }

    return true;
}

function sanitizeHistoryItem(value: unknown): ImageGenerationHistoryItem | null {
    if (!isObject(value)) return null;
    if (typeof value.prompt !== 'string' || !value.prompt.trim()) return null;

    const model = value.model === 'nano-banana-2' || value.model === 'gpt-image-2' || value.model === 'grok-4.2-image' || value.model === 'doubao-seedream-5-0-260128'
        ? value.model
        : 'gemini-3.1-flash-image-preview';
    const aspectRatio = value.aspectRatio === 'auto'
        || value.aspectRatio === '1:1'
        || value.aspectRatio === '4:3'
        || value.aspectRatio === '3:4'
        || value.aspectRatio === '16:9'
        || value.aspectRatio === '9:16'
        || value.aspectRatio === '2:3'
        || value.aspectRatio === '3:2'
        || value.aspectRatio === '4:5'
        || value.aspectRatio === '5:4'
        || value.aspectRatio === '9:21'
        || value.aspectRatio === '21:9'
        ? value.aspectRatio
        : '21:9';
    const imageSize = model === 'gpt-image-2'
        ? resolveOpenAiGptImageSize(value.imageSize, aspectRatio)
        : isStandardImageSize(value.imageSize)
            ? value.imageSize
            : '4K';
    const quality = model === 'gpt-image-2'
        ? resolveOpenAiGptImageQuality(value.quality)
        : 'auto';
    const generateCount = value.generateCount === 1 || value.generateCount === 2 || value.generateCount === 3 || value.generateCount === 4 ? value.generateCount : 1;
    const maxReferenceImages = getMaxReferenceImagesForImageModel(model);
    const referenceImages = Array.isArray(value.referenceImages)
        ? value.referenceImages.filter((item): item is string => typeof item === 'string').slice(0, maxReferenceImages)
        : [];

    return {
        id: typeof value.id === 'string' && value.id.trim() ? value.id : createHistoryId(),
        prompt: value.prompt.trim(),
        model,
        aspectRatio: model === 'gpt-image-2'
            ? resolveOpenAiGptImageAspectRatio(imageSize, aspectRatio)
            : aspectRatio === '9:21'
                ? '9:16'
                : aspectRatio,
        imageSize,
        quality,
        generateCount,
        referenceImages,
        createdAt: typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) ? value.createdAt : Date.now(),
    };
}

function normalizeHistory(value: unknown): ImageGenerationHistoryItem[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => sanitizeHistoryItem(item))
        .filter((item): item is ImageGenerationHistoryItem => !!item)
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, MAX_ITEMS);
}

function sanitizeFavoriteReferenceItem(value: unknown): FavoriteReferenceImageItem | null {
    if (!isObject(value)) return null;
    if (typeof value.image !== 'string' || !value.image) return null;

    return {
        id: typeof value.id === 'string' && value.id.trim() ? value.id : createHistoryId(),
        image: value.image,
        label: typeof value.label === 'string' && value.label.trim() ? value.label.trim() : '未命名参考图',
        createdAt: typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) ? value.createdAt : Date.now(),
        lastUsedAt: typeof value.lastUsedAt === 'number' && Number.isFinite(value.lastUsedAt) ? value.lastUsedAt : Date.now(),
    };
}

function normalizeFavoriteReferences(value: unknown): FavoriteReferenceImageItem[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => sanitizeFavoriteReferenceItem(item))
        .filter((item): item is FavoriteReferenceImageItem => !!item)
        .sort((left, right) => right.lastUsedAt - left.lastUsedAt)
        .slice(0, MAX_FAVORITE_REFERENCES);
}

const historyCollection = createLocalCollection<ImageGenerationHistoryItem>({
    storageKey: STORAGE_KEY,
    changeEvent: STORAGE_EVENT,
    normalize: normalizeHistory,
});

const favoriteCollection = createLocalCollection<FavoriteReferenceImageItem>({
    storageKey: FAVORITE_REFERENCE_STORAGE_KEY,
    changeEvent: FAVORITE_REFERENCE_STORAGE_EVENT,
    normalize: normalizeFavoriteReferences,
});

export function createHistoryId() {
    return `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function readImageGenerationHistory(): ImageGenerationHistoryItem[] {
    return historyCollection.read();
}

export async function migrateImageGenerationStorage(): Promise<void> {
    if (typeof window === 'undefined') return;

    const history = readImageGenerationHistory();
    if (history.length > 0) {
        const persistedHistory = await persistHistoryItems(history);
        if (!areHistoryItemsEqual(history, persistedHistory)) {
            historyCollection.write(persistedHistory);
        }
    }

    const favorites = readFavoriteReferenceImages();
    if (favorites.length > 0) {
        const persistedFavorites = await persistFavoriteItems(favorites);
        if (!areFavoriteItemsEqual(favorites, persistedFavorites)) {
            favoriteCollection.write(persistedFavorites);
        }
    }
}

export async function appendImageGenerationHistory(draft: ImageGenerationHistoryDraft): Promise<ImageGenerationHistoryItem[]> {
    if (typeof window === 'undefined') return [];

    const draftItem = sanitizeHistoryItem({
        id: createHistoryId(),
        prompt: draft.prompt,
        model: draft.model,
        aspectRatio: draft.aspectRatio,
        imageSize: draft.imageSize,
        quality: draft.quality,
        generateCount: draft.generateCount,
        referenceImages: draft.referenceImages ?? [],
        createdAt: Date.now(),
    });

    if (!draftItem) return readImageGenerationHistory();

    const history = await persistHistoryItems(readImageGenerationHistory());
    const nextReferenceImages = await persistReferenceImages(draftItem.referenceImages, draftItem.model);
    const nextItem = areStringArraysEqual(draftItem.referenceImages, nextReferenceImages)
        ? draftItem
        : { ...draftItem, referenceImages: nextReferenceImages };
    const deduped = history.filter((item) => {
        return !(item.prompt === nextItem.prompt
            && item.model === nextItem.model
            && item.aspectRatio === nextItem.aspectRatio
            && item.imageSize === nextItem.imageSize
                && item.quality === nextItem.quality
            && item.generateCount === nextItem.generateCount);
    });
    const nextHistory = [nextItem, ...deduped].slice(0, MAX_ITEMS);
    historyCollection.write(nextHistory);
    return nextHistory;
}

export function clearImageGenerationHistory() {
    historyCollection.clear();
}

export function getRecentReferenceLibrary(limit = 10): RecentReferenceImageItem[] {
    const seen = new Set<string>();
    const items: RecentReferenceImageItem[] = [];

    for (const historyItem of readImageGenerationHistory()) {
        for (const image of historyItem.referenceImages) {
            if (!image || seen.has(image)) continue;
            seen.add(image);
            items.push({
                image,
                prompt: historyItem.prompt,
                historyId: historyItem.id,
                createdAt: historyItem.createdAt,
            });
            if (items.length >= limit) {
                return items;
            }
        }
    }

    return items;
}

export function readFavoriteReferenceImages(): FavoriteReferenceImageItem[] {
    return favoriteCollection.read();
}

export async function saveFavoriteReferenceImage(image: string, label: string): Promise<FavoriteReferenceImageItem[]> {
    if (typeof window === 'undefined' || !image) return [];

    const favorites = await persistFavoriteItems(readFavoriteReferenceImages());
    const persistedImage = await ensureImageRef(image);
    if (!persistedImage) return favorites;
    const trimmedLabel = label.trim() || '未命名参考图';
    const existing = favorites.find((item) => item.image === persistedImage);
    const now = Date.now();

    const nextFavorites = existing
        ? favorites.map((item) => item.image === persistedImage ? { ...item, label: trimmedLabel, lastUsedAt: now } : item)
        : [{ id: createHistoryId(), image: persistedImage, label: trimmedLabel, createdAt: now, lastUsedAt: now }, ...favorites].slice(0, MAX_FAVORITE_REFERENCES);

    favoriteCollection.write(nextFavorites);
    return nextFavorites;
}

export function renameFavoriteReferenceImage(id: string, label: string): FavoriteReferenceImageItem[] {
    const favorites = readFavoriteReferenceImages();
    const trimmedLabel = label.trim() || '未命名参考图';
    const nextFavorites = favorites.map((item) => item.id === id ? { ...item, label: trimmedLabel } : item);
    favoriteCollection.write(nextFavorites);
    return nextFavorites;
}

export function removeFavoriteReferenceImage(id: string): FavoriteReferenceImageItem[] {
    const nextFavorites = readFavoriteReferenceImages().filter((item) => item.id !== id);
    favoriteCollection.write(nextFavorites);
    return nextFavorites;
}

export function touchFavoriteReferenceImage(id: string): FavoriteReferenceImageItem[] {
    const now = Date.now();
    const nextFavorites = readFavoriteReferenceImages()
        .map((item) => item.id === id ? { ...item, lastUsedAt: now } : item)
        .sort((left, right) => right.lastUsedAt - left.lastUsedAt);
    favoriteCollection.write(nextFavorites);
    return nextFavorites;
}

export function subscribeImageGenerationHistory(listener: () => void): () => void {
    return historyCollection.subscribe(listener);
}

export function subscribeFavoriteReferenceImages(listener: () => void): () => void {
    return favoriteCollection.subscribe(listener);
}