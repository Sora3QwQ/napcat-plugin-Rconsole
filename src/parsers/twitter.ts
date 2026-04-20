/**
 * rconsole-plus NapCat Plugin - Twitter/X Parser
 * Uses general parse API to extract media from x.com links.
 */

import axios from 'axios';
import { BaseParser } from './base-parser.js';
import { seg } from '../types/parser.js';
import { GENERAL_REQ_LINK, COMMON_USER_AGENT } from '../utils/api-constants.js';
import { Downloader } from '../utils/downloader.js';
import { pluginState } from '../core/state.js';
import { testProxy } from '../utils/common.js';
import path from 'node:path';

export class TwitterParser extends BaseParser {
    name = 'twitter';
    displayName = 'X/Twitter';
    priority = 300;

    patterns = [
        /https?:\/\/x\.com\/[\w]+\/status\/\d+(\/photo\/\d+)?/,
    ];

    async handle(ctx: any, event: any, match: RegExpExecArray): Promise<boolean> {
        const twitterUrl = match[0];

        // Check proxy for overseas access
        const proxyUrl = pluginState.getProxyUrl();
        if (!proxyUrl) {
            const canAccess = await testProxy('x.com', 443).catch(() => false);
            if (!canAccess) {
                await this.sendText(ctx, event, '未配置代理，无法解析X/Twitter');
                return true;
            }
        }

        await this.sendText(ctx, event, `${this.identifyPrefix}识别：X/Twitter`);

        try {
            let videoUrl = GENERAL_REQ_LINK.link.replace('{}', twitterUrl);
            const config = {
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'User-Agent': COMMON_USER_AGENT,
                },
                timeout: 15000,
            };

            let resp = await axios.get(videoUrl, config);
            if (resp.data?.data == null) {
                // Try with /photo/1
                videoUrl = GENERAL_REQ_LINK.link.replace('{}', twitterUrl + '/photo/1');
                resp = await axios.get(videoUrl, config);
            }

            const url = resp.data?.data?.url;
            if (!url) {
                await this.sendText(ctx, event, 'X/Twitter内容获取失败');
                return true;
            }

            if (url.endsWith('.jpg') || url.endsWith('.png') || url.endsWith('.webp')) {
                // Image
                await this.sendImage(ctx, event, url);
            } else {
                // Video
                const cachePath = this.getCachePath(event);
                const outputPath = path.join(cachePath, 'twitter.mp4');
                try {
                    const dl = new Downloader({ proxy: proxyUrl });
                    await dl.download(url, outputPath);
                    await this.sendVideo(ctx, event, outputPath);
                } finally {
                    await this.cleanupFile(outputPath);
                }
            }
        } catch (err: any) {
            this.logError('Parse failed:', err.message);
            await this.sendText(ctx, event, 'X/Twitter解析失败');
        }

        return true;
    }
}