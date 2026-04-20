/**
 * rconsole-plus NapCat Plugin - Message Router
 * Replaces Yunzai's rule[] regex matching system.
 */

import type { ParserRoute } from '../types/parser.js';
import { pluginState } from './state.js';

export class MessageRouter {
    private routes: ParserRoute[] = [];

    /** Register a parser route */
    register(route: ParserRoute) {
        this.routes.push(route);
        // Sort by priority (lower = higher priority)
        this.routes.sort((a, b) => (a.priority ?? 300) - (b.priority ?? 300));
        pluginState.logDebug(`Router: registered [${route.name}] (${route.displayName}) with ${route.patterns.length} patterns, priority=${route.priority ?? 300}`);
    }

    /** Register multiple routes at once */
    registerAll(routes: ParserRoute[]) {
        for (const route of routes) {
            this.register(route);
        }
    }

    /** Dispatch a message event to the matching parser */
    async dispatch(ctx: any, event: any): Promise<boolean> {
        // Extract text from raw_message + any URL in message segments (JSON cards, etc.)
        let msg: string = event.raw_message || '';
        
        // Also extract URLs from message segments (handles QQ card/JSON shares)
        if (event.message && Array.isArray(event.message)) {
            for (const seg of event.message) {
                // JSON card messages often contain URLs
                if (seg.type === 'json' && seg.data?.data) {
                    try {
                        const jsonData = typeof seg.data.data === 'string' ? JSON.parse(seg.data.data) : seg.data.data;
                        const urls = this.extractUrlsFromJson(jsonData);
                        if (urls.length > 0) msg += ' ' + urls.join(' ');
                    } catch { /* ignore parse errors */ }
                }
                // Text segments
                if (seg.type === 'text' && seg.data?.text) {
                    if (!msg.includes(seg.data.text)) msg += ' ' + seg.data.text;
                }
            }
        }
        
        if (!msg.trim()) return false;

        const groupId = event.group_id;

        for (const route of this.routes) {
            // Check if parser is enabled (globally + group level)
            if (groupId && !pluginState.isParserEnabledForGroup(route.name, groupId)) {
                continue;
            }
            if (!groupId && !pluginState.isParserEnabled(route.name)) {
                continue;
            }

            // Try each pattern
            for (const pattern of route.patterns) {
                // Reset lastIndex for global regexes
                pattern.lastIndex = 0;
                const match = pattern.exec(msg);
                if (match) {
                    try {
                        pluginState.logDebug(`Router: matched [${route.name}] pattern=${pattern.source}`);
                        pluginState.incrementProcessedCount();
                        const handled = await route.handler(ctx, event, match);
                        if (handled) return true;
                    } catch (err: any) {
                        pluginState.log('error', `Router: [${route.name}] handler error:`, err?.message || err);
                        return false;
                    }
                }
            }
        }

        return false;
    }

    /** Get all registered route names */
    getRouteNames(): string[] {
        return this.routes.map(r => r.name);
    }

    /** Get route info for display */
    getRouteInfo(): Array<{ name: string; displayName: string; patterns: number; priority: number }> {
        return this.routes.map(r => ({
            name: r.name,
            displayName: r.displayName,
            patterns: r.patterns.length,
            priority: r.priority ?? 300,
        }));
    }

    /** Extract URLs from a JSON object (recursive) */
    private extractUrlsFromJson(obj: any, depth: number = 0): string[] {
        if (depth > 5) return [];
        const urls: string[] = [];
        if (typeof obj === 'string') {
            const matches = obj.match(/https?:\/\/[^\s"'<>]+/g);
            if (matches) urls.push(...matches);
        } else if (Array.isArray(obj)) {
            for (const item of obj) urls.push(...this.extractUrlsFromJson(item, depth + 1));
        } else if (obj && typeof obj === 'object') {
            for (const val of Object.values(obj)) urls.push(...this.extractUrlsFromJson(val, depth + 1));
        }
        return urls;
    }

    /** Clear all routes */
    clear() {
        this.routes = [];
    }
}