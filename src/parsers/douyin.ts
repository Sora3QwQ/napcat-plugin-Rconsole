/**
 * rconsole-plus NapCat Plugin - Douyin Parser
 * Approach: Parse HTML page directly (window._ROUTER_DATA)
 * Reference: astrbot_plugin_parser douyin implementation
 * No a-bogus signature needed. Cookies are optional and auto-collected.
 */

import axios from 'axios';
import { BaseParser } from './base-parser.js';
import { seg } from '../types/parser.js';
import { Downloader } from '../utils/downloader.js';
import path from 'node:path';

// iOS User-Agent to avoid anti-bot detection
const IOS_HEADERS: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
};

export class DouyinParser extends BaseParser {
    name = 'douyin';
    displayName = '抖音';
    priority = 300;

    patterns = [
        /v\.douyin\.com\/[a-zA-Z0-9_\-]+/,
        /jx\.douyin\.com\/[a-zA-Z0-9_\-]+/,
        /douyin\.com\/(?:video|note)\/\d+/,
        /iesdouyin\.com\/share\/(?:slides|video|note)\/\d+/,
        /m\.douyin\.com\/share\/(?:slides|video|note)\/\d+/,
        /jingxuan\.douyin\.com\/m\/(?:slides|video|note)\/\d+/,
    ];

    private get dyConfig() { return this.config.douyin; }
    private collectedCookies: string = '';

    async handle(ctx: any, event: any, match: RegExpExecArray): Promise<boolean> {
        const rawMsg = event.raw_message?.trim() || '';

        // Extract URL from message
        const urlMatch = /(https?:\/\/[^\s]+(?:douyin|iesdouyin)\.com\/[^\s]*)/.exec(rawMsg)
            || /(v\.douyin\.com\/[a-zA-Z0-9_\-]+)/.exec(rawMsg);
        if (!urlMatch) return false;

        let url = urlMatch[0];
        if (!url.startsWith('http')) url = 'https://' + url;

        // Set up headers with optional cookies
        const headers: Record<string, string> = { ...IOS_HEADERS };
        if (this.dyConfig.cookie) {
            headers.Cookie = this.dyConfig.cookie;
        } else if (this.collectedCookies) {
            headers.Cookie = this.collectedCookies;
        }

        try {
            // Short link: resolve via redirect
            if (url.includes('v.douyin.com') || url.includes('jx.douyin.com')) {
                return await this.parseWithRedirect(ctx, event, url, headers);
            }

            // Slides
            const slidesMatch = /share\/slides\/(\d+)/.exec(url);
            if (slidesMatch) {
                return await this.parseSlides(ctx, event, slidesMatch[1], headers);
            }

            // Direct video/note URL
            return await this.parseVideoPage(ctx, event, url, headers);
        } catch (err: any) {
            this.logError('Parse failed:', err.message);
            await this.sendText(ctx, event, '抖音解析失败：' + err.message);
            return true;
        }
    }

    /** Resolve short link via redirect, then parse */
    private async parseWithRedirect(ctx: any, event: any, url: string, headers: Record<string, string>): Promise<boolean> {
        this.logDebug('Short link redirect:', url);

        const resp = await fetch(url, { headers, redirect: 'manual' });

        // Collect cookies from response
        this.collectCookies(resp.headers);

        const redirectUrl = resp.headers.get('location') || '';
        if (!redirectUrl || redirectUrl === url) {
            await this.sendText(ctx, event, '抖音短链接解析失败');
            return true;
        }

        this.logDebug('Redirected to:', redirectUrl);

        // Check what type of content it redirects to
        const slidesMatch = /share\/slides\/(\d+)/.exec(redirectUrl);
        if (slidesMatch) {
            return await this.parseSlides(ctx, event, slidesMatch[1], headers);
        }

        // Build the m.douyin.com and iesdouyin.com URLs
        const videoId = /(?:video|note)\/(\d+)/.exec(redirectUrl)?.[1];
        const typeStr = /\/(video|note)\//.exec(redirectUrl)?.[1] || 'video';

        if (videoId) {
            // Try m.douyin.com first, then iesdouyin.com fallback
            const urls = [
                `https://m.douyin.com/share/${typeStr}/${videoId}`,
                `https://www.iesdouyin.com/share/${typeStr}/${videoId}`,
            ];
            for (const tryUrl of urls) {
                try {
                    return await this.parseVideoPage(ctx, event, tryUrl, headers);
                } catch (err: any) {
                    this.logWarn(`Parse attempt failed (${tryUrl}):`, err.message);
                }
            }
        }

        // Fallback: try the redirect URL directly
        return await this.parseVideoPage(ctx, event, redirectUrl, headers);
    }

    /** Parse video/note page HTML to extract _ROUTER_DATA */
    private async parseVideoPage(ctx: any, event: any, url: string, headers: Record<string, string>): Promise<boolean> {
        this.logDebug('Parsing page:', url);

        const resp = await fetch(url, { headers, redirect: 'manual' });
        if (resp.status !== 200) {
            throw new Error(`HTTP ${resp.status}`);
        }

        const html = await resp.text();
        this.collectCookies(resp.headers);

        // Extract window._ROUTER_DATA
        const routerMatch = /window\._ROUTER_DATA\s*=\s*(.*?)<\/script>/s.exec(html);
        if (!routerMatch?.[1]) {
            throw new Error('无法在页面中找到 _ROUTER_DATA');
        }

        const routerData = JSON.parse(routerMatch[1].trim());

        // Structure: loaderData -> "video_(id)/page" or "note_(id)/page" -> videoInfoRes -> item_list[0]
        const loaderData = routerData?.loaderData;
        if (!loaderData) {
            throw new Error('无法找到 loaderData');
        }

        let videoData: any = null;
        for (const key of Object.keys(loaderData)) {
            // Match keys like "video_(id)/page" or "note_(id)/page"
            if (key.includes('/page')) {
                const page = loaderData[key];
                const itemList = page?.videoInfoRes?.item_list;
                if (itemList && itemList.length > 0) {
                    videoData = itemList[0];
                    break;
                }
            }
        }

        if (!videoData) {
            // Fallback: try any nested structure with aweme_detail
            for (const key of Object.keys(loaderData)) {
                const val = loaderData[key];
                if (val?.aweme_detail) {
                    videoData = val.aweme_detail;
                    break;
                }
            }
        }

        if (!videoData) {
            // Debug: dump loaderData structure to help troubleshoot
            const ldKeys = Object.keys(loaderData);
            this.logWarn('loaderData keys:', JSON.stringify(ldKeys));
            for (const key of ldKeys) {
                const val = loaderData[key];
                if (val && typeof val === 'object') {
                    this.logWarn(`  ${key} ->`, JSON.stringify(Object.keys(val)).substring(0, 200));
                }
            }
            throw new Error('无法提取视频数据');
        }

        const desc = videoData.desc || '';
        const authorName = videoData.author?.nickname || '未知';
        const images = videoData.images || [];

        // Image post
        if (images.length > 0) {
            await this.sendText(ctx, event, `${this.identifyPrefix}识别：抖音图集，${authorName}\n📝 ${desc}`);
            const imageUrls = images.map((img: any) => {
                const urlList = img.url_list || [];
                return urlList[urlList.length - 1] || urlList[0];
            }).filter(Boolean);
            if (imageUrls.length > 0) {
                await this.sendImagesBatched(ctx, event, imageUrls);
            }
            return true;
        }

        // Video post
        const video = videoData.video;
        const coverUrl = video?.cover?.url_list?.at(-1) || video?.cover?.url_list?.[0] || '';
        // Get video URL and remove watermark (playwm -> play)
        let videoUrl = video?.play_addr?.url_list?.[0] || '';
        if (videoUrl) videoUrl = videoUrl.replace('playwm', 'play');
        const duration = video?.duration ? Math.trunc(video.duration / 1000) : 0;

        let infoText = `${this.identifyPrefix}识别：抖音，${authorName}\n📝 ${desc}`;

        // Duration check
        if (duration > 0 && duration >= this.dyConfig.durationLimit) {
            infoText += `\n⏱ 时长约${(duration / 60).toFixed(0)}分钟，超过限制`;
            if (coverUrl) {
                await this.sendMixed(ctx, event, [seg.image(coverUrl), seg.text(infoText)]);
            } else {
                await this.sendText(ctx, event, infoText);
            }
            return true;
        }

        // Send info with cover
        if (coverUrl) {
            await this.sendMixed(ctx, event, [seg.image(coverUrl), seg.text(infoText)]);
        } else {
            await this.sendText(ctx, event, infoText);
        }

        // Download and send video
        if (videoUrl) {
            const cachePath = this.getCachePath(event);
            const outputPath = path.join(cachePath, `douyin_${Date.now()}.mp4`);
            try {
                const dl = new Downloader({ headers: IOS_HEADERS });
                await dl.download(videoUrl, outputPath);
                await this.sendVideo(ctx, event, outputPath);
            } catch (err: any) {
                this.logError('Video download failed:', err.message);
            } finally {
                await this.cleanupFile(outputPath);
            }
        }

        return true;
    }

    /** Parse slides (image carousel) via iesdouyin API */
    private async parseSlides(ctx: any, event: any, videoId: string, headers: Record<string, string>): Promise<boolean> {
        const url = `https://www.iesdouyin.com/web/api/v2/aweme/slidesinfo/?aweme_ids=[${videoId}]&request_source=200`;
        this.logDebug('Slides API:', url);

        const resp = await axios.get(url, { headers, timeout: 10000 });
        this.collectCookiesFromAxios(resp);

        const detail = resp.data?.aweme_details?.[0];
        if (!detail) {
            await this.sendText(ctx, event, '抖音幻灯片解析失败');
            return true;
        }

        const desc = detail.desc || '';
        const authorName = detail.author?.nickname || '未知';
        await this.sendText(ctx, event, `${this.identifyPrefix}识别：抖音图集，${authorName}\n📝 ${desc}`);

        // Extract images
        const imageUrls: string[] = [];
        for (const img of detail.images || []) {
            const urlList = img.url_list || [];
            const url = urlList[urlList.length - 1] || urlList[0];
            if (url) imageUrls.push(url);
        }

        if (imageUrls.length > 0) {
            await this.sendImagesBatched(ctx, event, imageUrls);
        }

        return true;
    }

    /** Collect cookies from fetch Response headers */
    private collectCookies(headers: Headers) {
        try {
            const setCookies = headers.getSetCookie?.() || [];
            if (setCookies.length > 0) {
                const cookies = setCookies.map(c => c.split(';')[0]).join('; ');
                this.collectedCookies = this.collectedCookies
                    ? this.collectedCookies + '; ' + cookies
                    : cookies;
            }
        } catch { /* ignore */ }
    }

    /** Collect cookies from axios response */
    private collectCookiesFromAxios(resp: any) {
        try {
            const setCookies = resp.headers?.['set-cookie'] || [];
            if (Array.isArray(setCookies) && setCookies.length > 0) {
                const cookies = setCookies.map((c: string) => c.split(';')[0]).join('; ');
                this.collectedCookies = this.collectedCookies
                    ? this.collectedCookies + '; ' + cookies
                    : cookies;
            }
        } catch { /* ignore */ }
    }
}