/**
 * rconsole-plus NapCat Plugin - Bilibili Parser
 * Handles: video, dynamic, live, bangumi, article, short links, direct BV input
 */

import { BaseParser } from './base-parser.js';
import { seg, buildForwardNode } from '../types/parser.js';
import { pluginState } from '../core/state.js';
import { createBiliDownloader } from '../utils/downloader.js';
import {
    getVideoInfo,
    getDownloadUrl,
    getDynamic,
    getBiliAISummary,
    formatAISummary,
    getOnlineCount,
    getArticleInfo,
    getLiveInfo,
    getLiveStream,
    getBangumiInfo,
    filterBiliDescLink,
} from '../utils/bilibili-api.js';
import { formatBiliInfo, truncateString, secondsToTime } from '../utils/common.js';
import type { OB11Segment } from '../types/parser.js';
import path from 'node:path';

export class BilibiliParser extends BaseParser {
    name = 'bilibili';
    displayName = '哔哩哔哩';
    priority = 300;

    patterns = [
        /(?:https?:\/\/)?(?:www\.)?bilibili\.com\/[A-Za-z\d._?%&+\-=\/#]*/,
        /(?:https?:\/\/)b23\.tv\/[A-Za-z\d._?%&+\-=\/#]*/,
        /(?:https?:\/\/)bili2233\.cn\/[A-Za-z\d._?%&+\-=\/#]*/,
        /(?:https?:\/\/)?m\.bilibili\.com\/[A-Za-z\d._?%&+\-=\/#]*/,
        /(?:https?:\/\/)?t\.bilibili\.com\/[A-Za-z\d._?%&+\-=\/#]*/,
        /(?:https?:\/\/)?live\.bilibili\.com\/[A-Za-z\d._?%&+\-=\/#]*/,
        /^BV[1-9a-zA-Z]{10}$/,
    ];

    private get biliConfig() { return this.config.bilibili; }

    async handle(ctx: any, event: any, match: RegExpExecArray): Promise<boolean> {
        let url = event.raw_message?.trim() || '';

        // Direct BV number
        if (/^BV[1-9a-zA-Z]{10}$/.test(url)) {
            url = `https://www.bilibili.com/video/${url}`;
        }

        // Resolve short links
        if (url.includes('b23.tv') || url.includes('bili2233.cn')) {
            const shortUrl = /(https?:\/\/)(b23\.tv|bili2233\.cn)\/[A-Za-z\d._?%&+\-=\/#]*/.exec(url)?.[0];
            if (shortUrl) {
                try {
                    const resp = await fetch(shortUrl, { method: 'HEAD', redirect: 'follow' });
                    url = resp.url;
                } catch (err: any) {
                    this.logError('Short link resolve failed:', err.message);
                    return false;
                }
            }
        }

        // Extract clean URL
        const urlPatterns = [
            /(?:https?:\/\/)?www\.bilibili\.com\/[A-Za-z\d._?%&+\-=\/#]*/,
            /(?:https?:\/\/)?live\.bilibili\.com\/[A-Za-z\d._?%&+\-=\/#]*/,
            /(?:https?:\/\/)?t\.bilibili\.com\/[A-Za-z\d._?%&+\-=\/#]*/,
            /(?:https?:\/\/)?m\.bilibili\.com\/[A-Za-z\d._?%&+\-=\/#]*/,
        ];
        for (const p of urlPatterns) {
            const m = p.exec(url);
            if (m) { url = m[0]; break; }
        }

        if (!url.startsWith('http')) url = 'https://' + url;

        try {
            // Route to specific handler
            if (url.includes('live.bilibili.com')) {
                return await this.handleLive(ctx, event, url);
            }
            if (url.includes('read/cv') || url.includes('read/mobile')) {
                return await this.handleArticle(ctx, event, url);
            }
            if (url.includes('t.bilibili.com') || url.includes('/opus') || url.includes('/dynamic')) {
                return await this.handleDynamic(ctx, event, url);
            }
            if (url.includes('play/ep') || url.includes('play/ss')) {
                return await this.handleBangumi(ctx, event, url);
            }
            // Default: video
            return await this.handleVideo(ctx, event, url);
        } catch (err: any) {
            this.logError('Parse failed:', err.message);
            await this.sendText(ctx, event, '哔哩哔哩解析失败，请重试');
            return true;
        }
    }

    // ==================== Video ====================

    private async handleVideo(ctx: any, event: any, url: string): Promise<boolean> {
        const videoInfo = await getVideoInfo(url);
        const { bvid, cid, owner, pages, duration } = videoInfo;

        // Handle multi-page
        let pParam: number | null = null;
        try {
            const urlObj = new URL(url);
            const p = urlObj.searchParams.get('p');
            if (p) pParam = parseInt(p, 10);
        } catch { /* ignore */ }

        let durationForCheck = duration;
        let partTitle: string | null = null;
        if (pages && pages.length > 1 && pParam && pParam > 0 && pages.length >= pParam) {
            durationForCheck = pages[pParam - 1].duration;
            partTitle = pages[pParam - 1].part;
        } else if (pages && pages.length > 1) {
            durationForCheck = pages[0].duration;
            partTitle = pages[0].part;
        }

        // Build info message
        const infoSegments = await this.buildVideoInfo(videoInfo, partTitle, pParam);

        // AI Summary
        if (this.biliConfig.displaySummary) {
            const aiResult = await getBiliAISummary(bvid, cid, owner.mid, this.biliConfig.sessData);
            const summaryText = formatAISummary(aiResult);
            if (summaryText) {
                const { nickname } = this.getSenderInfo(event);
                const nodes = [
                    buildForwardNode(String(event.self_id || event.user_id), nickname, [
                        seg.text('「R插件 x bilibili」联合为您总结内容：'),
                    ]),
                    buildForwardNode(String(event.self_id || event.user_id), nickname, [
                        seg.text(summaryText),
                    ]),
                ];
                await this.sendForward(ctx, event, nodes);
            }
        }

        // Duration limit check (skip if smart resolution enabled)
        const isOverLimit = !this.biliConfig.smartResolution && durationForCheck > this.biliConfig.durationLimit;
        if (isOverLimit) {
            const mins = (durationForCheck / 60).toFixed(0);
            const limitMins = (this.biliConfig.durationLimit / 60).toFixed(0);
            infoSegments.push(seg.text(`\n⏱ 视频时长约${mins}分钟，超过限制${limitMins}分钟！`));
            await this.sendMixed(ctx, event, infoSegments);
            return true;
        }

        await this.sendMixed(ctx, event, infoSegments);

        // Download video
        const cachePath = this.getCachePath(event);
        const outputPath = path.join(cachePath, `${bvid}.mp4`);

        try {
            const qn = this.getQn();
            const dlResult = await getDownloadUrl(
                url, this.biliConfig.sessData, qn, durationForCheck,
                this.biliConfig.smartResolution, this.biliConfig.fileSizeLimit,
                this.biliConfig.videoCodec, this.biliConfig.cdnMode, this.biliConfig.minResolution
            );

            if (dlResult.skipReason) {
                await this.sendText(ctx, event, '⚠️ ' + dlResult.skipReason);
                return true;
            }
            if (dlResult.isPreview) {
                await this.sendText(ctx, event, `⚠️ 试看视频，仅${dlResult.previewDuration}秒`);
            }

            if (!dlResult.videoUrl) {
                await this.sendText(ctx, event, '无法获取视频下载链接');
                return true;
            }

            const downloader = createBiliDownloader(pluginState.getProxyUrl());
            if (dlResult.audioUrl) {
                await downloader.downloadAndMerge(dlResult.videoUrl, dlResult.audioUrl, outputPath);
            } else {
                await downloader.download(dlResult.videoUrl, outputPath);
            }

            await this.sendVideo(ctx, event, outputPath);
        } catch (err: any) {
            this.logError('Download failed:', err.message);
            await this.sendText(ctx, event, '视频下载失败：' + err.message);
        } finally {
            await this.cleanupFile(outputPath);
        }

        return true;
    }

    private async buildVideoInfo(info: any, partTitle: string | null, pParam: number | null): Promise<OB11Segment[]> {
        const segments: OB11Segment[] = [];

        // Cover
        if (this.biliConfig.displayCover && info.pic) {
            segments.push(seg.image(info.pic));
        }

        // Title
        let titleText = `${this.identifyPrefix}识别：哔哩哔哩，${info.title}`;
        if (partTitle && partTitle !== info.title) {
            titleText += `|${pParam || 1}P: ${partTitle}`;
        }
        segments.push(seg.text(titleText));

        // Stats
        if (this.biliConfig.displayInfo) {
            const statsMap: Record<string, number> = {
                '点赞': info.stat.like, '硬币': info.stat.coin, '收藏': info.stat.favorite,
                '分享': info.stat.share, '播放': info.stat.view, '弹幕': info.stat.danmaku, '评论': info.stat.reply,
            };
            segments.push(seg.text('\n' + formatBiliInfo(statsMap)));
        }

        // Description
        if (this.biliConfig.displayIntro && info.desc) {
            const filteredDesc = filterBiliDescLink(info.desc);
            segments.push(seg.text('\n📝 简介：' + truncateString(filteredDesc, this.biliConfig.introLenLimit)));
        }

        // Online count
        if (this.biliConfig.displayOnline) {
            const online = await getOnlineCount(info.bvid, info.cid);
            if (online) {
                segments.push(seg.text(`\n🏄 ${online.total}人在观看，${online.count}人在网页端`));
            }
        }

        return segments;
    }

    private getQn(): number {
        const resMap: Record<number, number> = {
            0: 127, 1: 126, 2: 125, 3: 120, 4: 116, 5: 112, 6: 80, 7: 74, 8: 64, 9: 32, 10: 16,
        };
        return resMap[this.biliConfig.resolution] || 64;
    }

    // ==================== Dynamic ====================

    private async handleDynamic(ctx: any, event: any, url: string): Promise<boolean> {
        if (!this.biliConfig.sessData) {
            await this.sendText(ctx, event, '未配置B站SESSDATA，无法解析动态');
            return true;
        }

        const cleanUrl = url.includes('?') ? url.substring(0, url.indexOf('?')) : url;
        const dynamicId = /[^\/]+(?!.*\/)/.exec(cleanUrl)?.[0];
        if (!dynamicId) return false;

        const { title, paragraphs } = await getDynamic(dynamicId, this.biliConfig.sessData);

        let identifyText = `${this.identifyPrefix}识别：哔哩哔哩动态`;
        if (title) identifyText += `\n📝 标题：${title}`;
        await this.sendText(ctx, event, identifyText);

        if (!paragraphs || paragraphs.length === 0) return true;

        // Build forward message
        const { nickname } = this.getSenderInfo(event);
        const senderId = String(event.self_id || event.user_id);
        const content: OB11Segment[] = [];
        let textBuffer: string[] = [];

        const flushText = () => {
            if (textBuffer.length > 0) {
                content.push(seg.text(textBuffer.join('\n')));
                textBuffer = [];
            }
        };

        for (const para of paragraphs) {
            if (para.type === 'text' || para.type === 'topic') {
                textBuffer.push(para.content || '');
            } else if (para.type === 'image') {
                flushText();
                content.push(seg.image(para.url || ''));
            } else if (para.type === 'divider') {
                textBuffer.push('---');
            }
        }
        flushText();

        if (content.length > 0) {
            const node = buildForwardNode(senderId, nickname, content);
            await this.sendForward(ctx, event, [node]);
        }

        return true;
    }

    // ==================== Article ====================

    private async handleArticle(ctx: any, event: any, url: string): Promise<boolean> {
        const cvid = url.match(/read\/cv(\d+)/)?.[1] || url.match(/read\/mobile\?id=(\d+)/)?.[1];
        if (!cvid) return false;

        const data = await getArticleInfo(cvid);
        const { title, author_name, origin_image_urls } = data;

        await this.sendText(ctx, event, `${this.identifyPrefix}识别：哔哩哔哩专栏\n标题：${title}\n作者：${author_name}`);

        if (origin_image_urls?.length > 0) {
            await this.sendImagesBatched(ctx, event, origin_image_urls);
        }

        return true;
    }

    // ==================== Live ====================

    private async handleLive(ctx: any, event: any, url: string): Promise<boolean> {
        const roomId = /\/(\d+)/.exec(new URL(url).pathname)?.[1];
        if (!roomId) return false;

        const info = await getLiveInfo(roomId);
        if (!info) {
            await this.sendText(ctx, event, '无法获取直播间信息');
            return true;
        }

        const segments: OB11Segment[] = [];
        if (info.user_cover) segments.push(seg.image(info.user_cover));
        if (info.keyframe) segments.push(seg.image(info.keyframe));

        let text = `${this.identifyPrefix}识别：哔哩哔哩直播，${info.title}`;
        if (info.description) text += `\n📝 ${info.description.replace(/&lt;p&gt;|&lt;\/p&gt;/g, '')}`;
        if (info.tags) text += `\n🔖 ${info.tags}`;
        if (info.parent_area_name) text += `\n📍 ${info.parent_area_name}-${info.area_name || ''}`;
        if (info.live_time) text += `\n⏰ ${info.live_time}`;
        segments.push(seg.text(text));

        await this.sendMixed(ctx, event, segments);
        return true;
    }

    // ==================== Bangumi ====================

    private async handleBangumi(ctx: any, event: any, url: string): Promise<boolean> {
        let epId = '';

        // Handle ssid -> epid
        if (url.includes('play/ss')) {
            const ssid = url.match(/\/ss(\d+)/)?.[1];
            if (ssid) {
                try {
                    const resp = await fetch(`https://api.bilibili.com/pgc/web/season/section?season_id=${ssid}`, {
                        headers: { 'User-Agent': 'Mozilla/5.0' },
                    });
                    const json = await resp.json() as any;
                    epId = String(json.result?.main_section?.episodes?.[0]?.share_url || '').replace(/.*\/ep/, '');
                } catch { /* ignore */ }
            }
        }
        if (!epId) {
            epId = url.match(/\/ep(\d+)/)?.[1] || '';
        }
        if (!epId) return false;

        const result = await getBangumiInfo(epId);
        if (!result) {
            await this.sendText(ctx, event, '番剧信息获取失败');
            return true;
        }

        const currentEp = result.episodes?.find((e: any) => String(e.ep_id) === epId || String(e.id) === epId);
        const statsMap: Record<string, number> = {
            '播放': result.stat?.views, '弹幕': result.stat?.danmakus, '点赞': result.stat?.likes,
            '追番': result.stat?.favorites, '收藏': result.stat?.favorite,
        };

        const segments: OB11Segment[] = [
            seg.image(result.cover),
            seg.text(
                `${this.identifyPrefix}识别：哔哩哔哩${result.type_name || '番剧'}，${result.title}\n` +
                `🎯 评分: ${result.rating?.score ?? '-'} / ${result.rating?.count ?? '-'}\n` +
                `📺 ${result.new_ep?.desc ?? '更新中'}\n` +
                formatBiliInfo(statsMap)
            ),
        ];

        // Duration check
        const durationSec = currentEp?.duration ? currentEp.duration / 1000 : 0;
        if (durationSec > this.biliConfig.bangumiDuration) {
            segments.push(seg.text(`\n⏱ 时长约${(durationSec / 60).toFixed(0)}分钟，超过限制`));
            await this.sendMixed(ctx, event, segments);
            return true;
        }

        await this.sendMixed(ctx, event, segments);

        // Download if enabled
        if (this.biliConfig.bangumiDirect && durationSec > 0) {
            const cachePath = this.getCachePath(event);
            const outputPath = path.join(cachePath, `bangumi_ep${epId}.mp4`);
            try {
                const qn = this.getQn();
                const dlResult = await getDownloadUrl(
                    `https://www.bilibili.com/bangumi/play/ep${epId}`,
                    this.biliConfig.sessData, qn, durationSec,
                    false, 999, this.biliConfig.videoCodec, this.biliConfig.cdnMode
                );
                if (dlResult.videoUrl) {
                    const downloader = createBiliDownloader();
                    if (dlResult.audioUrl) {
                        await downloader.downloadAndMerge(dlResult.videoUrl, dlResult.audioUrl, outputPath);
                    } else {
                        await downloader.download(dlResult.videoUrl, outputPath);
                    }
                    await this.sendVideo(ctx, event, outputPath);
                }
            } catch (err: any) {
                this.logError('Bangumi download failed:', err.message);
            } finally {
                await this.cleanupFile(outputPath);
            }
        }

        return true;
    }
}