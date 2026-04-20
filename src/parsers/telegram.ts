/**
 * rconsole-plus NapCat Plugin - Telegram Parser
 * Uses tdl CLI for downloading. Handles t.me links.
 */

import child_process from 'node:child_process';
import { BaseParser } from './base-parser.js';
import { pluginState } from '../core/state.js';
import { checkToolInCurEnv, checkAndRemoveFile } from '../utils/common.js';
import path from 'node:path';
import fs from 'node:fs';

export class TelegramParser extends BaseParser {
    name = 'telegram';
    displayName = 'Telegram';
    priority = 300;

    patterns = [
        /(?:https?:\/\/)?t\.me\/[A-Za-z\d_]+\/\d+/,
    ];

    async handle(ctx: any, event: any, match: RegExpExecArray): Promise<boolean> {
        const url = match[0];

        const hasTdl = await checkToolInCurEnv('tdl');
        if (!hasTdl) {
            await this.sendText(ctx, event, '未安装tdl，无法解析Telegram。请安装: https://github.com/iyear/tdl');
            return true;
        }

        const proxyUrl = pluginState.getProxyUrl();

        try {
            await this.sendText(ctx, event, `${this.identifyPrefix}识别：Telegram，下载中...`);

            const cachePath = this.getCachePath(event);
            const args = ['dl', '-u', url, '-d', cachePath, '--skip-same'];
            if (proxyUrl) {
                args.push('--proxy', proxyUrl);
            }

            await new Promise<void>((resolve, reject) => {
                const proc = child_process.spawn('tdl', args, { timeout: 300000 });
                let stderr = '';
                proc.stderr?.on('data', (d) => { stderr += d.toString(); });
                proc.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`tdl exited ${code}: ${stderr}`));
                });
                proc.on('error', reject);
            });

            // Find downloaded files
            const files = fs.readdirSync(cachePath)
                .filter(f => f.endsWith('.mp4') || f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.gif') || f.endsWith('.webm'))
                .sort((a, b) => {
                    const sa = fs.statSync(path.join(cachePath, a)).mtimeMs;
                    const sb = fs.statSync(path.join(cachePath, b)).mtimeMs;
                    return sb - sa; // newest first
                });

            if (files.length === 0) {
                await this.sendText(ctx, event, 'Telegram内容下载完成但未找到媒体文件');
                return true;
            }

            const latestFile = path.join(cachePath, files[0]);
            const ext = path.extname(files[0]).toLowerCase();

            if (['.mp4', '.webm'].includes(ext)) {
                await this.sendVideo(ctx, event, latestFile);
            } else if (['.jpg', '.png', '.gif'].includes(ext)) {
                await this.sendImage(ctx, event, latestFile);
            }

            // Cleanup
            await checkAndRemoveFile(latestFile);
        } catch (err: any) {
            this.logError('Parse failed:', err.message);
            await this.sendText(ctx, event, 'Telegram解析失败：' + err.message);
        }

        return true;
    }
}