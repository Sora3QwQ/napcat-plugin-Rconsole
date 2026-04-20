/**
 * rconsole-plus NapCat Plugin - AcFun Parser
 * Handles: acfun.cn, ac\d+ shortcodes
 */

import axios from 'axios';
import { BaseParser } from './base-parser.js';
import { Downloader } from '../utils/downloader.js';
import { COMMON_USER_AGENT } from '../utils/api-constants.js';
import { checkAndRemoveFile } from '../utils/common.js';
import path from 'node:path';
import fs from 'node:fs';
import child_process from 'node:child_process';

export class AcfunParser extends BaseParser {
    name = 'acfun';
    displayName = 'A站';
    priority = 300;

    patterns = [
        /(?:https?:\/\/)?(?:www\.)?acfun\.cn\/v\/ac\d+/,
        /(?:https?:\/\/)?m\.acfun\.cn\/v\/\?ac=\d+/,
        /^ac\d{8}$/,
    ];

    async handle(ctx: any, event: any, match: RegExpExecArray): Promise<boolean> {
        let inputMsg = event.raw_message?.trim() || '';

        // Normalize URL
        if (inputMsg.includes('m.acfun.cn')) {
            const acId = /ac=(\d+)/.exec(inputMsg)?.[1];
            if (acId) inputMsg = `https://www.acfun.cn/v/ac${acId}`;
        } else if (/^ac\d+$/.test(inputMsg)) {
            inputMsg = `https://www.acfun.cn/v/${inputMsg}`;
        }

        if (!inputMsg.startsWith('http')) {
            inputMsg = 'https://' + inputMsg;
        }

        try {
            // Fetch page to extract video info
            const resp = await axios.get(inputMsg, {
                headers: { 'User-Agent': COMMON_USER_AGENT },
                timeout: 15000,
            });

            const html = typeof resp.data === 'string' ? resp.data : '';

            // Extract title
            const titleMatch = html.match(/<title>([^<]+)<\/title>/);
            const title = titleMatch?.[1]?.replace(/ - AcFun.*$/, '') || 'A站视频';

            await this.sendText(ctx, event, `${this.identifyPrefix}识别：A站，${title}`);

            // Extract video info JSON
            const infoMatch = html.match(/window\.videoInfo\s*=\s*(\{[^;]+\});/);
            if (!infoMatch?.[1]) {
                // Try alternative: extract m3u8 from page
                const m3u8Match = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/i);
                if (m3u8Match) {
                    await this.downloadAndSendM3u8(ctx, event, m3u8Match[0]);
                } else {
                    await this.sendText(ctx, event, 'A站视频解析失败');
                }
                return true;
            }

            const videoInfo = JSON.parse(infoMatch[1]);
            const ksPlayJson = videoInfo.currentVideoInfo?.ksPlayJson;
            if (ksPlayJson) {
                const playInfo = JSON.parse(ksPlayJson);
                const representations = playInfo.adaptationSet?.[0]?.representation || [];
                // Pick best quality
                const best = representations.sort((a: any, b: any) => (b.bandwidth || 0) - (a.bandwidth || 0))[0];
                const videoUrl = best?.url;
                if (videoUrl) {
                    const cachePath = this.getCachePath(event);
                    const outputPath = path.join(cachePath, 'acfun.mp4');
                    try {
                        const dl = new Downloader({ headers: { 'User-Agent': COMMON_USER_AGENT, 'Referer': 'https://www.acfun.cn/' } });
                        await dl.download(videoUrl, outputPath);
                        await this.sendVideo(ctx, event, outputPath);
                    } finally {
                        await this.cleanupFile(outputPath);
                    }
                    return true;
                }
            }

            await this.sendText(ctx, event, 'A站视频解析失败：无法提取视频流');
        } catch (err: any) {
            this.logError('Parse failed:', err.message);
            await this.sendText(ctx, event, 'A站解析失败');
        }

        return true;
    }

    private async downloadAndSendM3u8(ctx: any, event: any, m3u8Url: string) {
        const cachePath = this.getCachePath(event);
        const outputPath = path.join(cachePath, 'acfun.mp4');
        try {
            // Use ffmpeg to download m3u8
            child_process.execSync(
                `ffmpeg -i "${m3u8Url}" -c copy "${outputPath}" -y -loglevel quiet`,
                { timeout: 120000 }
            );
            if (fs.existsSync(outputPath)) {
                await this.sendVideo(ctx, event, outputPath);
            }
        } catch (err: any) {
            this.logWarn('m3u8 download failed:', err.message);
        } finally {
            await this.cleanupFile(outputPath);
        }
    }
}