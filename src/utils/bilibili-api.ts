/**
 * rconsole-plus NapCat Plugin - Bilibili API Utilities
 * Core API calls migrated from rconsole-plugin utils/bilibili.js
 */

import axios from 'axios';
import {
    BILI_HEADER,
    BILI_VIDEO_INFO,
    BILI_PLAY_STREAM,
    BILI_BVID_TO_CID,
    BILI_DYNAMIC,
    BILI_EP_INFO,
    BILI_SSID_INFO,
    BILI_BANGUMI_STREAM,
    BILI_ONLINE,
    BILI_ARTICLE_INFO,
    BILI_SUMMARY,
    BILI_STREAM_INFO,
    BILI_STREAM_FLV,
    BILI_SCAN_CODE_GENERATE,
    BILI_SCAN_CODE_DETECT,
} from './api-constants.js';
import { retryAxiosReq } from './common.js';

// ==================== Video Info ====================

export interface BiliVideoInfo {
    title: string;
    pic: string;
    desc: string;
    duration: number;
    stat: { view: number; danmaku: number; reply: number; favorite: number; coin: number; share: number; like: number };
    bvid: string;
    aid: number;
    cid: number;
    owner: { mid: number; name: string; face: string };
    pages: Array<{ cid: number; part: string; duration: number; page: number }>;
}

/** Get video info by URL */
export async function getVideoInfo(url: string): Promise<BiliVideoInfo> {
    const videoId = /video\/[^\?\/\s]+/.exec(url)?.[0]?.split('/')[1];
    if (!videoId) throw new Error('Cannot extract video ID from URL: ' + url);

    let apiUrl = `${BILI_VIDEO_INFO}?`;
    if (videoId.toLowerCase().startsWith('av')) {
        apiUrl += `aid=${videoId.slice(2)}`;
    } else {
        apiUrl += `bvid=${videoId}`;
    }

    const resp = await fetch(apiUrl);
    const json = await resp.json() as any;
    const d = json.data;
    return {
        title: d.title,
        pic: d.pic,
        desc: d.desc,
        duration: d.duration,
        stat: d.stat,
        bvid: d.bvid,
        aid: d.aid,
        cid: d.pages?.[0]?.cid,
        owner: d.owner,
        pages: d.pages,
    };
}

// ==================== CID ====================

export async function fetchCID(bvid: string): Promise<number> {
    const resp = await fetch(BILI_BVID_TO_CID.replace('{bvid}', bvid));
    const json = await resp.json() as any;
    return json.data[0].cid;
}

export async function getPageCid(bvid: string, pNumber: number): Promise<number | null> {
    try {
        const resp = await fetch(`${BILI_VIDEO_INFO}?bvid=${bvid}`);
        const json = await resp.json() as any;
        const pages = json.data?.pages;
        if (pages && pages.length >= pNumber && pNumber > 0) {
            return pages[pNumber - 1].cid;
        }
        return pages?.[0]?.cid || null;
    } catch {
        return null;
    }
}

// ==================== Download URL ====================

export function calculateFnval(qn: number, smartResolution: boolean = false) {
    const baseDash = 16;
    const av1Codec = 2048;
    let fnval = baseDash | av1Codec;
    let fourk = 0;

    if (smartResolution) {
        fnval = baseDash | av1Codec | 1024 | 128 | 64 | 512;
        fourk = 1;
        return { fnval, fourk };
    }

    if (qn >= 120) { fourk = 1; fnval |= 128; }
    if (qn >= 125) { fnval |= 64; }
    if (qn >= 126) { fnval |= 512; }
    if (qn >= 127) { fnval |= 1024; }

    return { fnval, fourk };
}

export interface DownloadUrlResult {
    videoUrl: string | null;
    audioUrl: string | null;
    skipReason?: string;
    isPreview?: boolean;
    previewDuration?: number;
    qualityDesc?: string;
}

/** Get video/audio stream URLs */
export async function getDownloadUrl(
    url: string,
    sessData: string,
    qn: number,
    duration: number = 0,
    smartResolution: boolean = false,
    fileSizeLimit: number = 100,
    preferredCodec: string = 'auto',
    cdnMode: number = 0,
    minResolution: number = 10
): Promise<DownloadUrlResult> {
    let bvid = '';
    let cid: number | null = null;
    let isBangumi = false;
    let epId = '';

    // Check bangumi
    const epMatch = /bangumi\/play\/ep(\d+)/.exec(url);
    if (epMatch) {
        isBangumi = true;
        epId = epMatch[1];
        const epInfo = await getBangumiVideoInfo(epId);
        if (!epInfo) throw new Error('Cannot get bangumi info');
        bvid = epInfo.bvid;
        cid = parseInt(epInfo.cid);
    } else {
        const videoMatch = /video\/[^\?\/\s]+/.exec(url);
        if (!videoMatch) throw new Error('Cannot parse video URL');
        bvid = videoMatch[0].split('/')[1];

        // Extract p parameter
        let pParam: number | null = null;
        try {
            const urlObj = new URL(url.startsWith('http') ? url : 'https://' + url);
            const pValue = urlObj.searchParams.get('p');
            if (pValue) pParam = parseInt(pValue, 10);
        } catch { /* ignore */ }

        if (bvid.toLowerCase().startsWith('av')) {
            const info = await getVideoInfo(url);
            bvid = info.bvid;
            cid = (pParam && info.pages?.length >= pParam) ? info.pages[pParam - 1].cid : info.cid;
        } else if (pParam && pParam > 0) {
            cid = await getPageCid(bvid, pParam);
        }
    }

    if (!cid) {
        cid = await fetchCID(bvid);
    }

    const { fnval, fourk } = calculateFnval(qn, smartResolution);

    const apiUrl = BILI_PLAY_STREAM
        .replace('{bvid}', bvid)
        .replace('{cid}', String(cid))
        .replace('{qn}', String(qn))
        .replace('{fnval}', String(fnval))
        .replace('{fourk}', String(fourk));

    const cookieHeader = sessData.includes('SESSDATA=') ? sessData : `SESSDATA=${sessData}`;
    const resp = await fetch(apiUrl, {
        headers: { ...BILI_HEADER, Cookie: cookieHeader },
    });
    const json = await resp.json() as any;

    if (json.code !== 0) {
        throw new Error('Bilibili API error: ' + json.message);
    }

    const data = json.data;

    // DURL format (preview/simple videos)
    if (data.durl && !data.dash) {
        const durl = data.durl[0];
        return {
            videoUrl: durl.url,
            audioUrl: null,
            isPreview: data.is_preview === 1,
            previewDuration: Math.round((durl.length || 0) / 1000),
        };
    }

    // DASH format
    if (!data.dash?.video) {
        throw new Error('No available video stream');
    }

    const { video, audio } = data.dash;

    // Select best video stream
    const getCodecType = (codecs: string) => {
        const c = codecs.toLowerCase();
        if (c.includes('av01') || c.includes('av1')) return 'av1';
        if (c.includes('hev1') || c.includes('hevc')) return 'hevc';
        if (c.includes('avc1') || c.includes('avc')) return 'avc';
        return 'unknown';
    };

    const codecPriority: Record<string, number> = { av1: 1, hevc: 2, avc: 3, unknown: 999 };
    if (preferredCodec === 'hevc') { codecPriority.hevc = 1; codecPriority.av1 = 2; }
    else if (preferredCodec === 'avc') { codecPriority.avc = 1; codecPriority.av1 = 2; codecPriority.hevc = 3; }

    // Sort: codec priority, then bandwidth
    const sorted = [...video].sort((a: any, b: any) => {
        const pa = codecPriority[getCodecType(a.codecs)] || 999;
        const pb = codecPriority[getCodecType(b.codecs)] || 999;
        if (pa !== pb) return pa - pb;
        return a.bandwidth - b.bandwidth;
    });

    // Smart resolution: find best fit within size limit
    let selectedVideo: any = null;
    const audioData = audio?.[0];
    const timelength = data.timelength || duration * 1000;

    if (smartResolution && timelength > 0) {
        const heights = [...new Set(video.map((v: any) => v.height))].sort((a: any, b: any) => b - a) as number[];
        for (const height of heights) {
            const candidates = sorted.filter((v: any) => v.height === height);
            for (const c of candidates) {
                const sizeMB = estimateSize(c, audioData, timelength);
                if (sizeMB <= fileSizeLimit) {
                    selectedVideo = c;
                    break;
                }
            }
            if (selectedVideo) break;
        }
        if (!selectedVideo) {
            // All exceed limit, use lowest
            const lowest = sorted[sorted.length - 1];
            const sizeMB = estimateSize(lowest, audioData, timelength);
            if (sizeMB > fileSizeLimit) {
                return { videoUrl: null, audioUrl: null, skipReason: `Lowest quality ${lowest.height}p (~${Math.round(sizeMB)}MB) exceeds ${fileSizeLimit}MB limit` };
            }
            selectedVideo = lowest;
        }
    } else {
        selectedVideo = sorted[0];
    }

    const videoUrl = selectBestCdn(selectedVideo.baseUrl, selectedVideo.backupUrl || [], cdnMode);
    const audioUrl = audioData ? selectBestCdn(audioData.baseUrl, audioData.backupUrl || [], cdnMode) : null;

    return { videoUrl, audioUrl };
}

function estimateSize(video: any, audio: any, timelengthMs: number): number {
    const totalBps = (video.bandwidth || 0) + (audio?.bandwidth || 0);
    return (totalBps / 8) * (timelengthMs / 1000) / (1024 * 1024);
}

// ==================== CDN Selection ====================

function selectBestCdn(baseUrl: string, backupUrls: string[], cdnMode: number = 0): string {
    if (cdnMode === 1) return baseUrl;

    const isSlowCdn = (url: string) => {
        try {
            const h = new URL(url).hostname;
            return h.includes('.mcdn.bilivideo.cn') || h.includes('mountaintoys.cn') || h.includes('.szbdyd.com');
        } catch { return false; }
    };

    if (!isSlowCdn(baseUrl)) return baseUrl;

    const good = backupUrls.find(u => !isSlowCdn(u));
    return good || baseUrl;
}

// ==================== Bangumi ====================

export async function getBangumiVideoInfo(epId: string): Promise<{ bvid: string; cid: string } | null> {
    try {
        const resp = await fetch(BILI_EP_INFO.replace('{}', epId), { headers: BILI_HEADER });
        const json = await resp.json() as any;
        if (json.code !== 0) return null;
        const result = json.result;
        const ep = result.episodes?.find((e: any) => String(e.id) === epId || String(e.ep_id) === epId)
            || result.episodes?.[0];
        if (!ep) return null;
        return { bvid: ep.bvid, cid: String(ep.cid || '') };
    } catch { return null; }
}

export async function getBangumiInfo(epId: string) {
    const resp = await fetch(BILI_EP_INFO.replace('{}', epId), { headers: BILI_HEADER });
    return (await resp.json() as any).result;
}

// ==================== Dynamic ====================

export interface DynamicResult {
    title: string;
    paragraphs: Array<{ type: 'text' | 'image' | 'topic' | 'divider' | 'link_card'; content?: string; url?: string }>;
}

export async function getDynamic(dynamicId: string, sessData: string): Promise<DynamicResult> {
    const apiUrl = BILI_DYNAMIC.replace('{}', dynamicId);
    const resp = await axios.get(apiUrl, {
        headers: { ...BILI_HEADER, Cookie: `SESSDATA=${sessData}` },
    });
    const item = resp.data?.data?.item;
    let title = '';
    const paragraphs: DynamicResult['paragraphs'] = [];

    for (const mod of item.modules || []) {
        if (mod.module_type === 'MODULE_TYPE_TITLE' && mod.module_title) {
            title = decodeHtmlEntities(mod.module_title.text || '');
        }
        if (mod.module_type === 'MODULE_TYPE_TOPIC' && mod.module_topic) {
            paragraphs.push({ type: 'topic', content: decodeHtmlEntities(mod.module_topic.name) });
        }
        if (mod.module_type === 'MODULE_TYPE_CONTENT') {
            for (const para of mod.module_content?.paragraphs || []) {
                if (para.para_type === 1 && para.text) {
                    const text = extractTextFromNodes(para.text.nodes);
                    if (text.trim()) paragraphs.push({ type: 'text', content: text });
                } else if (para.para_type === 2 && para.pic) {
                    for (const pic of para.pic.pics || []) {
                        if (pic.url) paragraphs.push({ type: 'image', url: pic.url });
                    }
                } else if (para.para_type === 3) {
                    paragraphs.push({ type: 'divider', content: '---' });
                }
            }
        }
    }
    return { title, paragraphs };
}

function decodeHtmlEntities(text: string): string {
    if (!text) return '';
    return text
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function extractTextFromNodes(nodes: any[]): string {
    if (!Array.isArray(nodes)) return '';
    let text = '';
    for (const node of nodes) {
        if (node.type === 'TEXT_NODE_TYPE_WORD' && node.word) {
            text += node.word.words || '';
        } else if (node.type === 'TEXT_NODE_TYPE_RICH' && node.rich) {
            if (node.rich.type === 'RICH_TEXT_NODE_TYPE_WEB') {
                text += node.rich.jump_url ? `[${node.rich.text || 'link'}](${node.rich.jump_url})` : (node.rich.text || '');
            } else {
                text += node.rich.text || node.rich.orig_text || '';
            }
        } else if (node.type === 'TEXT_NODE_TYPE_FORMULA' && node.formula) {
            text += node.formula.latex_content || '';
        }
    }
    return decodeHtmlEntities(text);
}

// ==================== AI Summary ====================

export interface AISummaryResult {
    summary: string;
    outline: Array<{ title: string; part_outline?: Array<{ timestamp: number; content: string }> }> | null;
}

export async function getBiliAISummary(bvid: string, cid: number, upMid: number, sessData: string): Promise<AISummaryResult> {
    if (!sessData) return { summary: '', outline: null };
    try {
        const { getWbi } = await import('./crypto/bili-wbi.js');
        const wbi = await getWbi({ bvid, cid, up_mid: upMid }, sessData);
        const url = `${BILI_SUMMARY}?${wbi}`;
        const resp = await fetch(url, {
            headers: { ...BILI_HEADER, Cookie: `SESSDATA=${sessData}` },
        });
        const json = await resp.json() as any;
        if (json.code !== 0) return { summary: '', outline: null };
        const mr = json.data?.model_result;
        return { summary: mr?.summary || '', outline: mr?.outline || null };
    } catch {
        return { summary: '', outline: null };
    }
}

export function formatAISummary(result: AISummaryResult): string {
    if (!result.summary) return '';
    let text = '摘要：' + result.summary + '\n';
    if (result.outline?.length) {
        text += '\n';
        for (const s of result.outline) {
            text += '- ' + s.title + '\n';
            for (const p of s.part_outline || []) {
                const m = Math.floor(p.timestamp / 60);
                const sec = p.timestamp % 60;
                text += `  ${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}  ${p.content}\n`;
            }
            text += '\n';
        }
    }
    return text;
}

// ==================== Online Count ====================

export async function getOnlineCount(bvid: string, cid: number): Promise<{ total: string; count: string } | null> {
    try {
        const url = BILI_ONLINE.replace('{0}', bvid).replace('{1}', String(cid));
        const resp = await axios.get(url);
        return { total: resp.data?.data?.total, count: resp.data?.data?.count };
    } catch {
        return null;
    }
}

// ==================== Article ====================

export async function getArticleInfo(cvid: string) {
    const resp = await fetch(BILI_ARTICLE_INFO.replace('{}', cvid), { headers: BILI_HEADER });
    return (await resp.json() as any).data;
}

// ==================== Live ====================

export async function getLiveInfo(roomId: string) {
    const resp = await axios.get(`${BILI_STREAM_INFO}?room_id=${roomId}`, {
        headers: { 'User-Agent': BILI_HEADER['User-Agent'] },
    });
    return resp.data?.data;
}

export async function getLiveStream(roomId: string) {
    const resp = await axios.get(`${BILI_STREAM_FLV}?cid=${roomId}`, {
        headers: { 'User-Agent': BILI_HEADER['User-Agent'] },
    });
    return resp.data?.data;
}

// ==================== Desc Filter ====================

export function filterBiliDescLink(desc: string): string {
    if (!desc) return '';
    return desc.replace(/(?:https?:\/\/)?(?:www\.|music\.)?youtube\.com\/[A-Za-z\d._?%&+\-=\/#]*/g, '').replace(/\n/g, '').trim();
}