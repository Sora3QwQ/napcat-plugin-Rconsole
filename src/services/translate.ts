/**
 * rconsole-plus NapCat Plugin - Translation Service
 * Supports DeepL free API for text translation.
 * Migrated from rconsole-plugin utils/trans-strategy.js
 */

import axios from 'axios';
import { pluginState } from '../core/state.js';

const DEFAULT_DEEPL_URLS = [
    'https://api-free.deepl.com/v2/translate',
];

/** DeepL supported language codes */
export const DEEPL_LANGUAGES: Record<string, string> = {
    'zh': 'ZH', 'en': 'EN', 'ja': 'JA', 'ko': 'KO',
    'fr': 'FR', 'de': 'DE', 'es': 'ES', 'pt': 'PT',
    'it': 'IT', 'nl': 'NL', 'pl': 'PL', 'ru': 'RU',
    '中文': 'ZH', '英语': 'EN', '日语': 'JA', '韩语': 'KO',
    '法语': 'FR', '德语': 'DE', '西班牙语': 'ES', '俄语': 'RU',
};

/**
 * Translate text using DeepL API
 * @param text - Text to translate
 * @param targetLang - Target language code (e.g. 'EN', 'ZH', 'JA')
 * @param sourceLang - Source language code (optional, auto-detect if omitted)
 * @returns Translated text
 */
export async function translateDeepL(
    text: string,
    targetLang: string = 'ZH',
    sourceLang?: string
): Promise<string> {
    const deeplUrls = pluginState.config.translate.deeplApiUrls;
    const urls = deeplUrls.length > 0 ? deeplUrls : DEFAULT_DEEPL_URLS;

    // Normalize language code
    targetLang = DEEPL_LANGUAGES[targetLang.toLowerCase()] || targetLang.toUpperCase();
    if (sourceLang) {
        sourceLang = DEEPL_LANGUAGES[sourceLang.toLowerCase()] || sourceLang.toUpperCase();
    }

    // Try each DeepL API URL
    for (const apiUrl of urls) {
        try {
            const params: any = {
                text: [text],
                target_lang: targetLang,
            };
            if (sourceLang) {
                params.source_lang = sourceLang;
            }

            const resp = await axios.post(apiUrl, params, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 15000,
            });

            const translations = resp.data?.translations;
            if (translations?.[0]?.text) {
                return translations[0].text;
            }
        } catch (err: any) {
            pluginState.logDebug(`[Translate] DeepL API failed (${apiUrl}): ${err.message}`);
            continue;
        }
    }

    throw new Error('所有翻译接口均不可用');
}

/**
 * Use AI for translation (fallback if DeepL fails)
 */
export async function translateAI(
    text: string,
    targetLang: string = '中文'
): Promise<string> {
    const aiConfig = pluginState.config.ai;
    if (!aiConfig.baseURL || !aiConfig.apiKey) {
        throw new Error('未配置AI服务');
    }

    const { AIChatClient } = await import('./link-summary.js');
    const client = new AIChatClient(aiConfig.baseURL, aiConfig.apiKey, aiConfig.model || 'gpt-4o-mini');

    const result = await client.complete(
        text,
        `你是一个专业的翻译助手。请将用户输入的文本翻译为${targetLang}。只输出翻译结果，不要添加解释或其他内容。`
    );

    return result || '翻译失败';
}

/**
 * Auto-translate: try DeepL first, fallback to AI
 */
export async function translate(
    text: string,
    targetLang: string = 'ZH'
): Promise<{ text: string; engine: string }> {
    // Try DeepL first
    try {
        const result = await translateDeepL(text, targetLang);
        return { text: result, engine: 'DeepL' };
    } catch { /* fallback */ }

    // Fallback to AI
    try {
        const langName = Object.entries(DEEPL_LANGUAGES).find(([_, v]) => v === targetLang)?.[0] || targetLang;
        const result = await translateAI(text, langName);
        return { text: result, engine: 'AI' };
    } catch (err: any) {
        return { text: '翻译失败：' + err.message, engine: 'none' };
    }
}