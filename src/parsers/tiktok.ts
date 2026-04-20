/**
 * rconsole-plus NapCat Plugin - TikTok Parser
 * Uses yt-dlp CLI. Handles www.tiktok.com, vt.tiktok.com, vm.tiktok.com
 */

import child_process from 'node:child_process';
import { BaseParser } from './base-parser.js';
import { pluginState } from '../core/state.js';
import { checkToolInCurEnv, checkAndRemoveFile, testProxy } from '../utils/common.js';
import path from 'node:path';
import fs from 'node:fs';

export class TiktokParser extends BaseParser {
    name = 'tiktok';
    displayName = 'TikTok';
    priority = 300;

    patterns = [
        /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[\w.]+\/video\/\d+/,
        /(?:https?:\/\/)?vt\.tiktok\.com\/[A-Za-z\d]+/,
        /(?:https?:\/\/)?vm\.tiktok\.com\/[A-Za-z\d]+/,
    ];

    async handle(ctx: any, event: any, match: RegExpExecArray): Promise<boolean> {
        const url = match[0];

        const hasYtDlp = await checkToolInCurEnv('yt-dlp');
        if (!hasYtDlp) {
            await this.sendText(ctx, event, '未安装yt-dlp，无法解析TikTok');
            return true;
        }

        const proxyUrl = pluginState.getProxyUrl();
        if (!proxyUrl) {
            const canAccess = await testProxy('www.tiktok.com', 443).catch(() => false);
            if (!canAccess) {
                await this.sendText(ctx, event, '未配置代理，无法解析TikTok');
                return true;
            }
        }

        try {
            // Get title
            const args = ['--get-title', '--no-warnings'];
            if (proxyUrl) args.push('--proxy', proxyUrl);
            args.push(url);
            let title = '';
            try {
                title = child_process.execFileSync('yt-dlp', args, { timeout: 30000 }).toString().trim();
            } catch { /* ignore */ }

            await this.sendText(ctx, event, `${this.identifyPrefix}识别：TikTok\n${title || '下载中...'}`);

            // Download
            const cachePath = this.getCachePath(event);
            const outputPath = path.join(cachePath, 'tiktok.mp4');
            await checkAndRemoveFile(outputPath);

            // Remove unnecessary params from URL
            let cleanUrl = url;
            try {
                const parsed = new URL(url);
                parsed.search = '';
                cleanUrl = parsed.toString();
            } catch { /* use original */ }

            const dlArgs = [
                '-f', 'best',
                '--merge-output-format', 'mp4',
                '-o', outputPath,
                '--no-warnings',
            ];
            if (proxyUrl) dlArgs.push('--proxy', proxyUrl);
            dlArgs.push(cleanUrl);

            await new Promise<void>((resolve, reject) => {
                const proc = child_process.spawn('yt-dlp', dlArgs, { timeout: 120000 });
                proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`yt-dlp exited ${code}`)));
                proc.on('error', reject);
            });

            if (fs.existsSync(outputPath)) {
                await this.sendVideo(ctx, event, outputPath);
            } else {
                await this.sendText(ctx, event, 'TikTok视频下载失败');
            }

            await this.cleanupFile(outputPath);
        } catch (err: any) {
            this.logError('Parse failed:', err.message);
            await this.sendText(ctx, event, 'TikTok解析失败');
        }

        return true;
    }
}