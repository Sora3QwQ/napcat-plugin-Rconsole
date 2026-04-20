/**
 * rconsole-plus NapCat Plugin - Base Parser
 * All platform parsers extend this class.
 */

import type { ParserRoute, OB11Segment, ForwardNode } from '../types/parser.js';
import type { PluginConfig } from '../types/config.js';
import { seg, buildForwardNode } from '../types/parser.js';
import { pluginState } from '../core/state.js';
import {
    sendMessage,
    sendText,
    sendImage,
    sendImages,
    sendVideo,
    sendRecord,
    sendMixed,
    sendForwardMsg,
    sendImagesInBatches,
    sendTextsAsForward,
} from '../handlers/message-handler.js';
import fs from 'node:fs';
import path from 'node:path';

export abstract class BaseParser {
    /** Internal name, e.g. "bilibili" */
    abstract name: string;
    /** Display name, e.g. "哔哩哔哩" */
    abstract displayName: string;
    /** URL patterns to match */
    abstract patterns: RegExp[];
    /** Priority (lower = higher priority) */
    priority: number = 300;

    /** Handle a matched message. Return true if handled. */
    abstract handle(ctx: any, event: any, match: RegExpExecArray): Promise<boolean>;

    /** Convert this parser into a ParserRoute for the router */
    toRoute(): ParserRoute {
        return {
            name: this.name,
            displayName: this.displayName,
            patterns: this.patterns,
            handler: (ctx, event, match) => this.handle(ctx, event, match),
            priority: this.priority,
        };
    }

    // ==================== Config Helpers ====================

    /** Get full plugin config */
    protected get config(): PluginConfig {
        return pluginState.config;
    }

    /** Get identify prefix */
    protected get identifyPrefix(): string {
        return this.config.global.identifyPrefix;
    }

    // ==================== Message Sending ====================

    /** Send text */
    protected async sendText(ctx: any, event: any, text: string) {
        return sendText(ctx, event, text);
    }

    /** Send image */
    protected async sendImage(ctx: any, event: any, file: string) {
        return sendImage(ctx, event, file);
    }

    /** Send multiple images */
    protected async sendImages(ctx: any, event: any, files: string[]) {
        return sendImages(ctx, event, files);
    }

    /** Send video */
    protected async sendVideo(ctx: any, event: any, filePath: string) {
        return sendVideo(ctx, event, filePath);
    }

    /** Send voice */
    protected async sendRecord(ctx: any, event: any, filePath: string) {
        return sendRecord(ctx, event, filePath);
    }

    /** Send mixed content (text + images + etc.) */
    protected async sendMixed(ctx: any, event: any, segments: OB11Segment[]) {
        return sendMixed(ctx, event, segments);
    }

    /** Send forward message */
    protected async sendForward(ctx: any, event: any, nodes: ForwardNode[]) {
        return sendForwardMsg(ctx, event, nodes);
    }

    /** Send images with auto-batching for large sets */
    protected async sendImagesBatched(
        ctx: any,
        event: any,
        files: string[],
        senderName?: string
    ) {
        const threshold = this.config.global.imageBatchThreshold;
        const limit = this.config.global.globalImageLimit;

        if (files.length > limit) {
            // Exceeds limit: send as forward message in batches
            await sendImagesInBatches(ctx, event, files, threshold, senderName || 'Bot');
        } else {
            // Within limit: send directly
            await sendImages(ctx, event, files);
        }
    }

    /** Send text + image combined */
    protected async sendTextWithImage(ctx: any, event: any, text: string, imageFile: string) {
        return sendMixed(ctx, event, [seg.image(imageFile), seg.text(text)]);
    }

    /** Send texts as forward message */
    protected async sendTextsForward(ctx: any, event: any, texts: string[], senderName?: string) {
        return sendTextsAsForward(ctx, event, texts, senderName || 'Bot');
    }

    // ==================== File Helpers ====================

    /** Get cache directory path for this parser */
    protected getCachePath(event?: any): string {
        const base = this.config.global.defaultCachePath;
        const groupPart = event?.group_id ? String(event.group_id) : 'private';
        const dir = path.resolve(base, groupPart);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        return dir;
    }

    /** Clean up a temporary file */
    protected async cleanupFile(filePath: string) {
        try {
            if (fs.existsSync(filePath)) {
                await fs.promises.unlink(filePath);
            }
        } catch { /* ignore */ }
    }

    /** Clean up multiple temporary files */
    protected async cleanupFiles(filePaths: string[]) {
        await Promise.all(filePaths.map(f => this.cleanupFile(f)));
    }

    // ==================== Logging ====================

    protected log(...args: any[]) {
        pluginState.log('info', `[${this.displayName}]`, ...args);
    }

    protected logWarn(...args: any[]) {
        pluginState.log('warn', `[${this.displayName}]`, ...args);
    }

    protected logError(...args: any[]) {
        pluginState.log('error', `[${this.displayName}]`, ...args);
    }

    protected logDebug(...args: any[]) {
        pluginState.logDebug(`[${this.displayName}]`, ...args);
    }

    // ==================== Utility ====================

    /** Get event sender info */
    protected getSenderInfo(event: any) {
        return {
            userId: String(event.user_id || ''),
            nickname: event.sender?.card || event.sender?.nickname || String(event.user_id || ''),
            groupId: event.group_id ? String(event.group_id) : null,
        };
    }

    /** Truncate string to max length */
    protected truncate(text: string, maxLen: number = 100): string {
        if (!text || text.length <= maxLen) return text || '';
        return text.substring(0, maxLen) + '...';
    }

    /** Format large numbers: 12345 -> 1.2万 */
    protected formatCount(num: number): string {
        if (num >= 100000000) return (num / 100000000).toFixed(1) + '亿';
        if (num >= 10000) return (num / 10000).toFixed(1) + '万';
        return String(num);
    }
}