/**
 * rconsole-plus NapCat Plugin - Miyoushe (米游社) Parser
 * Handles: miyoushe.com, bbs.mihoyo.com articles
 */

import axios from 'axios';
import { BaseParser } from './base-parser.js';
import { seg, buildForwardNode } from '../types/parser.js';
import { MIYOUSHE_ARTICLE, COMMON_USER_AGENT } from '../utils/api-constants.js';
import { Downloader } from '../utils/downloader.js';
import path from 'node:path';

export class MiyousheParser extends BaseParser {
    name = 'miyoushe';
    displayName = '米游社';
    priority = 300;

    patterns = [
        /(?:https?:\/\/)?(?:www\.)?miyoushe\.com\/[A-Za-z\d._?%&+\-=\/#]*/,
        /(?:https?:\/\/)?bbs\.mihoyo\.com\/[A-Za-z\d._?%&+\-=\/#]*/,
    ];

    async handle(ctx: any, event: any, match: RegExpExecArray): Promise<boolean> {
        const url = event.raw_message?.trim() || '';

        // Extract post ID
        const postId = /article\/(\d+)/.exec(url)?.[1] || /\/?(\d{10,})/.exec(url)?.[1];
        if (!postId) {
            await this.sendText(ctx, event, '无法提取米游社帖子ID');
            return true;
        }

        try {
            const apiUrl = MIYOUSHE_ARTICLE.replace('{}', postId);
            const resp = await axios.get(apiUrl, {
                headers: { 'User-Agent': COMMON_USER_AGENT },
                timeout: 10000,
            });

            const postData = resp.data?.data?.post;
            if (!postData) {
                await this.sendText(ctx, event, '米游社帖子获取失败');
                return true;
            }

            const post = postData.post;
            const user = postData.user;
            const stat = postData.stat;

            // Basic info
            const title = post.subject || '米游社帖子';
            const author = user?.nickname || '未知';
            let infoText = `${this.identifyPrefix}识别：米游社\n📝 ${title}\n作者：${author}`;

            if (stat) {
                infoText += `\n👍 ${stat.like_num || 0} · 💬 ${stat.reply_num || 0} · 👀 ${stat.view_num || 0}`;
            }

            // Cover
            const cover = post.cover || post.images?.[0];
            if (cover) {
                await this.sendMixed(ctx, event, [seg.image(cover), seg.text(infoText)]);
            } else {
                await this.sendText(ctx, event, infoText);
            }

            // Content text
            let content = '';
            try {
                const structured = JSON.parse(post.structured_content || '[]');
                for (const item of structured) {
                    if (item.insert) {
                        if (typeof item.insert === 'string') {
                            content += item.insert;
                        } else if (item.insert.image) {
                            // Will be handled as images below
                        }
                    }
                }
            } catch {
                content = (post.content || '').replace(/<[^>]+>/g, '').trim();
            }

            // Images
            const images = post.images || [];
            if (images.length > 0) {
                await this.sendImagesBatched(ctx, event, images);
            }

            // Video
            if (postData.vod_list?.length > 0) {
                const vod = postData.vod_list[0];
                const videoUrl = vod.resolutions?.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))?.[0]?.url;
                if (videoUrl) {
                    const cachePath = this.getCachePath(event);
                    const outputPath = path.join(cachePath, 'miyoushe.mp4');
                    try {
                        const dl = new Downloader();
                        await dl.download(videoUrl, outputPath);
                        await this.sendVideo(ctx, event, outputPath);
                    } finally {
                        await this.cleanupFile(outputPath);
                    }
                }
            }
        } catch (err: any) {
            this.logError('Parse failed:', err.message);
            await this.sendText(ctx, event, '米游社解析失败');
        }

        return true;
    }
}