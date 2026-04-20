/**
 * rconsole-plus NapCat Plugin - Command Handlers
 * Handles command-based interactions:
 * - #翻译 / #translate
 * - #点歌 / #song
 * - #总结 / #summary
 * - #帮助 / #help
 * - #解析开关
 */

import { BaseParser } from './base-parser.js';
import { seg, buildForwardNode } from '../types/parser.js';
import { pluginState } from '../core/state.js';

// ==================== Translate Command ====================

export class TranslateCommand extends BaseParser {
    name = 'translate';
    displayName = '翻译';
    priority = 100; // High priority for commands

    patterns = [
        /^#翻译\s+/,
        /^#translate\s+/i,
    ];

    async handle(ctx: any, event: any, match: RegExpExecArray): Promise<boolean> {
        const fullMsg = event.raw_message?.trim() || '';

        // Parse: #翻译 [目标语言] 内容
        // e.g. #翻译 英语 你好世界
        // e.g. #翻译 你好世界  (default: auto detect source, target ZH)
        const afterCmd = fullMsg.replace(/^#(翻译|translate)\s+/i, '');

        let targetLang = 'ZH';
        let text = afterCmd;

        // Check if first word is a language specifier
        const langMatch = afterCmd.match(/^(英语|日语|韩语|法语|德语|西班牙语|俄语|中文|en|ja|ko|fr|de|es|ru|zh)\s+/i);
        if (langMatch) {
            targetLang = langMatch[1];
            text = afterCmd.slice(langMatch[0].length);
        }

        if (!text.trim()) {
            await this.sendText(ctx, event, '用法：#翻译 [目标语言] 内容\n例如：#翻译 英语 你好世界');
            return true;
        }

        try {
            await this.sendText(ctx, event, '翻译中...');
            const { translate } = await import('../services/translate.js');
            const result = await translate(text, targetLang);
            await this.sendText(ctx, event, `翻译结果 (${result.engine})：\n${result.text}`);
        } catch (err: any) {
            this.logError('Translate failed:', err.message);
            await this.sendText(ctx, event, '翻译失败：' + err.message);
        }

        return true;
    }
}

// ==================== Song Request Command ====================

export class SongRequestCommand extends BaseParser {
    name = 'songRequest';
    displayName = '点歌';
    priority = 100;

    patterns = [
        /^#点歌\s+/,
        /^#song\s+/i,
    ];

    async handle(ctx: any, event: any, match: RegExpExecArray): Promise<boolean> {
        const fullMsg = event.raw_message?.trim() || '';
        const afterCmd = fullMsg.replace(/^#(点歌|song)\s+/i, '');

        // Parse: #点歌 [平台] 歌名
        // e.g. #点歌 酷狗 晴天
        // e.g. #点歌 晴天 (default: kugou)
        let platform = 'kugou';
        let keyword = afterCmd;

        const platformMatch = afterCmd.match(/^(酷狗|kugou|qq|QQ|网易|netease)\s+/i);
        if (platformMatch) {
            const p = platformMatch[1].toLowerCase();
            if (p === '酷狗' || p === 'kugou') platform = 'kugou';
            else if (p === 'qq') platform = 'qq';
            else if (p === '网易' || p === 'netease') platform = 'netease';
            keyword = afterCmd.slice(platformMatch[0].length);
        }

        if (!keyword.trim()) {
            await this.sendText(ctx, event, '用法：#点歌 [平台] 歌名\n平台可选：酷狗(默认)、QQ、网易');
            return true;
        }

        try {
            const { searchSong, getKugouPlayUrl } = await import('../services/song-request.js');
            const results = await searchSong(keyword, platform);

            if (results.length === 0) {
                await this.sendText(ctx, event, `未找到「${keyword}」的相关歌曲`);
                return true;
            }

            const song = results[0];

            // Get audio URL for Kugou
            let audioUrl = song.audioUrl;
            if (!audioUrl && platform === 'kugou' && (song as any)._hash) {
                audioUrl = await getKugouPlayUrl((song as any)._hash, (song as any)._albumId) || undefined;
            }

            // Send info
            let text = `🎵 ${song.title}\n🎤 ${song.artist}`;
            if (song.album) text += `\n💿 ${song.album}`;
            text += `\n来源：${song.source}`;

            if (song.cover) {
                await this.sendMixed(ctx, event, [seg.image(song.cover), seg.text(text)]);
            } else {
                await this.sendText(ctx, event, text);
            }

            // Send audio
            if (audioUrl) {
                const { downloadAudio, checkAndRemoveFile } = await import('../utils/common.js');
                const cachePath = this.getCachePath(event);
                const audioPath = await downloadAudio(audioUrl, cachePath, `song_${Date.now()}`);
                await this.sendRecord(ctx, event, audioPath);
                await checkAndRemoveFile(audioPath);
            } else {
                await this.sendText(ctx, event, '音频获取失败，可能需要VIP');
            }
        } catch (err: any) {
            this.logError('Song request failed:', err.message);
            await this.sendText(ctx, event, '点歌失败：' + err.message);
        }

        return true;
    }
}

// ==================== Link Summary Command ====================

export class LinkSummaryCommand extends BaseParser {
    name = 'linkSummary';
    displayName = 'AI总结';
    priority = 100;

    patterns = [
        /^#总结\s+https?:\/\//,
        /^#summary\s+https?:\/\//i,
    ];

    async handle(ctx: any, event: any, match: RegExpExecArray): Promise<boolean> {
        const fullMsg = event.raw_message?.trim() || '';
        const urlMatch = /(https?:\/\/[^\s]+)/.exec(fullMsg);

        if (!urlMatch) {
            await this.sendText(ctx, event, '用法：#总结 <链接地址>');
            return true;
        }

        const url = urlMatch[1];

        try {
            await this.sendText(ctx, event, '正在分析链接内容...');
            const { summarizeLink } = await import('../services/link-summary.js');
            const summary = await summarizeLink(url);
            await this.sendText(ctx, event, `📋 AI总结：\n${summary}`);
        } catch (err: any) {
            this.logError('Link summary failed:', err.message);
            await this.sendText(ctx, event, '链接总结失败：' + err.message);
        }

        return true;
    }
}

// ==================== Help Command ====================

export class HelpCommand extends BaseParser {
    name = 'help';
    displayName = '帮助';
    priority = 50;

    patterns = [
        /^#(帮助|help|rconsole)$/i,
    ];

    async handle(ctx: any, event: any, match: RegExpExecArray): Promise<boolean> {
        const helpText = [
            '=== rconsole-plus 插件帮助 ===',
            '',
            '📎 链接解析（自动识别）：',
            '  B站 | 抖音 | 微博 | 小红书 | YouTube',
            '  TikTok | A站 | 快手 | 西瓜 | 皮皮虾',
            '  网易云 | QQ音乐 | 汽水音乐 | 波点音乐',
            '  米游社 | 小黑盒 | X/Twitter | Telegram',
            '  百度贴吧 | 微视',
            '',
            '⌨️ 命令功能：',
            '  #翻译 [目标语言] 文本',
            '  #点歌 [平台] 歌名',
            '  #总结 <链接>',
            '  #帮助',
            '',
            '⚙️ 管理：',
            '  配置管理请通过 NapCat WebUI',
        ].join('\n');

        await this.sendText(ctx, event, helpText);
        return true;
    }
}

// ==================== Resolve Controller Command ====================

export class ResolveControllerCommand extends BaseParser {
    name = 'resolveController';
    displayName = '解析管理';
    priority = 50;

    patterns = [
        /^#(解析开关|解析管理|parser)$/i,
        /^#(开启|关闭)(解析|parser)\s+\w+$/i,
    ];

    async handle(ctx: any, event: any, match: RegExpExecArray): Promise<boolean> {
        const msg = event.raw_message?.trim() || '';

        // Toggle specific parser
        const toggleMatch = msg.match(/^#(开启|关闭)(解析|parser)\s+(\w+)$/i);
        if (toggleMatch) {
            const action = toggleMatch[1];
            const parserName = toggleMatch[3];
            const enabled = action === '开启';

            pluginState.config.resolveController[parserName] = enabled;
            await this.sendText(ctx, event, `${parserName} 解析已${enabled ? '开启' : '关闭'}`);
            return true;
        }

        // Show status
        const ctrl = pluginState.config.resolveController;
        const lines = ['=== 解析器状态 ==='];
        for (const [name, enabled] of Object.entries(ctrl)) {
            lines.push(`  ${enabled ? '✅' : '❌'} ${name}`);
        }
        lines.push('', '操作：#开启解析 <名称> / #关闭解析 <名称>');
        await this.sendText(ctx, event, lines.join('\n'));

        return true;
    }
}