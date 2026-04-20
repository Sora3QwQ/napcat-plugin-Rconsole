/**
 * rconsole-plus NapCat Plugin - General Link Parser
 * Handles: kuaishou, xigua, pipix, zuiyou, weishi, etc.
 * Uses third-party parse API for various short-video platforms.
 */

import axios from 'axios';
import { BaseParser } from './base-parser.js';
import { seg } from '../types/parser.js';
import { GENERAL_REQ_LINK, WEISHI_VIDEO_INFO, COMMON_USER_AGENT } from '../utils/api-constants.js';
import { Downloader } from '../utils/downloader.js';
import path from 'node:path';

const PLATFORM_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
    { name: '快手', pattern: /(?:https?:\/\/)?v\.kuaishou\.com\/[A-Za-z\d]+/ },
    { name: '快手', pattern: /(?:https?:\/\/)?www\.kuaishou\.com\/short-video\/[A-Za-z\d]+/ },
    { name: '西瓜视频', pattern: /(?:https?:\/\/)?www\.ixigua\.com\/\d+/ },
    { name: '西瓜视频', pattern: /(?:https?:\/\/)?m\.ixigua\.com\/video\/\d+/ },
    { name: '皮皮虾', pattern: /(?:https?:\/\/)?h5\.pipix\.com\/s\/[A-Za-z\d]+/ },
    { name: '最右', pattern: /(?:https?:\/\/)?share\.xiaochuankeji\.cn\/[A-Za-z\d?=&]+/ },
    { name: '最右', pattern: /(?:https?:\/\/)?v\.zuiyou\.com\/[A-Za-z\d?=&]+/ },
    { name: '微视', pattern: /(?:https?:\/\/)?h5\.weishi\.qq\.com\/[A-Za-z\d._?%&+\-=\/#]+/ },
    { name: '微视', pattern: /(?:https?:\/\/)?isee\.weishi\.qq\.com\/[A-Za-z\d._?%&+\-=\/#]+/ },
    { name: '全民K歌', pattern: /(?:https?:\/\/)?node\.kg\.qq\.com\/[A-Za-z\d._?%&+\-=\/#]+/ },
    { name: '荔枝FM', pattern: /(?:https?:\/\/)?www\.lizhi\.fm\/[A-Za-z\d._?%&+\-=\/#]+/ },
    { name: '美拍', pattern: /(?:https?:\/\/)?www\.meipai\.com\/media\/\d+/ },
    { name: '新片场', pattern: /(?:https?:\/\/)?www\.xinpianchang\.com\/a\d+/ },
];

export class GeneralParser extends BaseParser {
    name = 'general';
    displayName = '通用解析';
    priority = 500; // Lower priority than specific parsers

    patterns = PLATFORM_PATTERNS.map(p => p.pattern);

    async handle(ctx: any, event: any, match: RegExpExecArray): Promise<boolean> {
        const url = match[0];

        // Identify which platform
        let platformName = '通用';
        for (const p of PLATFORM_PATTERNS) {
            if (p.pattern.test(url)) {
                platformName = p.name;
                break;
            }
        }

        // Special handling for weishi
        if (platformName === '微视') {
            return this.handleWeishi(ctx, event, url);
        }

        try {
            await this.sendText(ctx, event, `${this.identifyPrefix}识别：${platformName}，解析中...`);

            const apiUrl = GENERAL_REQ_LINK.link.replace('{}', encodeURIComponent(url));
            const resp = await axios.get(apiUrl, {
                headers: { 'User-Agent': COMMON_USER_AGENT },
                timeout: 15000,
            });

            const data = resp.data?.data;
            if (!data?.url) {
                await this.sendText(ctx, event, `${platformName}解析失败`);
                return true;
            }

            const mediaUrl: string = data.url;
            const title: string = data.title || '';

            if (title) {
                await this.sendText(ctx, event, title);
            }

            // Cover image
            if (data.cover) {
                await this.sendImage(ctx, event, data.cover);
            }

            // Download and send media
            if (mediaUrl.endsWith('.jpg') || mediaUrl.endsWith('.png') || mediaUrl.endsWith('.webp')) {
                await this.sendImage(ctx, event, mediaUrl);
            } else {
                const cachePath = this.getCachePath(event);
                const outputPath = path.join(cachePath, `${this.name}.mp4`);
                try {
                    const dl = new Downloader();
                    await dl.download(mediaUrl, outputPath);
                    await this.sendVideo(ctx, event, outputPath);
                } finally {
                    await this.cleanupFile(outputPath);
                }
            }
        } catch (err: any) {
            this.logError('Parse failed:', err.message);
            await this.sendText(ctx, event, `${platformName}解析失败`);
        }

        return true;
    }

    private async handleWeishi(ctx: any, event: any, url: string): Promise<boolean> {
        try {
            // Extract feedid
            let feedId: string | undefined;
            const feedMatch = url.match(/feedid=([A-Za-z\d_]+)/);
            if (feedMatch) {
                feedId = feedMatch[1];
            } else {
                // Resolve short link
                const resp = await fetch(url, { redirect: 'follow' });
                const redirectUrl = resp.url;
                feedId = /feedid=([A-Za-z\d_]+)/.exec(redirectUrl)?.[1];
            }

            if (!feedId) {
                await this.sendText(ctx, event, '微视链接解析失败');
                return true;
            }

            const apiUrl = WEISHI_VIDEO_INFO.replace('{}', feedId);
            const resp = await axios.get(apiUrl, { timeout: 10000 });
            const feed = resp.data?.data?.feeds?.[0];

            if (!feed) {
                await this.sendText(ctx, event, '微视视频信息获取失败');
                return true;
            }

            const title = feed.feed_desc || '微视视频';
            const poster = feed.poster?.url || feed.video_cover?.static_cover?.url;

            await this.sendText(ctx, event, `${this.identifyPrefix}识别：微视\n${title}`);

            if (poster) {
                await this.sendImage(ctx, event, poster);
            }

            const videoUrl = feed.video_url;
            if (videoUrl) {
                const cachePath = this.getCachePath(event);
                const outputPath = path.join(cachePath, 'weishi.mp4');
                try {
                    const dl = new Downloader();
                    await dl.download(videoUrl, outputPath);
                    await this.sendVideo(ctx, event, outputPath);
                } finally {
                    await this.cleanupFile(outputPath);
                }
            }
        } catch (err: any) {
            this.logError('Weishi parse failed:', err.message);
            await this.sendText(ctx, event, '微视解析失败');
        }

        return true;
    }
}