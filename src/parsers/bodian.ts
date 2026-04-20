/**
 * rconsole-plus NapCat Plugin - Bodian Music Parser
 * Handles: bodian.com, h5app.kuwo.cn (波点音乐)
 */

import axios from 'axios';
import { BaseParser } from './base-parser.js';
import { seg } from '../types/parser.js';
import { downloadAudio, checkAndRemoveFile } from '../utils/common.js';

const BODIAN_API = 'https://bd-api.kuwo.cn/api/service/music/audioUrl/';
const BODIAN_INFO = 'https://bd-api.kuwo.cn/api/service/music/info/';

export class BodianParser extends BaseParser {
    name = 'bodian';
    displayName = '波点音乐';
    priority = 300;

    patterns = [
        /(?:https?:\/\/)?(?:h5app\.kuwo\.cn\/m\/bodian\/playMusic\.html|bodian\.com\/s\/)\?[A-Za-z\d._?%&+\-=\/#]*/,
    ];

    async handle(ctx: any, event: any, match: RegExpExecArray): Promise<boolean> {
        const url = event.raw_message?.trim() || '';

        try {
            // Extract song ID
            const songId = /musicId=(\d+)/.exec(url)?.[1] || /uid=(\d+)/.exec(url)?.[1];
            if (!songId) {
                await this.sendText(ctx, event, '无法提取波点音乐ID');
                return true;
            }

            // Get song info
            const infoResp = await axios.get(BODIAN_INFO + songId, { timeout: 10000 });
            const songData = infoResp.data?.data;
            const songName = songData?.name || '未知歌曲';
            const artist = songData?.artist || '未知';
            const cover = songData?.pic || '';

            let text = `${this.identifyPrefix}识别：波点音乐\n🎵 ${songName}\n🎤 ${artist}`;
            if (cover) {
                await this.sendMixed(ctx, event, [seg.image(cover), seg.text(text)]);
            } else {
                await this.sendText(ctx, event, text);
            }

            // Get audio URL
            const audioResp = await axios.get(BODIAN_API + songId, { timeout: 10000 });
            const audioUrl = audioResp.data?.data?.audioUrl;
            if (audioUrl) {
                const cachePath = this.getCachePath(event);
                const audioPath = await downloadAudio(audioUrl, cachePath, `bodian_${songId}`);
                await this.sendRecord(ctx, event, audioPath);
                await checkAndRemoveFile(audioPath);
            }
        } catch (err: any) {
            this.logError('Parse failed:', err.message);
            await this.sendText(ctx, event, '波点音乐解析失败');
        }

        return true;
    }
}