/**
 * rconsole-plus NapCat Plugin - Xiaoheihe (小黑盒) Parser
 * Handles: xiaoheihe.cn articles, game pages, links
 */

import axios from 'axios';
import { BaseParser } from './base-parser.js';
import { seg, buildForwardNode } from '../types/parser.js';
import { XHH_BBS_LINK, XHH_GAME_LINK, COMMON_USER_AGENT } from '../utils/api-constants.js';
import { Downloader } from '../utils/downloader.js';
import path from 'node:path';

const XHH_HEADERS = {
    'User-Agent': COMMON_USER_AGENT,
    'Accept': 'application/json',
};

export class XiaoheiheParser extends BaseParser {
    name = 'xiaoheihe';
    displayName = '小黑盒';
    priority = 300;

    patterns = [
        /(?:https?:\/\/)?(?:api\.)?xiaoheihe\.cn\/[A-Za-z\d._?%&+\-=\/#]*/,
        /(?:https?:\/\/)?(?:www\.)?xiaoheihe\.cn\/[A-Za-z\d._?%&+\-=\/#]*/,
    ];

    async handle(ctx: any, event: any, match: RegExpExecArray): Promise<boolean> {
        const url = event.raw_message?.trim() || '';

        try {
            // Extract link_id or game info
            const linkId = /link_id=(\d+)/.exec(url)?.[1] || /newsId=(\d+)/.exec(url)?.[1];
            const gameId = /appid=(\d+)/.exec(url)?.[1];

            if (gameId) {
                return await this.handleGame(ctx, event, gameId);
            }

            if (linkId) {
                return await this.handleArticle(ctx, event, linkId);
            }

            // Try extracting from URL path
            const pathMatch = /\/v\d+\/bbs\/app\/link\/tree.*link_id=(\d+)/.exec(url)
                || /\/bbs\/(\d+)/.exec(url)
                || /\/(\d{6,})/.exec(url);
            if (pathMatch?.[1]) {
                return await this.handleArticle(ctx, event, pathMatch[1]);
            }

            await this.sendText(ctx, event, '无法提取小黑盒内容ID');
        } catch (err: any) {
            this.logError('Parse failed:', err.message);
            await this.sendText(ctx, event, '小黑盒解析失败');
        }

        return true;
    }

    private async handleArticle(ctx: any, event: any, linkId: string): Promise<boolean> {
        const headers = { ...XHH_HEADERS };
        const cookie = this.config.xiaoheihe.cookie;
        if (cookie) (headers as any)['Cookie'] = cookie;

        const resp = await axios.get(XHH_BBS_LINK, {
            params: { link_id: linkId },
            headers,
            timeout: 10000,
        });

        const data = resp.data?.result;
        if (!data) {
            await this.sendText(ctx, event, '小黑盒文章获取失败');
            return true;
        }

        const title = data.title || '小黑盒文章';
        const content = (data.description || '').substring(0, 500);
        const user = data.user?.username || '未知';
        const images = data.media_extra_info?.image_list || data.pics || [];

        let infoText = `${this.identifyPrefix}识别：小黑盒\n📝 ${title}\n作者：${user}`;
        if (content) infoText += `\n${content}`;

        // Cover or first image
        const cover = data.share_pic || images[0];
        if (cover) {
            await this.sendMixed(ctx, event, [seg.image(cover), seg.text(infoText)]);
        } else {
            await this.sendText(ctx, event, infoText);
        }

        // Additional images
        if (images.length > 1) {
            await this.sendImagesBatched(ctx, event, images.slice(1));
        }

        // Video
        const videoUrl = data.media_extra_info?.video?.url || data.video?.url;
        if (videoUrl) {
            const cachePath = this.getCachePath(event);
            const outputPath = path.join(cachePath, 'xhh.mp4');
            try {
                const dl = new Downloader();
                await dl.download(videoUrl, outputPath);
                await this.sendVideo(ctx, event, outputPath);
            } finally {
                await this.cleanupFile(outputPath);
            }
        }

        return true;
    }

    private async handleGame(ctx: any, event: any, appId: string): Promise<boolean> {
        const headers = { ...XHH_HEADERS };

        const resp = await axios.get(XHH_GAME_LINK, {
            params: { appid: appId },
            headers,
            timeout: 10000,
        });

        const game = resp.data?.result;
        if (!game) {
            await this.sendText(ctx, event, '小黑盒游戏信息获取失败');
            return true;
        }

        const name = game.name || '未知游戏';
        const score = game.score || '-';
        const desc = (game.description || '').substring(0, 300);
        const price = game.price_info?.current?.price || '暂无价格';
        const cover = game.image || '';

        let text = `${this.identifyPrefix}识别：小黑盒·游戏\n🎮 ${name}\n⭐ 评分: ${score}\n💰 ${price}`;
        if (desc) text += `\n📝 ${desc}`;

        if (cover) {
            await this.sendMixed(ctx, event, [seg.image(cover), seg.text(text)]);
        } else {
            await this.sendText(ctx, event, text);
        }

        // Screenshots
        const screenshots = game.screenshots || [];
        if (screenshots.length > 0) {
            await this.sendImagesBatched(ctx, event, screenshots.slice(0, 6));
        }

        return true;
    }
}