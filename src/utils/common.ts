/**
 * rconsole-plus NapCat Plugin - Common Utilities
 * Migrated from rconsole-plugin utils/common.js
 */

import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import child_process from 'node:child_process';

/** Retry an axios request */
export async function retryAxiosReq<T = any>(
    requestFn: () => Promise<any>,
    retries: number = 3,
    delay: number = 1000
): Promise<T> {
    for (let i = 0; i <= retries; i++) {
        try {
            const resp = await requestFn();
            return resp.data?.data ?? resp.data;
        } catch (err: any) {
            if (i < retries) {
                await new Promise(r => setTimeout(r, delay));
            } else {
                throw err;
            }
        }
    }
    throw new Error('Request failed after retries');
}

/** Download an image to local path */
export async function downloadImg(opts: {
    img: string;
    dir: string;
    fileName?: string;
    headersExt?: Record<string, string>;
}): Promise<string> {
    const { img, dir, fileName, headersExt } = opts;
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const ext = path.extname(new URL(img).pathname) || '.jpg';
    const name = fileName || `${Date.now()}${ext}`;
    const filePath = path.join(dir, name);

    const resp = await axios.get(img, {
        responseType: 'stream',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            ...(headersExt || {}),
        },
        timeout: 30000,
    });

    const writer = fs.createWriteStream(filePath);
    resp.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(filePath));
        writer.on('error', reject);
    });
}

/** Download audio to local path */
export async function downloadAudio(
    url: string,
    dir: string,
    fileName: string = 'audio'
): Promise<string> {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const ext = '.mp3';
    const filePath = path.join(dir, `${fileName}${ext}`);

    const resp = await axios.get(url, {
        responseType: 'stream',
        timeout: 30000,
    });

    const writer = fs.createWriteStream(filePath);
    resp.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(filePath));
        writer.on('error', reject);
    });
}

/** Check if a CLI tool exists in PATH */
export async function checkToolInCurEnv(toolName: string): Promise<boolean> {
    try {
        const cmd = process.platform === 'win32' ? `where ${toolName}` : `which ${toolName}`;
        child_process.execSync(cmd, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

/** Format seconds to HH:MM:SS or MM:SS */
export function secondsToTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    if (h > 0) {
        return `${String(h).padStart(2, '0')}:${mm}:${ss}`;
    }
    return `${mm}:${ss}`;
}

/** Truncate string to max length */
export function truncateString(str: string, maxLen: number = 100): string {
    if (!str || str.length <= maxLen) return str || '';
    return str.substring(0, maxLen) + '...';
}

/** Format bilibili video info map */
export function formatBiliInfo(dataMap: Record<string, number>): string {
    return Object.entries(dataMap)
        .map(([label, value]) => `${label}: ${formatCount(value)}`)
        .join(' | ');
}

/** Format large numbers */
export function formatCount(num: number): string {
    if (num >= 100000000) return (num / 100000000).toFixed(1) + '亿';
    if (num >= 10000) return (num / 10000).toFixed(1) + '万';
    return String(num);
}

/** Transform URL to short link (placeholder) */
export async function urlTransformShortLink(url: string): Promise<string> {
    return url;
}

/** Clean filename of special characters */
export function cleanFilename(name: string): string {
    return name.replace(/[<>:"\/\\|?*\x00-\x1f]/g, '_').trim();
}

/** Estimate reading time in minutes */
export function estimateReadingTime(text: string, wpm: number = 300): number {
    const words = text.length; // For CJK, 1 char ≈ 1 word
    return Math.max(1, Math.ceil(words / wpm));
}

/** Test if proxy is reachable */
export async function testProxy(addr: string, port: number): Promise<boolean> {
    try {
        await axios.get('https://www.google.com', {
            timeout: 5000,
            proxy: { host: addr, port, protocol: 'http' },
        });
        return true;
    } catch {
        return false;
    }
}

/** Safe file delete */
export async function checkAndRemoveFile(filePath: string) {
    try {
        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
        }
    } catch { /* ignore */ }
}

/** Check if file exists */
export async function checkFileExists(filePath: string): Promise<boolean> {
    try {
        await fs.promises.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/** Make directory if not exists */
export function mkdirIfNotExists(dir: string) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}