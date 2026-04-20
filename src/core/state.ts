/**
 * rconsole-plus NapCat Plugin - Global State Singleton
 * Replaces Redis and Yunzai global state management.
 */

import type { PluginConfig } from '../types/config.js';
import { DEFAULT_CONFIG } from '../types/config.js';
import fs from 'node:fs';
import path from 'node:path';

class PluginState {
    /** NapCat plugin context */
    ctx: any = null;

    /** Plugin configuration */
    config: PluginConfig = { ...DEFAULT_CONFIG };

    /** Config file path (from ctx.configPath) */
    configPath: string = '';

    /** Plugin adapter name */
    adapterName: string = '';

    /** Statistics */
    stats = {
        processedCount: 0,
        startTime: Date.now(),
    };

    /** Cooldown map: Map<groupId:command, expireTimestamp> */
    private cooldownMap: Map<string, number> = new Map();

    /** Initialize state with NapCat context */
    init(ctx: any) {
        this.ctx = ctx;
        this.adapterName = ctx.adapterName || '';
        this.configPath = ctx.configPath || '';
    }

    /** Load config from disk */
    loadConfig(): PluginConfig {
        if (!this.configPath) return { ...DEFAULT_CONFIG };
        try {
            if (fs.existsSync(this.configPath)) {
                const raw = fs.readFileSync(this.configPath, 'utf-8');
                const loaded = JSON.parse(raw);
                this.log('info', 'Config loaded from', this.configPath);
                return loaded;
            }
        } catch (err: any) {
            this.log('warn', 'Failed to load config file:', err.message);
        }
        return { ...DEFAULT_CONFIG };
    }

    /** Log helper */
    log(level: 'info' | 'warn' | 'error', ...args: any[]) {
        if (!this.ctx?.logger) {
            console[level]('[rconsole]', ...args);
            return;
        }
        switch (level) {
            case 'info': this.ctx.logger.info('[rconsole]', ...args); break;
            case 'warn': this.ctx.logger.warn('[rconsole]', ...args); break;
            case 'error': this.ctx.logger.error('[rconsole]', ...args); break;
        }
    }

    /** Debug log */
    logDebug(...args: any[]) {
        if (!this.ctx?.logger) return;
        this.ctx.logger.debug('[rconsole]', ...args);
    }

    /** Get proxy URL string or null */
    getProxyUrl(): string | null {
        if (!this.config.proxy.enabled) return null;
        return `http://${this.config.proxy.address}:${this.config.proxy.port}`;
    }

    /** Check if a parser is enabled globally */
    isParserEnabled(parserName: string): boolean {
        const ctrl = this.config.resolveController;
        return ctrl[parserName] !== false;
    }

    /** Check if a parser is enabled for a specific group */
    isParserEnabledForGroup(parserName: string, groupId: string | number): boolean {
        if (!this.isParserEnabled(parserName)) return false;
        const gid = String(groupId);
        const groupCfg = this.config.groupConfigs[gid];
        if (!groupCfg) return true; // No group config = enabled
        if (!groupCfg.enabled) return false;
        return !groupCfg.disabledParsers.includes(parserName);
    }

    /** Check cooldown for a group+command */
    checkCooldown(groupId: string | number, command: string, cooldownMs: number): boolean {
        const key = `${groupId}:${command}`;
        const now = Date.now();
        const expire = this.cooldownMap.get(key);
        if (expire && now < expire) return false; // Still in cooldown
        this.cooldownMap.set(key, now + cooldownMs);
        return true;
    }

    /** Update config (merge) */
    setConfig(newConfig: Partial<PluginConfig>) {
        this.config = this.deepMerge(this.config, newConfig) as PluginConfig;
        this.saveConfig();
    }

    /** Replace config entirely */
    replaceConfig(newConfig: PluginConfig) {
        this.config = newConfig;
        this.saveConfig();
    }

    /** Save config to disk */
    saveConfig() {
        if (!this.configPath) return;
        try {
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
            this.log('info', 'Config saved to', this.configPath);
        } catch (err: any) {
            this.log('error', 'Failed to save config:', err.message);
        }
    }

    /** Increment processed count */
    incrementProcessedCount() {
        this.stats.processedCount++;
    }

    /** Call an OneBot11 API action */
    async callApi(action: string, params?: any): Promise<any> {
        if (!this.ctx?.actions) {
            throw new Error('Plugin context not initialized');
        }
        return this.ctx.actions.call(
            action,
            params,
            this.adapterName,
            this.ctx.pluginManager?.config
        );
    }

    /** Deep merge helper */
    private deepMerge(target: any, source: any): any {
        const result = { ...target };
        for (const key of Object.keys(source)) {
            if (
                source[key] &&
                typeof source[key] === 'object' &&
                !Array.isArray(source[key]) &&
                target[key] &&
                typeof target[key] === 'object'
            ) {
                result[key] = this.deepMerge(target[key], source[key]);
            } else {
                result[key] = source[key];
            }
        }
        return result;
    }
}

/** Global plugin state singleton */
export const pluginState = new PluginState();