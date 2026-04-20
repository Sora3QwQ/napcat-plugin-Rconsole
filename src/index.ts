/**
 * rconsole-plus NapCat Plugin
 * Multi-platform content parser: Bilibili, Douyin, Weibo, XHS, YouTube, and more.
 *
 * Lifecycle:
 *   plugin_init       -> Initialize state, config, register parsers
 *   plugin_onmessage  -> Route messages to matching parsers
 *   plugin_cleanup    -> Clean up resources
 *   plugin_config_ui  -> WebUI configuration schema
 */

import type { PluginModule } from 'napcat-types/napcat-onebot/network/plugin/types';
// OB11Message type is inferred from PluginModule['plugin_onmessage'] parameter
import { pluginState } from './core/state.js';
import { MessageRouter } from './core/router.js';
import { configSchema } from './core/config-schema.js';
import { DEFAULT_CONFIG } from './types/config.js';
import type { PluginConfig } from './types/config.js';

// Global router instance
const router = new MessageRouter();

/**
 * Register all parsers with the router.
 * Each parser is lazily imported to keep startup fast.
 */
async function registerParsers() {
    // Phase 2: Core parsers
    const { BilibiliParser } = await import('./parsers/bilibili.js');
    const { DouyinParser } = await import('./parsers/douyin.js');
    const { WeiboParser } = await import('./parsers/weibo.js');

    // Phase 3: All platform parsers
    const { XhsParser } = await import('./parsers/xhs.js');
    const { TwitterParser } = await import('./parsers/twitter.js');
    const { YoutubeParser } = await import('./parsers/youtube.js');
    const { TiktokParser } = await import('./parsers/tiktok.js');
    const { AcfunParser } = await import('./parsers/acfun.js');
    const { GeneralParser } = await import('./parsers/general.js');
    const { MiyousheParser } = await import('./parsers/miyoushe.js');
    const { XiaoheiheParser } = await import('./parsers/xiaoheihe.js');
    const { NeteaseParser } = await import('./parsers/netease.js');
    const { BodianParser } = await import('./parsers/bodian.js');
    const { QQMusicParser, QishuiMusicParser } = await import('./parsers/qq-music.js');
    const { TelegramParser } = await import('./parsers/telegram.js');
    const { TiebaParser } = await import('./parsers/tieba.js');

    // Phase 4: Command handlers
    const { TranslateCommand, SongRequestCommand, LinkSummaryCommand, HelpCommand, ResolveControllerCommand } = await import('./parsers/commands.js');

    // Register all parsers
    router.register(new BilibiliParser().toRoute());
    router.register(new DouyinParser().toRoute());
    router.register(new WeiboParser().toRoute());
    router.register(new XhsParser().toRoute());
    router.register(new TwitterParser().toRoute());
    router.register(new YoutubeParser().toRoute());
    router.register(new TiktokParser().toRoute());
    router.register(new AcfunParser().toRoute());
    router.register(new GeneralParser().toRoute());
    router.register(new MiyousheParser().toRoute());
    router.register(new XiaoheiheParser().toRoute());
    router.register(new NeteaseParser().toRoute());
    router.register(new BodianParser().toRoute());
    router.register(new QQMusicParser().toRoute());
    router.register(new QishuiMusicParser().toRoute());
    router.register(new TelegramParser().toRoute());
    router.register(new TiebaParser().toRoute());

    // Register command handlers
    router.register(new TranslateCommand().toRoute());
    router.register(new SongRequestCommand().toRoute());
    router.register(new LinkSummaryCommand().toRoute());
    router.register(new HelpCommand().toRoute());
    router.register(new ResolveControllerCommand().toRoute());

    pluginState.log('info', `Registered ${router.getRouteNames().length} parsers: [${router.getRouteNames().join(', ')}]`);
}

/**
 * Sanitize and validate config at runtime.
 * Merges loaded config with defaults to ensure all fields exist.
 */
function sanitizeConfig(loaded: any): PluginConfig {
    if (!loaded || typeof loaded !== 'object') {
        return { ...DEFAULT_CONFIG };
    }
    // Expand flat dot-notation keys to nested objects
    // WebUI saves as {'douyin.cookie': 'xxx'} but we need {douyin: {cookie: 'xxx'}}
    const expanded = expandDotKeys(loaded);
    // Deep merge expanded config over defaults
    return deepMerge(DEFAULT_CONFIG, expanded) as PluginConfig;
}

/** Convert flat dot-notation keys to nested objects */
function expandDotKeys(obj: any): any {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const result: any = {};
    try {
        for (const [key, value] of Object.entries(obj)) {
            if (key.includes('.')) {
                const parts = key.split('.');
                let current = result;
                for (let i = 0; i < parts.length - 1; i++) {
                    if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
                        current[parts[i]] = {};
                    }
                    current = current[parts[i]];
                }
                current[parts[parts.length - 1]] = value;
            } else {
                result[key] = value;
            }
        }
    } catch (err: any) {
        pluginState.log('error', 'expandDotKeys error:', err.message);
        return obj;
    }
    return result;
}

function deepMerge(target: any, source: any): any {
    const result = { ...target };
    for (const key of Object.keys(source)) {
        if (
            source[key] &&
            typeof source[key] === 'object' &&
            !Array.isArray(source[key]) &&
            target[key] &&
            typeof target[key] === 'object' &&
            !Array.isArray(target[key])
        ) {
            result[key] = deepMerge(target[key], source[key]);
        } else if (source[key] !== undefined) {
            result[key] = source[key];
        }
    }
    return result;
}

// ==================== Lifecycle Functions ====================

/** 1. Plugin initialization (required) */
export const plugin_init: PluginModule['plugin_init'] = async (ctx) => {
    // Initialize global state
    pluginState.init(ctx);

    pluginState.log('info', 'rconsole-plus plugin initializing...');

    // Load saved config from disk
    const loadedConfig = pluginState.loadConfig();
    pluginState.config = sanitizeConfig(loadedConfig);
    pluginState.log('info', 'Config loaded successfully');

    // Register all parsers
    await registerParsers();

    // Register WebUI API routes (optional)
    if (ctx.router) {
        ctx.router.getNoAuth('/info', (_req: any, res: any) => {
            res.json({
                success: true,
                data: {
                    name: 'rconsole-plus',
                    version: '1.0.0',
                    parsers: router.getRouteInfo(),
                    stats: pluginState.stats,
                },
            });
        });

        ctx.router.getNoAuth('/status', (_req: any, res: any) => {
            res.json({
                success: true,
                data: {
                    uptime: Math.floor((Date.now() - pluginState.stats.startTime) / 1000),
                    processedCount: pluginState.stats.processedCount,
                    registeredParsers: router.getRouteNames(),
                    config: pluginState.config,
                },
            });
        });
    }

    pluginState.log('info', 'rconsole-plus plugin initialized successfully!');
};

/** 2. Message handler (optional) */
export const plugin_onmessage: PluginModule['plugin_onmessage'] = async (ctx, event) => {
    // plugin_onmessage only receives OB11Message events, no need to filter by post_type
    if (!event.raw_message?.trim()) return;

    // Dispatch to router
    try {
        await router.dispatch(ctx, event);
    } catch (err: any) {
        pluginState.log('error', 'Message dispatch error:', err?.message || err);
    }
};

/** 3. Event handler (optional) */
export const plugin_onevent: PluginModule['plugin_onevent'] = async (_ctx, _event) => {
    // Currently no special event handling needed
};

/** 4. Plugin cleanup (optional) */
export const plugin_cleanup: PluginModule['plugin_cleanup'] = (ctx) => {
    pluginState.log('info', 'rconsole-plus plugin cleaning up...');
    router.clear();
    pluginState.log('info', 'rconsole-plus plugin cleaned up successfully.');
};

/** 5. WebUI config schema */
export const plugin_config_ui = configSchema;

/** 6. Get config */
export const plugin_get_config: PluginModule['plugin_get_config'] = async (_ctx) => {
    return pluginState.config;
};

/** 7. Set config */
export const plugin_set_config: PluginModule['plugin_set_config'] = async (ctx, config) => {
    pluginState.config = sanitizeConfig(config);
    pluginState.saveConfig();
    pluginState.log('info', 'Config updated and saved via WebUI');
};

/** 8. Config change callback — hot reload on WebUI change */
export const plugin_on_config_change: PluginModule['plugin_on_config_change'] = async (_ctx, _ui, key, value, currentConfig) => {
    // Merge changed field into current config and save immediately
    pluginState.config = sanitizeConfig({ ...currentConfig, [key]: value });
    pluginState.saveConfig();
    pluginState.log('info', `Config hot-reloaded: ${key} updated`);
};