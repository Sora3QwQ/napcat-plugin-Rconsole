/**
 * rconsole-plus NapCat Plugin - QQ Music & Qishui Music Parser
 * Handles: y.qq.com, c.y.qq.com, qishui.douyin.com
 */

import axios from 'axios';
import { BaseParser } from './base-parser.js';
import { seg } from '../types/parser.js';
import { QQ_MUSIC_TEMP_API, QISHUI_MUSIC_TEMP_API } from '../utils/api-constants.js';
import { downloadAudio, checkAndRemoveFile } from '../utils/common.js';

export class QQMusicParser extends BaseParser {
    name = 'qqMusic';
    displayName = 'QQ音乐';
    priority = 300;

    patterns = [
        /(?:https?:\/\/)?(?:y\.qq\.com|c\.y\.qq\.com|i\.y\.qq\.com)\/[A-Za-z\d._?%&+\-=\/#]*/,
    ];

    async handle(ctx: any, event: any, match: RegExpExecArray): Promise<boolean> {
        const url = event.raw_message?.trim() || '';

        try {
            // Extract song name from share link text
            const songName = this.extractSongName(url);
            await this.sendText(ctx, event, `${this.identifyPrefix}识别：QQ音乐${songName ? '\n🎵 ' + songName : ''}`);

            if (songName) {
                const resp = await axios.get(QQ_MUSIC_TEMP_API.replace('{}', encodeURIComponent(songName)), {
                    timeout: 10000,
                });

                const data = resp.data;
                if (data?.code === 200 && data?.music_url) {
                    const cover = data?.cover || '';
                    const title = data?.title || songName;
                    const artist = data?.author || '';

                    if (cover) {
                        await this.sendMixed(ctx, event, [
                            seg.image(cover),
                            seg.text(`🎵 ${title}${artist ? ' - ' + artist : ''}`),
                        ]);
                    }

                    const cachePath = this.getCachePath(event);
                    const audioPath = await downloadAudio(data.music_url, cachePath, `qqmusic_${Date.now()}`);
                    await this.sendRecord(ctx, event, audioPath);
                    await checkAndRemoveFile(audioPath);
                } else {
                    await this.sendText(ctx, event, 'QQ音乐获取失败');
                }
            }
        } catch (err: any) {
            this.logError('Parse failed:', err.message);
            await this.sendText(ctx, event, 'QQ音乐解析失败');
        }

        return true;
    }

    private extractSongName(text: string): string {
        // QQ music share format: "分享xx的单曲《歌名》" or just the URL
        const nameMatch = /《(.+?)》/.exec(text);
        if (nameMatch) return nameMatch[1];
        // Try songname param
        const paramMatch = /songname=([^&]+)/.exec(text);
        if (paramMatch) return decodeURIComponent(paramMatch[1]);
        return '';
    }
}

export class QishuiMusicParser extends BaseParser {
    name = 'qishuiMusic';
    displayName = '汽水音乐';
    priority = 300;

    patterns = [
        /(?:https?:\/\/)?qishui\.douyin\.com\/[A-Za-z\d._?%&+\-=\/#]*/,
    ];

    async handle(ctx: any, event: any, match: RegExpExecArray): Promise<boolean> {
        const url = event.raw_message?.trim() || '';

        try {
            // Extract song name
            const songName = /《(.+?)》/.exec(url)?.[1] || '';
            await this.sendText(ctx, event, `${this.identifyPrefix}识别：汽水音乐${songName ? '\n🎵 ' + songName : ''}`);

            if (songName) {
                const resp = await axios.get(QISHUI_MUSIC_TEMP_API.replace('{}', encodeURIComponent(songName)), {
                    timeout: 10000,
                });

                const data = resp.data;
                if (data?.code === 200 || data?.data?.music_url) {
                    const musicUrl = data?.data?.music_url || data?.music_url;
                    if (musicUrl) {
                        const cachePath = this.getCachePath(event);
                        const audioPath = await downloadAudio(musicUrl, cachePath, `qishui_${Date.now()}`);
                        await this.sendRecord(ctx, event, audioPath);
                        await checkAndRemoveFile(audioPath);
                    }
                } else {
                    await this.sendText(ctx, event, '汽水音乐获取失败');
                }
            }
        } catch (err: any) {
            this.logError('Parse failed:', err.message);
            await this.sendText(ctx, event, '汽水音乐解析失败');
        }

        return true;
    }
}