/**
 * rconsole-plus NapCat Plugin - Xiaoheihe (小黑盒) Parser
 * Handles: xiaoheihe.cn articles, game pages, links
 */

import axios from 'axios';
import { BaseParser } from './base-parser.js';
import { seg, buildForwardNode } from '../types/parser.js';
import { XHH_BBS_LINK, XHH_GAME_LINK, COMMON_USER_AGENT } from '../utils/api-constants.js';
import { getXhhBbsParams, getXhhGameParams } from '../utils/crypto/xiaoheihe-sign.js';
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
            // Extract link_id from various URL formats:
            // /app/bbs/link/179672633
            // /bbs/link/179672633  
            // link_id=179672633
            // /bbs/app/api/web/share?link_id=179672633
            const linkId = /bbs\/link\/([a-zA-Z0-9]+)/.exec(url)?.[1]
                || /link_id=([a-zA-Z0-9]+)/.exec(url)?.[1]
                || /newsId=(\d+)/.exec(url)?.[1];

            const gameId = /appid=(\d+)/.exec(url)?.[1]
                || /topic\/game\/\w+\/(\d+)/.exec(url)?.[1];

            if (gameId) {
                return await this.handleGame(ctx, event, gameId);
            }

            if (linkId) {
                return await this.handleArticle(ctx, event, linkId);
            }

            // Last resort: match any long number in the URL
            const numMatch = /(\d{6,})/.exec(url);
            if (numMatch?.[1]) {
                return await this.handleArticle(ctx, event, numMatch[1]);
            }

            await this.sendText(ctx, event, '无法提取小黑盒内容ID');
        } catch (err: any) {
            this.logError('Parse failed:', err.message);
            await this.sendText(ctx, event, '小黑盒解析失败：' + err.message);
        }

        return true;
    }

        private async handleArticle(ctx: any, event: any, linkId: string): Promise<boolean> {
                const headers: Record<string, string> = {
            ...XHH_HEADERS,
            'referer': 'https://www.xiaoheihe.cn/',
            'origin': 'https://www.xiaoheihe.cn',
        };
        const cookie = this.config.xiaoheihe.cookie || '';

        // Extract x_xhh_tokenid and derive device_id
        const tokenMatch = /x_xhh_tokenid=([^;]+)/.exec(cookie);
        const token = tokenMatch?.[1] || '';
        const deviceId = token.startsWith('B') ? token.substring(1) : '';

        const params = getXhhBbsParams(linkId, deviceId);

                // Pass cookie separately (matching astrbot approach)
        const cookieObj: Record<string, string> = {};
        if (token) cookieObj['x_xhh_tokenid'] = token;

        const resp = await axios.get(XHH_BBS_LINK, {
            params,
            headers: {
                ...headers,
                ...(Object.keys(cookieObj).length > 0 ? { 'Cookie': `x_xhh_tokenid=${token}` } : {}),
            },
            timeout: 10000,
        });

        const respData = resp.data;
        if (respData?.status !== 'ok' || !respData?.result) {
            this.logWarn('XHH API response:', JSON.stringify(respData).substring(0, 500));
            await this.sendText(ctx, event, '小黑盒帖子解析失败，请检查Cookie是否过期');
            return true;
        }

        // The result contains a link object with the post data
        const result = respData.result;
        const link = result.link || result;

        const title = link.title || '小黑盒帖子';
        const user = link.user?.username || '未知';
        const description = link.description || '';

        let infoText = `${this.identifyPrefix}识别：小黑盒帖子\n👤 作者：${user}`;
        if (title) infoText += `\n📝 ${title}`;
        if (description) infoText += `\n${description.substring(0, 300)}`;

        // Cover image
        const cover = link.share_pic || link.img || '';
        if (cover) {
            await this.sendMixed(ctx, event, [seg.image(cover), seg.text(infoText)]);
        } else {
            await this.sendText(ctx, event, infoText);
        }

        // Content images from link_content JSON
        try {
            const contentImages: string[] = [];
            if (link.link_content) {
                const contentBlocks = typeof link.link_content === 'string'
                    ? JSON.parse(link.link_content)
                    : link.link_content;
                if (Array.isArray(contentBlocks)) {
                    for (const block of contentBlocks) {
                        if (block.type === 'img' && block.data?.src) {
                            contentImages.push(block.data.src);
                        }
                    }
                }
            }
            // Also check pics array
            const pics = link.pics || [];
            const allImages = [...contentImages, ...pics].filter(Boolean);
            if (allImages.length > 0) {
                await this.sendImagesBatched(ctx, event, allImages);
            }
        } catch { /* ignore content parsing errors */ }

        // Video
        if (link.has_video === 1 && link.video_url) {
            const cachePath = this.getCachePath(event);
            const outputPath = path.join(cachePath, 'xhh.mp4');
            try {
                const dl = new Downloader({ headers: { Cookie: cookie } });
                await dl.download(link.video_url, outputPath);
                await this.sendVideo(ctx, event, outputPath);
            } finally {
                await this.cleanupFile(outputPath);
            }
        }

        // Game card if present
        if (link.game_link_data?.steam_appid) {
            await this.handleGame(ctx, event, link.game_link_data.steam_appid);
        }

        return true;
    }

    private async handleGame(ctx: any, event: any, appId: string): Promise<boolean> {
        const headers = { ...XHH_HEADERS };

                const params = getXhhGameParams(appId);
        const resp = await axios.get(XHH_GAME_LINK, {
            params,
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