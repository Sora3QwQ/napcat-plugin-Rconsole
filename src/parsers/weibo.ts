/**
 * rconsole-plus NapCat Plugin - Weibo Parser
 * Handles: weibo.com, m.weibo.cn, video.weibo.com, ttarticle, retweeted posts
 * Merged features from both astrbot_plugin_parser and rconsole-plugin.
 */

import axios from 'axios';
import { BaseParser } from './base-parser.js';
import { seg, buildForwardNode } from '../types/parser.js';
import type { OB11Segment } from '../types/parser.js';
import { downloadImg } from '../utils/common.js';
import path from 'node:path';
import fs from 'node:fs';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function base62Encode(num: number): string {
    if (num === 0) return '0';
    let result = '';
    while (num > 0) {
        result = ALPHABET[num % 62] + result;
        num = Math.floor(num / 62);
    }
    return result;
}

function mid2id(mid: string): string {
    const reversed = mid.split('').reverse().join('');
    const size = Math.ceil(reversed.length / 7);
    const result: string[] = [];
    for (let i = 0; i < size; i++) {
        let s = reversed.slice(i * 7, (i + 1) * 7).split('').reverse().join('');
        let encoded = base62Encode(parseInt(s, 10));
        if (i < size - 1 && encoded.length < 4) {
            encoded = '0'.repeat(4 - encoded.length) + encoded;
        }
        result.push(encoded);
    }
    result.reverse();
    return result.join('');
}

const WEIBO_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://weibo.com/',
};

function getHeaders(cookie: string = ''): Record<string, string> {
    const h: Record<string, string> = { ...WEIBO_HEADERS };
    if (cookie) h['Cookie'] = cookie;
    return h;
}

export class WeiboParser extends BaseParser {
    name = 'weibo';
    displayName = '微博';
    priority = 300;

    patterns = [
        /(?:https?:\/\/)?(?:www\.)?weibo\.com\/[A-Za-z\d._?%&+\-=\/#]*/,
        /(?:https?:\/\/)?m\.weibo\.cn\/[A-Za-z\d._?%&+\-=\/#]*/,
        /(?:https?:\/\/)?video\.weibo\.com\/[A-Za-z\d._?%&+\-=\/#]*/,
    ];

    private get weiboCookie() { return this.config.weibo.cookie; }
    private get enableComments() { return this.config.weibo.enableComments; }

    async handle(ctx: any, event: any, match: RegExpExecArray): Promise<boolean> {
        const rawUrl = event.raw_message?.trim() || '';

        try {
            // Route by URL type
            if (rawUrl.includes('video.weibo.com')) {
                return await this.handleVideoWeibo(ctx, event, rawUrl);
            }
            if (rawUrl.includes('ttarticle') || rawUrl.includes('card.weibo.com/article')) {
                return await this.handleArticle(ctx, event, rawUrl);
            }
            return await this.handleNormalWeibo(ctx, event, rawUrl);
        } catch (err: any) {
            this.logError('Parse failed:', err.message);
            await this.sendText(ctx, event, '微博解析失败');
            return true;
        }
    }

    // ==================== Normal Weibo ====================

    private async handleNormalWeibo(ctx: any, event: any, rawUrl: string): Promise<boolean> {
        let weiboId: string | undefined;

        if (rawUrl.includes('m.weibo.cn')) {
            weiboId = /(?<=detail\/)[A-Za-z\d]+/.exec(rawUrl)?.[0]
                || /(?<=status\/)[A-Za-z\d]+/.exec(rawUrl)?.[0]
                || /(?<=m\.weibo\.cn\/)[A-Za-z\d]+\/[A-Za-z\d]+/.exec(rawUrl)?.[0];
        } else if (rawUrl.includes('weibo.com/tv/show') && rawUrl.includes('mid=')) {
            const mid = /(?<=mid=)[A-Za-z\d]+/.exec(rawUrl)?.[0];
            if (mid) weiboId = mid2id(mid);
        } else if (rawUrl.includes('weibo.com')) {
            weiboId = /(?<=weibo\.com\/)[A-Za-z\d]+\/[A-Za-z\d]+/.exec(rawUrl)?.[0];
        }

        if (!weiboId) {
            await this.sendText(ctx, event, '无法获取微博ID');
            return true;
        }

        const id = weiboId.split('/')[1] || weiboId;
        this.log('ID:', id);

        const wbData = await this.getWeiboData(id);
        if (!wbData) {
            await this.sendText(ctx, event, '微博解析失败：无法获取数据');
            return true;
        }

        // Text content
        const text = (wbData.text || '').replace(/<[^>]+>/g, '').trim();
        const statusTitle = wbData.status_title || '';
        const source = wbData.source || '';
        const regionName = wbData.region_name || '';

        let replyText = `${this.identifyPrefix}识别：微博`;
        if (text) replyText += `\n${text}`;
        if (statusTitle) replyText += `\n${statusTitle}`;
        if (source || regionName) replyText += `\n${source}${regionName ? '\t' + regionName : ''}`;
        await this.sendText(ctx, event, replyText);

        // Images
        const pics = wbData.pics || [];
        if (pics.length > 0) {
            const imageUrls = pics.map((p: any) => p?.large?.url || p?.url).filter(Boolean);
            if (imageUrls.length > 0) {
                await this.sendImagesBatched(ctx, event, imageUrls);
            }
        }

        // Video
        const pageInfo = wbData.page_info;
        if (pageInfo?.urls) {
            const videoUrl = pageInfo.urls.mp4_720p_mp4 || pageInfo.urls.mp4_hd_mp4 || pageInfo.urls.mp4_ld_mp4;
            if (videoUrl) {
                const cachePath = this.getCachePath(event);
                const outputPath = path.join(cachePath, 'weibo.mp4');
                try {
                    const { Downloader } = await import('../utils/downloader.js');
                    const dl = new Downloader({ headers: WEIBO_HEADERS });
                    await dl.download(videoUrl, outputPath);
                    await this.sendVideo(ctx, event, outputPath);
                } catch (err: any) {
                    this.logWarn('Video download failed:', err.message);
                } finally {
                    await this.cleanupFile(outputPath);
                }
            }
        }

        // Retweeted status (from astrbot)
        if (wbData.retweeted_status) {
            await this.handleRetweeted(ctx, event, wbData.retweeted_status);
        }

        // Comments (from rconsole)
        if (this.enableComments) {
            await this.handleComments(ctx, event, id);
        }

        // Vote images (from rconsole)
        if (pics.length === 0 && !pageInfo?.urls) {
            await this.handleVoteImages(ctx, event, wbData.user?.id || wbData.user?.idstr, id);
        }

        return true;
    }

    // ==================== Video Weibo (from astrbot) ====================

    private async handleVideoWeibo(ctx: any, event: any, rawUrl: string): Promise<boolean> {
        const fid = /fid=([\d:]+)/.exec(rawUrl)?.[1];
        if (!fid) {
            await this.sendText(ctx, event, '无法提取视频FID');
            return true;
        }

        const reqUrl = `https://h5.video.weibo.com/api/component?page=/show/${fid}`;
        const headers = {
            ...WEIBO_HEADERS,
            'Referer': `https://h5.video.weibo.com/show/${fid}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        };
        if (this.weiboCookie) (headers as any)['Cookie'] = this.weiboCookie;

        const resp = await axios.post(reqUrl, `data={"Component_Play_Playinfo":{"oid":"${fid}"}}`, { headers, timeout: 10000 });
        const playInfo = resp.data?.data?.Component_Play_Playinfo;
        if (!playInfo) {
            await this.sendText(ctx, event, '微博视频解析失败');
            return true;
        }

        const title = playInfo.title || '';
        let text = (playInfo.text || '').replace(/<[^>]+>/g, '').trim();
        const author = playInfo.reward?.user?.name || '未知';

        let msg = `${this.identifyPrefix}识别：微博视频`;
        if (title) msg += `\n${title}`;
        if (text) msg += `\n${text}`;
        msg += `\n作者：${author}`;
        await this.sendText(ctx, event, msg);

        // Extract video URL
        const urlDict = playInfo.urls;
        let videoUrl: string | null = null;
        if (urlDict && typeof urlDict === 'object') {
            const firstUrl = Object.values(urlDict)[0] as string;
            if (firstUrl) videoUrl = firstUrl.startsWith('http') ? firstUrl : 'https:' + firstUrl;
        }
        if (!videoUrl) videoUrl = playInfo.stream_url || null;

        if (videoUrl) {
            const cachePath = this.getCachePath(event);
            const outputPath = path.join(cachePath, 'weibo_video.mp4');
            try {
                const { Downloader } = await import('../utils/downloader.js');
                const dl = new Downloader({ headers: WEIBO_HEADERS });
                await dl.download(videoUrl, outputPath);
                await this.sendVideo(ctx, event, outputPath);
            } catch (err: any) {
                this.logWarn('Video download failed:', err.message);
            } finally {
                await this.cleanupFile(outputPath);
            }
        }

        return true;
    }

    // ==================== Article (from astrbt) ====================

    private async handleArticle(ctx: any, event: any, rawUrl: string): Promise<boolean> {
        const articleId = /id[=\/](\d+)/.exec(rawUrl)?.[1];
        if (!articleId) {
            await this.sendText(ctx, event, '无法提取文章ID');
            return true;
        }

        const url = 'https://card.weibo.com/article/m/aj/detail';
        const params = new URLSearchParams({ id: articleId, _t: String(Date.now()) });

        const resp = await axios.post(url, params.toString(), {
            headers: { ...WEIBO_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 10000,
        });

        if (resp.data?.msg !== 'success') {
            await this.sendText(ctx, event, '微博文章解析失败');
            return true;
        }

        const data = resp.data.data;
        const title = data.title || '';
        const authorName = data.userinfo?.screen_name || '未知';

        await this.sendText(ctx, event, `${this.identifyPrefix}识别：微博文章\n标题：${title}\n作者：${authorName}`);

        // Extract images from HTML
        const images: string[] = [];
        const imgMatches = data.content?.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi);
        if (imgMatches) {
            for (const m of imgMatches) {
                if (m[1] && !images.includes(m[1])) images.push(m[1]);
            }
        }

        // Text content
        let textContent = (data.content || '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .trim();

        const { nickname } = this.getSenderInfo(event);
        const senderId = String(event.self_id || event.user_id);
        const nodes = [];

        if (textContent) {
            nodes.push(buildForwardNode(senderId, nickname, [
                seg.text(textContent.substring(0, 2000)),
            ]));
        }
        for (const imgUrl of images.slice(0, 20)) {
            nodes.push(buildForwardNode(senderId, nickname, [seg.image(imgUrl)]));
        }
        if (nodes.length > 0) {
            await this.sendForward(ctx, event, nodes);
        }

        return true;
    }

    // ==================== Retweeted (from astrbot) ====================

    private async handleRetweeted(ctx: any, event: any, retweeted: any) {
        try {
            const text = (retweeted.text || '').replace(/<[^>]+>/g, '').trim();
            const authorName = retweeted.user?.screen_name || '未知';
            const imageUrls = (retweeted.pics || []).map((p: any) => p?.large?.url || p?.url).filter(Boolean);

            const { nickname } = this.getSenderInfo(event);
            const senderId = String(event.self_id || event.user_id);
            const nodes = [];

            let rtText = `转发自 @${authorName}：`;
            if (text) rtText += `\n${text}`;
            nodes.push(buildForwardNode(senderId, authorName, [seg.text(rtText)]));

            for (const imgUrl of imageUrls.slice(0, 9)) {
                nodes.push(buildForwardNode(senderId, authorName, [seg.image(imgUrl)]));
            }

            if (nodes.length > 0) {
                await this.sendForward(ctx, event, nodes);
            }

            // Retweeted video
            if (retweeted.page_info?.urls) {
                const videoUrl = retweeted.page_info.urls.mp4_720p_mp4 || retweeted.page_info.urls.mp4_hd_mp4 || retweeted.page_info.urls.mp4_ld_mp4;
                if (videoUrl) {
                    const cachePath = this.getCachePath(event);
                    const outputPath = path.join(cachePath, 'weibo_rt.mp4');
                    try {
                        const { Downloader } = await import('../utils/downloader.js');
                        const dl = new Downloader({ headers: WEIBO_HEADERS });
                        await dl.download(videoUrl, outputPath);
                        await this.sendVideo(ctx, event, outputPath);
                    } catch { /* ignore */ } finally {
                        await this.cleanupFile(outputPath);
                    }
                }
            }
        } catch (err: any) {
            this.logWarn('Retweeted parse failed:', err.message);
        }
    }

    // ==================== Comments (from rconsole) ====================

    private async handleComments(ctx: any, event: any, id: string) {
        try {
            const headers = getHeaders(this.weiboCookie);
            headers['X-Requested-With'] = 'XMLHttpRequest';

            const resp = await axios.get(`https://m.weibo.cn/comments/hotflow?id=${id}&mid=${id}&max_id_type=0`, {
                headers, timeout: 10000,
            });

            const comments = resp.data?.data?.data || [];
            if (comments.length === 0) return;

            const nodes = comments.slice(0, 20).map((c: any) => {
                const userName = c.user?.screen_name || '匿名';
                const commentText = (c.text || '').replace(/<[^>]+>/g, '');
                const like = c.like_count || 0;
                return buildForwardNode(
                    String(event.self_id || event.user_id),
                    userName,
                    [seg.text(`${commentText}\n${like}👍`)]
                );
            });

            await this.sendForward(ctx, event, nodes);
        } catch (err: any) {
            this.logWarn('Comments fetch failed:', err.message);
        }
    }

    // ==================== Vote Images (from rconsole) ====================

    private async handleVoteImages(ctx: any, event: any, uid: any, id: string) {
        try {
            const headers: Record<string, string> = {
                ...WEIBO_HEADERS,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            };
            if (this.weiboCookie) headers['Cookie'] = this.weiboCookie;

            const resp = await axios.get(`https://weibo.com/${uid}/${id}`, { headers, timeout: 15000 });
            const html = typeof resp.data === 'string' ? resp.data : '';

            const images: string[] = [];
            const matches = html.matchAll(/https?:\/\/wx\d\.sinaimg\.cn\/[a-z0-9]+\/[^"'\s]+\.jpg/gi);
            for (const m of matches) {
                let url = m[0];
                if ((url.includes('bmiddle') || url.includes('large') || url.includes('mw2000') || url.includes('orj')) && !images.includes(url)) {
                    url = url.replace(/\/bmiddle\//, '/large/').replace(/\/mw2000\//, '/large/').replace(/\/orj\d+\//, '/large/');
                    if (!images.includes(url)) images.push(url);
                }
            }

            if (images.length > 0) {
                await this.sendImagesBatched(ctx, event, images.slice(0, 10));
            }
        } catch (err: any) {
            this.logWarn('Vote images fetch failed:', err.message);
        }
    }

    // ==================== Data Fetching ====================

    private async getWeiboData(id: string): Promise<any> {
        const headers = getHeaders(this.weiboCookie);

        // Try HTML first
        try {
            const resp = await axios.get(`https://m.weibo.cn/detail/${id}`, { headers, timeout: 10000 });
            const html = typeof resp.data === 'string' ? resp.data : '';

            // Method 1: status JSON
            const match = html.match(/"status":\s*([\s\S]+?),\s*"call"/);
            if (match?.[1]) {
                try { return JSON.parse(match[1]); } catch { /* try next */ }
            }

            // Method 2: render_data
            const renderMatch = html.match(/\$render_data\s*=\s*\[([\s\S]+?)\]\[0\]/);
            if (renderMatch?.[1]) {
                try { return JSON.parse('[' + renderMatch[1] + ']')[0]?.status; } catch { /* try next */ }
            }
        } catch { /* try API fallback */ }

        // Method 3: API fallback
        try {
            const apiResp = await axios.get(`https://m.weibo.cn/statuses/show?id=${id}`, {
                headers: { ...headers, 'X-Requested-With': 'XMLHttpRequest' },
                timeout: 10000,
            });
            return apiResp.data?.data;
        } catch {
            return null;
        }
    }
}