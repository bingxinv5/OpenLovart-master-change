/**
 * AI Designer — Message rendering & content processing.
 *
 * Functions for transforming chat content into renderable React nodes
 * and extracting/stripping embedded media URLs.
 */

import React from 'react';

export function formatTime(date: Date) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export function extractGeneratedImageUrls(content: string): string[] {
    const imageUrls: string[] = [];

    const markdownImageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
    let markdownMatch: RegExpExecArray | null;
    while ((markdownMatch = markdownImageRegex.exec(content)) !== null) {
        imageUrls.push(markdownMatch[1]);
    }

    const base64Regex = /(data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=\s]+)/g;
    let base64Match: RegExpExecArray | null;
    while ((base64Match = base64Regex.exec(content)) !== null) {
        const url = base64Match[1].replace(/\s/g, '');
        if (!imageUrls.includes(url)) imageUrls.push(url);
    }

    const directUrlRegex = /(https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?[^\s"'<>]*)?)/gi;
    let directUrlMatch: RegExpExecArray | null;
    while ((directUrlMatch = directUrlRegex.exec(content)) !== null) {
        if (!imageUrls.includes(directUrlMatch[1])) imageUrls.push(directUrlMatch[1]);
    }

    return imageUrls;
}

export function removeImageUrlsFromContent(content: string): string {
    return content
        .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
        .replace(/\[[^\]]*\]\([^)]+\)/g, '')
        .replace(/(data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=\s]+)/g, '')
        .replace(/(https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?[^\s"'<>]*)?)/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function renderMarkdown(text: string): React.ReactNode {
    if (!text) return null;

    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let listBuffer: string[] = [];
    let codeBlock = false;
    let codeContent = '';

    const renderInline = (inlineText: string): React.ReactNode => {
        const parts: React.ReactNode[] = [];
        const regex = /(\*\*(.+?)\*\*|__(.+?)__|`(.+?)`|(\[(.+?)\]\((.+?)\)))/g;
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(inlineText)) !== null) {
            if (match.index > lastIndex) {
                parts.push(inlineText.slice(lastIndex, match.index));
            }
            if (match[2] || match[3]) {
                parts.push(<strong key={match.index} className="font-semibold">{match[2] || match[3]}</strong>);
            } else if (match[4]) {
                parts.push(<code key={match.index} className="px-1.5 py-0.5 bg-gray-100 text-gray-800 rounded text-xs font-mono">{match[4]}</code>);
            } else if (match[6]) {
                parts.push(
                    <a key={match.index} href={match[7]} className="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer">
                        {match[6]}
                    </a>
                );
            }
            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < inlineText.length) {
            parts.push(inlineText.slice(lastIndex));
        }

        return parts.length > 0 ? parts : inlineText;
    };

    const flushList = () => {
        if (listBuffer.length === 0) return;
        elements.push(
            <ul key={`list-${elements.length}`} className="list-disc list-inside space-y-1 my-2 text-sm text-gray-700">
                {listBuffer.map((item, index) => (
                    <li key={index}>{renderInline(item)}</li>
                ))}
            </ul>
        );
        listBuffer = [];
    };

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];

        if (line.trim().startsWith('```')) {
            if (!codeBlock) {
                flushList();
                codeBlock = true;
                codeContent = '';
            } else {
                elements.push(
                    <pre key={`code-${index}`} className="bg-gray-900 text-gray-100 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono">
                        <code>{codeContent}</code>
                    </pre>
                );
                codeBlock = false;
                codeContent = '';
            }
            continue;
        }

        if (codeBlock) {
            codeContent += (codeContent ? '\n' : '') + line;
            continue;
        }

        if (line.startsWith('### ')) { flushList(); elements.push(<h3 key={`h3-${index}`} className="text-sm font-bold text-gray-900 mt-3 mb-1">{renderInline(line.slice(4))}</h3>); continue; }
        if (line.startsWith('## ')) { flushList(); elements.push(<h2 key={`h2-${index}`} className="text-base font-bold text-gray-900 mt-3 mb-1">{renderInline(line.slice(3))}</h2>); continue; }
        if (line.startsWith('# ')) { flushList(); elements.push(<h1 key={`h1-${index}`} className="text-lg font-bold text-gray-900 mt-3 mb-1">{renderInline(line.slice(2))}</h1>); continue; }
        if (/^[\-*]\s/.test(line.trim())) { listBuffer.push(line.trim().slice(2)); continue; }
        if (/^\d+\.\s/.test(line.trim())) { listBuffer.push(line.trim().replace(/^\d+\.\s/, '')); continue; }
        if (/^---+$/.test(line.trim())) { flushList(); elements.push(<hr key={`hr-${index}`} className="border-gray-200 my-3" />); continue; }
        if (!line.trim()) { flushList(); continue; }

        flushList();
        elements.push(<p key={`p-${index}`} className="text-sm text-gray-700 leading-relaxed my-1">{renderInline(line)}</p>);
    }

    flushList();
    return elements;
}
