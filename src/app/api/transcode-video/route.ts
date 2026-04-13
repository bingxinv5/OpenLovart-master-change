import { NextRequest, NextResponse } from 'next/server';
import { writeFile, readFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';

const execFileAsync = promisify(execFile);

const TMP_DIR = join(process.cwd(), '.tmp-video');
const MAX_INPUT_VIDEO_BYTES = 150 * 1024 * 1024;
const MAX_OUTPUT_VIDEO_BYTES = 200 * 1024 * 1024;
const TRANSCODE_TIMEOUT_MS = 120_000;
const ALLOWED_VIDEO_MIME_TYPES = new Set([
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-matroska',
    'video/x-msvideo',
    'video/mpeg',
    'video/3gpp',
    'application/octet-stream',
]);

async function ensureTmpDir() {
    if (!existsSync(TMP_DIR)) {
        await mkdir(TMP_DIR, { recursive: true });
    }
}

export async function POST(request: NextRequest) {
    const id = randomUUID().slice(0, 8);
    let requestTmpDir = '';
    let inputPath = '';
    let outputPath = '';

    try {
        await ensureTmpDir();

        const formData = await request.formData();
        const file = formData.get('video');
        if (!(file instanceof File)) {
            return NextResponse.json({ error: '未提供视频文件' }, { status: 400 });
        }

        if (file.size <= 0) {
            return NextResponse.json({ error: '上传文件为空' }, { status: 400 });
        }

        if (file.size > MAX_INPUT_VIDEO_BYTES) {
            return NextResponse.json(
                { error: `上传视频不能超过 ${(MAX_INPUT_VIDEO_BYTES / 1024 / 1024).toFixed(0)}MB` },
                { status: 413 },
            );
        }

        if (file.type && !ALLOWED_VIDEO_MIME_TYPES.has(file.type)) {
            return NextResponse.json(
                { error: `暂不支持的视频类型: ${file.type}` },
                { status: 415 },
            );
        }

        const ext = file.name.split('.').pop()?.toLowerCase() || 'mov';
        requestTmpDir = join(TMP_DIR, id);
        await mkdir(requestTmpDir, { recursive: true });
        inputPath = join(requestTmpDir, `input.${ext}`);
        outputPath = join(requestTmpDir, 'output.mp4');

        // Write uploaded file to disk
        const buffer = Buffer.from(await file.arrayBuffer());
        await writeFile(inputPath, buffer);

        console.log(`[transcode] Input: ${inputPath} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);

        // Transcode with FFmpeg to H.264 + AAC
        // -y: overwrite, -i: input, -c:v libx264: H.264 video codec
        // -preset fast: balance speed/quality, -crf 23: good quality
        // -c:a aac: AAC audio, -movflags +faststart: web streaming
        // -pix_fmt yuv420p: maximum browser compatibility
        const args = [
            '-y',
            '-i', inputPath,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-loglevel', 'warning',
            outputPath,
        ];

        console.log(`[transcode] Running: ffmpeg ${args.join(' ')}`);

        try {
            const { stderr } = await execFileAsync('ffmpeg', args, {
                timeout: TRANSCODE_TIMEOUT_MS,
                maxBuffer: 4 * 1024 * 1024,
            });
            if (stderr) console.log(`[transcode] FFmpeg stderr: ${stderr}`);
        } catch (ffmpegError: unknown) {
            const error = ffmpegError as NodeJS.ErrnoException & { stderr?: string; killed?: boolean; signal?: string };
            const details = error.stderr || error.message;
            console.error('[transcode] FFmpeg failed:', details);
            return NextResponse.json({
                error: error.killed || error.signal === 'SIGTERM' ? '视频转码超时' : '视频转码失败',
                details,
            }, { status: error.killed || error.signal === 'SIGTERM' ? 504 : 422 });
        }

        // Read output and return as base64 data URL
        const outputBuffer = await readFile(outputPath);

        if (outputBuffer.byteLength > MAX_OUTPUT_VIDEO_BYTES) {
            return NextResponse.json(
                { error: `转码结果超过 ${(MAX_OUTPUT_VIDEO_BYTES / 1024 / 1024).toFixed(0)}MB 限制` },
                { status: 413 },
            );
        }

        console.log(`[transcode] Output: ${(outputBuffer.length / 1024 / 1024).toFixed(1)} MB`);

        // Return as binary response for efficiency
        return new NextResponse(outputBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'video/mp4',
                'Content-Length': outputBuffer.length.toString(),
            },
        });
    } catch (error: unknown) {
        console.error('[transcode] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : '视频转码失败' },
            { status: 500 },
        );
    } finally {
        if (requestTmpDir) {
            try {
                await rm(requestTmpDir, { recursive: true, force: true });
            } catch {}
        }
    }
}

