/**
 * rconsole-plus NapCat Plugin - Unified Downloader
 * Async stream download with retry, ffmpeg merge support.
 */

import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import child_process from 'node:child_process';
import util from 'node:util';

const execFile = util.promisify(child_process.execFile);

export interface DownloaderOptions {
    headers?: Record<string, string>;
    proxy?: string | null;
    timeout?: number;
    maxRetries?: number;
}

export interface DownloadResult {
    outputPath: string;
    size: number;
}

export class Downloader {
    private headers: Record<string, string>;
    private proxy: string | null;
    private timeout: number;
    private maxRetries: number;

    constructor(options: DownloaderOptions = {}) {
        this.headers = options.headers || {};
        this.proxy = options.proxy || null;
        this.timeout = options.timeout || 120000;
        this.maxRetries = options.maxRetries || 3;
    }

    /** Stream download a file with retry */
    async download(
        url: string,
        outputPath: string,
        extraHeaders: Record<string, string> = {},
        progressCallback?: (progress: number) => void
    ): Promise<DownloadResult> {
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        let cdnHost = 'unknown';
        try { cdnHost = new URL(url).hostname; } catch { /* ignore */ }

        const baseRetryDelay = 1000;

        for (let retry = 0; retry <= this.maxRetries; retry++) {
            try {
                const startTime = Date.now();
                const axiosConfig: any = {
                    responseType: 'stream',
                    headers: { ...this.headers, ...extraHeaders },
                    timeout: this.timeout,
                };

                if (this.proxy) {
                    try {
                        // Dynamic import - https-proxy-agent is optional
                        const mod = await import(/* @vite-ignore */ 'https-proxy-agent');
                        const HttpsProxyAgent = mod.HttpsProxyAgent || mod.default;
                        if (HttpsProxyAgent) {
                            axiosConfig.httpsAgent = new HttpsProxyAgent(this.proxy);
                        }
                    } catch { /* proxy agent not available, skip */ }
                }

                const { data, headers } = await axios.get(url, axiosConfig);
                const contentLength = headers['content-length'];
                const totalLen = parseInt(String(contentLength || '0'), 10);

                return await new Promise<DownloadResult>((resolve, reject) => {
                    let currentLen = 0;
                    data.on('data', (chunk: Buffer) => {
                        currentLen += chunk.length;
                        if (progressCallback && totalLen > 0) {
                            progressCallback(currentLen / totalLen);
                        }
                    });
                    data.on('error', reject);

                    const writeStream = fs.createWriteStream(outputPath);
                    writeStream.on('finish', () => {
                        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                        const actualSize = totalLen || currentLen;
                        const sizeMB = (actualSize / 1024 / 1024).toFixed(2);
                        const speed = (parseFloat(sizeMB) / parseFloat(duration)).toFixed(2);
                        console.log(`[Downloader] CDN:${cdnHost} ${sizeMB}MB ${duration}s ${speed}MB/s`);
                        resolve({ outputPath, size: actualSize });
                    });
                    writeStream.on('error', reject);
                    data.pipe(writeStream);
                });
            } catch (err: any) {
                if (retry < this.maxRetries) {
                    const delay = baseRetryDelay * Math.pow(2, retry);
                    console.warn(`[Downloader] retry(${retry + 1}/${this.maxRetries}): ${err.message}`);
                    await new Promise(r => setTimeout(r, delay));
                } else {
                    console.error(`[Downloader] failed: ${err.message}`);
                    throw err;
                }
            }
        }
        throw new Error('Download failed after all retries');
    }

    /** Download video + audio and merge to mp4 (DASH format) */
    async downloadAndMerge(
        videoUrl: string,
        audioUrl: string,
        outputPath: string,
        extraHeaders: Record<string, string> = {}
    ): Promise<DownloadResult> {
        const dir = path.dirname(outputPath);
        const baseName = path.basename(outputPath, '.mp4');
        const vPath = path.join(dir, `${baseName}_v.m4s`);
        const aPath = path.join(dir, `${baseName}_a.m4s`);

        try {
            // Parallel download video and audio
            await Promise.all([
                this.download(videoUrl, vPath, extraHeaders),
                this.download(audioUrl, aPath, extraHeaders),
            ]);
            // Merge with ffmpeg
            await this.mergeToMp4(vPath, aPath, outputPath);
            return { outputPath, size: fs.statSync(outputPath).size };
        } finally {
            await this.safeUnlink(vPath);
            await this.safeUnlink(aPath);
        }
    }

    /** Merge video and audio using ffmpeg */
    async mergeToMp4(videoPath: string, audioPath: string, outputPath: string) {
        const env = process.platform === 'linux'
            ? { ...process.env, PATH: '/usr/local/bin:' + (process.env.PATH || '') }
            : process.env;
        try {
            await execFile('ffmpeg', ['-y', '-i', videoPath, '-i', audioPath, '-c', 'copy', outputPath], { env });
        } catch (err: any) {
            console.error(`[Downloader] ffmpeg merge failed: ${err.message}`);
            throw err;
        }
    }

    /** Download m4s audio and convert to mp3 */
    async downloadAudioToMp3(
        m4sUrl: string,
        outputDir: string,
        extraHeaders: Record<string, string> = {}
    ): Promise<string> {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        const tempPath = path.join(outputDir, 'temp.m4s');
        const mp3Path = path.join(outputDir, 'temp.mp3');

        await this.download(m4sUrl, tempPath, extraHeaders);
        try {
            child_process.execSync(`ffmpeg -i "${tempPath}" "${mp3Path}" -y -loglevel quiet`);
        } finally {
            await this.safeUnlink(tempPath);
        }
        return mp3Path;
    }

    /** Safely delete a file */
    private async safeUnlink(filePath: string) {
        try {
            if (fs.existsSync(filePath)) {
                await fs.promises.unlink(filePath);
            }
        } catch { /* ignore */ }
    }
}

/** Bilibili-specific headers */
export const BILI_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com',
};

/** Create a Bilibili downloader instance */
export function createBiliDownloader(proxy?: string | null): Downloader {
    return new Downloader({
        headers: BILI_HEADERS,
        proxy: proxy || null,
    });
}

/** Create a generic downloader instance */
export function createDownloader(
    headers?: Record<string, string>,
    proxy?: string | null
): Downloader {
    return new Downloader({ headers, proxy: proxy || null });
}