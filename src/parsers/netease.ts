/**
 * rconsole-plus NapCat Plugin - Netease Cloud Music Parser
 * Handles: music.163.com, 163cn.tv short links
 */

import axios from 'axios';
import { BaseParser } from './base-parser.js';
import { seg } from '../types/parser.js';
import { NETEASE_TEMP_API, COMMON_USER_AGENT } from '../utils/api-constants.js';
import { Downloader } from '../utils/downloader.js';
import { downloadAudio, checkAndRemoveFile } from '../utils/common.js';
import path from 'node:path';

export class NeteaseParser extends BaseParser {
    name = 'netease';
    displayName = '网易云音乐';
    priority = 300;

    patterns = [
        /(?:https?:\/\/)?music\.163\.com\/(#\/)?song\?id=\d+/,
        /(?:https?:\/\/)?music\.163\.com\/(#\/)?playlist\?id=\d+/,
        /(?:https?:\/\/)?y\.music\.163\.com\/m\/song\?id=\d+/,
        /(?:https?:\/\/)?163cn\.tv\/[A-Za-z\d]+/,
        /(?:https?:\/\/)?music\.163\.com\/song\/media\/outer\/url\?id=\d+/,
    ];

    private get neteaseConfig() { return this.config.netease; }

    async handle(ctx: any, event: any, match: RegExpExecArray): Promise<boolean> {
        let url = event.raw_message?.trim() || '';

        try {
            // Resolve short link
            if (url.includes('163cn.tv')) {
                const shortUrl = /https?:\/\/163cn\.tv\/[A-Za-z\d]+/.exec(url)?.[0];
                if (shortUrl) {
                    try {
                        const resp = await fetch(shortUrl, { redirect: 'follow' });
                        url = resp.url;
                    } catch { /* use original */ }
                }
            }

            // Extract song ID
            const songId = /id=(\d+)/.exec(url)?.[1];
            if (!songId) {
                await this.sendText(ctx, event, '无法提取网易云音乐ID');
                return true;
            }

            // Fetch song info
            const infoResp = await axios.get(`https://music.163.com/api/song/detail?ids=[${songId}]`, {
                headers: { 'User-Agent': COMMON_USER_AGENT },
                timeout: 10000,
            });

            const song = infoResp.data?.songs?.[0];
            const songName = song?.name || '未知歌曲';
            const artists = song?.artists?.map((a: any) => a.name).join('/') || '未知歌手';
            const album = song?.album?.name || '';
            const cover = song?.album?.picUrl || '';

            let text = `${this.identifyPrefix}识别：网易云音乐\n🎵 ${songName}\n🎤 ${artists}`;
            if (album) text += `\n💿 ${album}`;

            if (cover) {
                await this.sendMixed(ctx, event, [seg.image(cover), seg.text(text)]);
            } else {
                await this.sendText(ctx, event, text);
            }

            // Try to get audio URL
            let audioUrl: string | null = null;

            // Method 1: Direct 163 URL
            audioUrl = `https://music.163.com/song/media/outer/url?id=${songId}.mp3`;

            // Method 2: Temp API (fallback)
            if (!audioUrl || this.neteaseConfig.useLocalAPI) {
                try {
                    const tempResp = await axios.get(NETEASE_TEMP_API.replace('{}', songName + ' ' + artists), {
                        timeout: 10000,
                    });
                    if (tempResp.data?.code === 200 && tempResp.data?.music_url) {
                        audioUrl = tempResp.data.music_url;
                    }
                } catch { /* use direct URL */ }
            }

            if (audioUrl) {
                if (this.neteaseConfig.sendAsVoice) {
                    // Send as voice message
                    const cachePath = this.getCachePath(event);
                    const audioPath = await downloadAudio(audioUrl, cachePath, `netease_${songId}`);
                    await this.sendRecord(ctx, event, audioPath);
                    await checkAndRemoveFile(audioPath);
                } else {
                    // Send as music card
                    await this.sendMixed(ctx, event, [
                        seg.music(
                            `https://music.163.com/#/song?id=${songId}`,
                            audioUrl,
                            `${songName} - ${artists}`,
                            cover
                        ),
                    ]);
                }
            }
        } catch (err: any) {
            this.logError('Parse failed:', err.message);
            await this.sendText(ctx, event, '网易云音乐解析失败');
        }

        return true;
    }
}