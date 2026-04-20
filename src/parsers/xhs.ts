/**
 * rconsole-plus NapCat Plugin - Xiaohongshu (XHS) Parser
 * Approach: Parse HTML page directly (window.__INITIAL_STATE__)
 * Reference: astrbot_plugin_parser xhs implementation
 * Supports both explore and discovery/item URLs. Cookies optional.
 */

import { BaseParser } from './base-parser.js';
import { seg } from '../types/parser.js';
import { Downloader } from '../utils/downloader.js';
import path from 'node:path';

const XHS_HEADERS: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
};

const XHS_IOS_HEADERS: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'origin': 'https://www.xiaohongshu.com',
    'x-requested-with': 'XMLHttpRequest',
};

export class XhsParser extends BaseParser {
    name = 'xhs';
    displayName = '小红书';
    priority = 300;

    patterns = [
        /xhslink\.com\/[A-Za-z0-9._?%&+=\/#@-]+/,
        /xiaohongshu\.com\/(?:explore|discovery\/item)\/(?:[0-9a-zA-Z]+)\??[A-Za-z0-9._%&+=\/#@-]*/,
    ];

    private get xhsCookie() { return this.config.xhs.cookie; }

    async handle(ctx: any, event: any, match: RegExpExecArray): Promise<boolean> {
        const rawMsg = event.raw_message?.trim() || '';

        // Extract URL
        const urlMatch = /(https?:\/\/[^\s]*(?:xhslink|xiaohongshu)\.com\/[^\s]*)/.exec(rawMsg)
            || /(xhslink\.com\/[A-Za-z0-9._?%&+=\/#@-]+)/.exec(rawMsg)
            || /(xiaohongshu\.com\/[^\s]+)/.exec(rawMsg);
        if (!urlMatch) return false;

        let url = urlMatch[0];
        if (!url.startsWith('http')) url = 'https://' + url;

        const headers: Record<string, string> = { ...XHS_HEADERS };
        if (this.xhsCookie) {
            headers.cookie = this.xhsCookie;
        }

        try {
            // Short link: redirect first
            if (url.includes('xhslink.com')) {
                return await this.parseWithRedirect(ctx, event, url, headers);
            }

            // Direct link: extract ID and query
            const xhsId = /(?:explore|discovery\/item)\/([0-9a-zA-Z]+)/.exec(url)?.[1];
            if (!xhsId) {
                await this.sendText(ctx, event, '无法提取小红书笔记ID');
                return true;
            }

            // Try explore first, fallback to discovery
            const query = url.includes('?') ? url.substring(url.indexOf('?')) : '';
            try {
                return await this.parseExplore(ctx, event, xhsId, query, headers);
            } catch (err: any) {
                this.logWarn('explore parse failed, trying discovery:', err.message);
                return await this.parseDiscovery(ctx, event, xhsId, query);
            }
        } catch (err: any) {
            this.logError('Parse failed:', err.message);
            await this.sendText(ctx, event, '小红书解析失败：' + err.message);
            return true;
        }
    }

    /** Short link redirect then parse */
    private async parseWithRedirect(ctx: any, event: any, url: string, headers: Record<string, string>): Promise<boolean> {
        const resp = await fetch(url, { headers: { ...XHS_IOS_HEADERS }, redirect: 'follow' });
        const redirectUrl = decodeURIComponent(resp.url);
        this.logDebug('XHS redirect:', redirectUrl);

        const xhsId = /(?:explore|discovery\/item|item)\/([0-9a-fA-F]+)/.exec(redirectUrl)?.[1]
            || /noteId=([0-9a-fA-F]+)/.exec(redirectUrl)?.[1];
        if (!xhsId) {
            await this.sendText(ctx, event, '小红书短链接解析失败');
            return true;
        }

        const query = redirectUrl.includes('?') ? redirectUrl.substring(redirectUrl.indexOf('?')) : '';

        try {
            return await this.parseExplore(ctx, event, xhsId, query, headers);
        } catch {
            return await this.parseDiscovery(ctx, event, xhsId, query);
        }
    }

    /** Parse via /explore/ page (desktop) */
    private async parseExplore(ctx: any, event: any, xhsId: string, query: string, headers: Record<string, string>): Promise<boolean> {
        const url = `https://www.xiaohongshu.com/explore/${xhsId}${query}`;
        this.logDebug('XHS explore:', url);

        const resp = await fetch(url, { headers });
        const html = await resp.text();
        const jsonObj = this.extractInitialState(html);

        // Extract note from noteDetailMap
        const noteData = jsonObj?.note?.noteDetailMap?.[xhsId]?.note;
        if (!noteData) {
            throw new Error('Cannot find note detail in explore page');
        }

        return await this.sendNoteResult(ctx, event, noteData);
    }

    /** Parse via /discovery/item/ page (mobile, fallback) */
    private async parseDiscovery(ctx: any, event: any, xhsId: string, query: string): Promise<boolean> {
        const url = `https://www.xiaohongshu.com/discovery/item/${xhsId}${query}`;
        this.logDebug('XHS discovery:', url);

        const resp = await fetch(url, { headers: XHS_IOS_HEADERS, redirect: 'follow' });
        const html = await resp.text();
        const jsonObj = this.extractInitialState(html);

        const noteData = jsonObj?.noteData?.data?.noteData;
        if (!noteData) {
            throw new Error('Cannot find noteData in discovery page');
        }

        // discovery format has slightly different field names
        const title = noteData.title || '';
        const desc = noteData.desc || '';
        const type = noteData.type || 'normal';
        const authorName = noteData.user?.nickName || noteData.user?.nickname || '未知';

        await this.sendText(ctx, event, `${this.identifyPrefix}识别：小红书\n📝 ${title}\n${desc}\n作者：${authorName}`);

        if (type === 'video') {
            const videoUrl = this.extractVideoUrl(noteData.video);
            const coverUrl = noteData.imageList?.[0]?.url || noteData.imageList?.[0]?.urlDefault || '';
            if (videoUrl) {
                await this.downloadAndSendVideo(ctx, event, videoUrl, coverUrl);
            }
        } else {
            const imageUrls = (noteData.imageList || []).map((img: any) => img.urlSizeLarge || img.url || img.urlDefault).filter(Boolean);
            if (imageUrls.length > 0) {
                await this.sendImagesBatched(ctx, event, imageUrls);
            }
        }

        return true;
    }

    /** Send note result from explore format */
    private async sendNoteResult(ctx: any, event: any, noteData: any): Promise<boolean> {
        const title = noteData.title || '';
        const desc = noteData.desc || '';
        const type = noteData.type || 'normal';
        const authorName = noteData.user?.nickname || noteData.user?.nickName || '未知';

        await this.sendText(ctx, event, `${this.identifyPrefix}识别：小红书\n📝 ${title}\n${desc}\n作者：${authorName}`);

        if (type === 'video') {
            const videoUrl = this.extractVideoUrl(noteData.video);
            const coverUrl = noteData.imageList?.[0]?.urlDefault || '';
            if (videoUrl) {
                await this.downloadAndSendVideo(ctx, event, videoUrl, coverUrl);
            }
        } else {
            const imageUrls = (noteData.imageList || []).map((img: any) => img.urlDefault || img.url).filter(Boolean);
            if (imageUrls.length > 0) {
                await this.sendImagesBatched(ctx, event, imageUrls);
            }
        }

        return true;
    }

    /** Extract video URL from video object (try h265 > h264 > av1) */
    private extractVideoUrl(video: any): string | null {
        if (!video?.media?.stream) return null;
        const stream = video.media.stream;
        const tryOrder = ['h265', 'h264', 'av1', 'h266'];
        for (const codec of tryOrder) {
            if (stream[codec]?.[0]?.masterUrl) {
                return stream[codec][0].masterUrl;
            }
        }
        return null;
    }

    /** Download video and send */
    private async downloadAndSendVideo(ctx: any, event: any, videoUrl: string, coverUrl?: string) {
        const cachePath = this.getCachePath(event);
        const outputPath = path.join(cachePath, `xhs_${Date.now()}.mp4`);
        try {
            const dl = new Downloader();
            await dl.download(videoUrl, outputPath);
            await this.sendVideo(ctx, event, outputPath);
        } catch (err: any) {
            this.logWarn('Video download failed:', err.message);
        } finally {
            await this.cleanupFile(outputPath);
        }
    }

    /** Extract window.__INITIAL_STATE__ JSON from HTML */
    private extractInitialState(html: string): any {
        const match = /window\.__INITIAL_STATE__=(.*?)<\/script>/.exec(html);
        if (!match?.[1]) {
            throw new Error('小红书分享链接失效或内容已删除');
        }
        return JSON.parse(match[1].replace(/undefined/g, 'null'));
    }
}