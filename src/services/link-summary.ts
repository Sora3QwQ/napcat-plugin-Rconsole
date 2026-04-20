/**
 * rconsole-plus NapCat Plugin - AI Link Summary Service
 * OpenAI-compatible API for summarizing shared links.
 * Supports any OpenAI-compatible provider (Kimi, DeepSeek, OpenAI, etc.)
 *
 * Original defaulted to Kimi (api.moonshot.cn) but the API format is
 * standard OpenAI v1/chat/completions, so any compatible provider works.
 */

import axios, { AxiosInstance } from 'axios';
import { pluginState } from '../core/state.js';

const DEFAULT_SUMMARY_PROMPT = `你是一个专业的内容总结助手。请用中文对以下内容进行简洁但全面的总结，包括：
1. 主要内容概述（2-3句话）
2. 关键信息要点（列表形式）
请保持客观准确，不要添加个人观点。`;

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface ChatResponse {
    model: string;
    content: string;
}

/**
 * OpenAI-compatible chat client.
 * Works with any provider that implements /v1/chat/completions:
 * - OpenAI (api.openai.com)
 * - Kimi/Moonshot (api.moonshot.cn) 
 * - DeepSeek (api.deepseek.com)
 * - Any other compatible API
 */
export class AIChatClient {
    private client: AxiosInstance;
    private model: string;

    constructor(baseURL: string, apiKey: string, model: string) {
        this.model = model;
        this.client = axios.create({
            baseURL: baseURL.replace(/\/$/, ''),
            timeout: 100000,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
        });
    }

    /**
     * Send a chat completion request
     */
    async chat(messages: ChatMessage[]): Promise<ChatResponse> {
        const resp = await this.client.post('/v1/chat/completions', {
            model: this.model,
            messages,
        });

        const choice = resp.data.choices?.[0];
        return {
            model: resp.data.model || this.model,
            content: choice?.message?.content || '',
        };
    }

    /**
     * Simple one-shot completion with system prompt
     */
    async complete(userContent: string, systemPrompt?: string): Promise<string> {
        const messages: ChatMessage[] = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: userContent });

        const result = await this.chat(messages);
        return result.content;
    }
}

/**
 * Crawl a URL and extract text content for summarization
 */
async function crawlUrl(url: string): Promise<string> {
    try {
        const resp = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml',
            },
            timeout: 15000,
            maxRedirects: 5,
        });

        const html = typeof resp.data === 'string' ? resp.data : '';

        // Extract text from HTML
        let text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Limit to ~4000 chars to stay within token limits
        if (text.length > 4000) {
            text = text.substring(0, 4000) + '...';
        }

        return text;
    } catch (err: any) {
        pluginState.log('warn', '[LinkSummary] Crawl failed:', err.message);
        return '';
    }
}

/**
 * URL patterns that are summarizable
 */
const SUMMARY_PATTERNS: Array<{ name: string; reg: RegExp }> = [
    { name: '微信公众号', reg: /mp\.weixin\.qq\.com\/[A-Za-z\d._?%&+\-=\/#]*/ },
    { name: '知乎', reg: /zhuanlan\.zhihu\.com\/p\/\d+/ },
    { name: '知乎', reg: /www\.zhihu\.com\/question\/\d+/ },
    { name: 'CSDN', reg: /blog\.csdn\.net\/[^\s]+/ },
    { name: '掘金', reg: /juejin\.cn\/post\/\d+/ },
    { name: '简书', reg: /www\.jianshu\.com\/p\/[A-Za-z\d]+/ },
    { name: '今日头条', reg: /toutiao\.com\/article\/[A-Za-z\d]+/ },
    { name: '百度百科', reg: /baike\.baidu\.com\/item\/[^\s]+/ },
    { name: '通用链接', reg: /https?:\/\/[^\s]+/ },
];

/**
 * Check if a URL is summarizable and identify the platform
 */
export function identifySummaryLink(url: string): { name: string; summaryLink: string } | null {
    for (const pattern of SUMMARY_PATTERNS) {
        const match = pattern.reg.exec(url);
        if (match) {
            return { name: pattern.name, summaryLink: match[0] };
        }
    }
    return null;
}

/**
 * Summarize a URL using AI
 */
export async function summarizeLink(url: string): Promise<string> {
    const aiConfig = pluginState.config.ai;
    if (!aiConfig.baseURL || !aiConfig.apiKey) {
        return '未配置AI服务，无法进行链接总结。请在配置中设置AI接口地址和API Key。';
    }

    // Crawl content
    const content = await crawlUrl(url);
    if (!content) {
        return '无法获取链接内容';
    }

    // Create AI client
    const client = new AIChatClient(aiConfig.baseURL, aiConfig.apiKey, aiConfig.model || 'gpt-4o-mini');

    try {
        const summary = await client.complete(
            `请总结以下网页内容：\n\n${content}`,
            DEFAULT_SUMMARY_PROMPT
        );
        return summary || '总结生成失败';
    } catch (err: any) {
        pluginState.log('error', '[LinkSummary] AI summarize failed:', err.message);
        return 'AI总结失败：' + err.message;
    }
}