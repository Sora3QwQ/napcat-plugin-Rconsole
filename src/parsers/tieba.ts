/**
 * rconsole-plus NapCat Plugin - Baidu Tieba Parser
 * Handles: tieba.baidu.com thread links
 */

import axios from 'axios';
import { BaseParser } from './base-parser.js';
import { seg, buildForwardNode } from '../types/parser.js';
import { GENERAL_REQ_LINK, COMMON_USER_AGENT } from '../utils/api-constants.js';
import { Downloader } from '../utils/downloader.js';
import path from 'node:path';

export class TiebaParser extends BaseParser {
    name = 'tieba';
    displayName = '百度贴吧';
    priority = 300;

    patterns = [
        /(?:https?:\/\/)?tieba\.baidu\.com\/p\/\d+/,
        /(?:https?:\/\/)?tieba\.baidu\.com\/mo\/q\/[A-Za-z\d._?%&+\-=\/#]*/,
    ];

    async handle(ctx: any, event: any, match: RegExpExecArray): Promise<boolean> {
        const url = match[0];

        try {
            await this.sendText(ctx, event, `${this.identifyPrefix}识别：百度贴吧`);

            // Use general parse API
            const apiUrl = GENERAL_REQ_LINK.link.replace('{}', encodeURIComponent(url));
            const resp = await axios.get(apiUrl, {
                headers: { 'User-Agent': COMMON_USER_AGENT },
                timeout: 15000,
            });

            const data = resp.data?.data;
            if (!data) {
                // Fallback: try direct page parse
                await this.handleDirectParse(ctx, event, url);
                return true;
            }

            if (data.title) {
                await this.sendText(ctx, event, `📝 ${data.title}`);
            }

            const mediaUrl = data.url;
            if (mediaUrl) {
                if (mediaUrl.match(/\.(jpg|png|webp|gif)$/i)) {
                    await this.sendImage(ctx, event, mediaUrl);
                } else {
                    const cachePath = this.getCachePath(event);
                    const outputPath = path.join(cachePath, 'tieba.mp4');
                    try {
                        const dl = new Downloader();
                        await dl.download(mediaUrl, outputPath);
                        await this.sendVideo(ctx, event, outputPath);
                    } finally {
                        await this.cleanupFile(outputPath);
                    }
                }
            }
        } catch (err: any) {
            this.logError('Parse failed:', err.message);
            await this.sendText(ctx, event, '贴吧解析失败');
        }

        return true;
    }

    private async handleDirectParse(ctx: any, event: any, url: string): Promise<void> {
        try {
            const resp = await axios.get(url, {
                headers: { 'User-Agent': COMMON_USER_AGENT },
                timeout: 15000,
            });

            const html = typeof resp.data === 'string' ? resp.data : '';

            // Extract title
            const titleMatch = html.match(/<title>([^<]+)<\/title>/);
            const title = titleMatch?.[1]?.replace(/_百度贴吧$/, '') || '';

            if (title) {
                await this.sendText(ctx, event, `📝 ${title}`);
            }

            // Extract images
            const images: string[] = [];
            const imgMatches = html.matchAll(/class="BDE_Image"[^>]*src="([^"]+)"/gi);
            for (const m of imgMatches) {
                if (m[1] && !images.includes(m[1])) images.push(m[1]);
            }

            if (images.length > 0) {
                await this.sendImagesBatched(ctx, event, images.slice(0, 9));
            }

            // Extract video
            const videoMatch = html.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/i);
            if (videoMatch) {
                const cachePath = this.getCachePath(event);
                const outputPath = path.join(cachePath, 'tieba.mp4');
                try {
                    const dl = new Downloader();
                    await dl.download(videoMatch[0], outputPath);
                    await this.sendVideo(ctx, event, outputPath);
                } finally {
                    await this.cleanupFile(outputPath);
                }
            }
        } catch (err: any) {
            this.logWarn('Direct parse failed:', err.message);
        }
    }
}