/**
 * rconsole-plus NapCat Plugin - YouTube Parser
 * Uses yt-dlp CLI for downloading. Handles youtube.com, youtu.be, music.youtube.com
 */

import child_process from 'node:child_process';
import { BaseParser } from './base-parser.js';
import { seg } from '../types/parser.js';
import { pluginState } from '../core/state.js';
import { checkToolInCurEnv, checkAndRemoveFile } from '../utils/common.js';
import path from 'node:path';
import fs from 'node:fs';

export class YoutubeParser extends BaseParser {
    name = 'youtube';
    displayName = 'YouTube';
    priority = 300;

    patterns = [
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?[^\s]*/,
        /(?:https?:\/\/)?youtu\.be\/[A-Za-z\d_-]+/,
        /(?:https?:\/\/)?music\.youtube\.com\/watch\?[^\s]*/,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/[A-Za-z\d_-]+/,
    ];

    private get ytConfig() { return this.config.youtube; }

    async handle(ctx: any, event: any, match: RegExpExecArray): Promise<boolean> {
        const url = match[0];

        // Check yt-dlp availability
        const hasYtDlp = await checkToolInCurEnv('yt-dlp');
        if (!hasYtDlp) {
            await this.sendText(ctx, event, '未安装yt-dlp，无法解析YouTube。请安装: pip install yt-dlp');
            return true;
        }

        // Check proxy
        const proxyUrl = pluginState.getProxyUrl();

        try {
            // Get title
            const title = await this.ytDlpGetTitle(url, proxyUrl);
            await this.sendText(ctx, event, `${this.identifyPrefix}识别：YouTube\n${title || '获取标题失败'}\n视频下载中...`);

            // Get duration
            const duration = await this.ytDlpGetDuration(url, proxyUrl);
            if (duration > 0 && duration > this.ytConfig.durationLimit) {
                const mins = (duration / 60).toFixed(0);
                const limitMins = (this.ytConfig.durationLimit / 60).toFixed(0);
                await this.sendText(ctx, event, `⏱ 视频时长约${mins}分钟，超过限制${limitMins}分钟`);
                return true;
            }

            // Get thumbnail
            const thumbnail = await this.ytDlpGetThumbnail(url, proxyUrl);
            if (thumbnail) {
                await this.sendImage(ctx, event, thumbnail);
            }

            // Download video
            const cachePath = this.getCachePath(event);
            const outputPath = path.join(cachePath, 'youtube.mp4');
            await checkAndRemoveFile(outputPath);

            await this.ytDlpDownload(url, outputPath, proxyUrl);

            if (fs.existsSync(outputPath)) {
                await this.sendVideo(ctx, event, outputPath);
            } else {
                await this.sendText(ctx, event, 'YouTube视频下载失败');
            }

            await this.cleanupFile(outputPath);
        } catch (err: any) {
            this.logError('Parse failed:', err.message);
            await this.sendText(ctx, event, 'YouTube解析失败：' + err.message);
        }

        return true;
    }

    private async ytDlpGetTitle(url: string, proxy?: string | null): Promise<string> {
        try {
            const args = ['--get-title', '--no-warnings'];
            if (proxy) args.push('--proxy', proxy);
            if (this.ytConfig.cookiePath) args.push('--cookies', this.ytConfig.cookiePath);
            args.push(url);
            return child_process.execFileSync('yt-dlp', args, { timeout: 30000 }).toString().trim();
        } catch { return ''; }
    }

    private async ytDlpGetDuration(url: string, proxy?: string | null): Promise<number> {
        try {
            const args = ['--get-duration', '--no-warnings'];
            if (proxy) args.push('--proxy', proxy);
            if (this.ytConfig.cookiePath) args.push('--cookies', this.ytConfig.cookiePath);
            args.push(url);
            const out = child_process.execFileSync('yt-dlp', args, { timeout: 30000 }).toString().trim();
            // Parse HH:MM:SS or MM:SS
            const parts = out.split(':').map(Number);
            if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
            if (parts.length === 2) return parts[0] * 60 + parts[1];
            return parseInt(out) || 0;
        } catch { return 0; }
    }

    private async ytDlpGetThumbnail(url: string, proxy?: string | null): Promise<string> {
        try {
            const args = ['--get-thumbnail', '--no-warnings'];
            if (proxy) args.push('--proxy', proxy);
            if (this.ytConfig.cookiePath) args.push('--cookies', this.ytConfig.cookiePath);
            args.push(url);
            return child_process.execFileSync('yt-dlp', args, { timeout: 30000 }).toString().trim();
        } catch { return ''; }
    }

    private async ytDlpDownload(url: string, outputPath: string, proxy?: string | null): Promise<void> {
        const args = [
            '-f', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
            '--merge-output-format', 'mp4',
            '-o', outputPath,
            '--no-warnings',
            '--no-playlist',
        ];
        if (proxy) args.push('--proxy', proxy);
        if (this.ytConfig.cookiePath) args.push('--cookies', this.ytConfig.cookiePath);
        if (this.ytConfig.graphicsOptions) args.push('-f', this.ytConfig.graphicsOptions);
        args.push(url);

        return new Promise((resolve, reject) => {
            const proc = child_process.spawn('yt-dlp', args, { timeout: 300000 });
            proc.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`yt-dlp exited with code ${code}`));
            });
            proc.on('error', reject);
        });
    }
}