/**
 * rconsole-plus NapCat Plugin - Bilibili WBI Signature
 * Generates signed URL parameters for Bilibili API calls.
 * Migrated from rconsole-plugin utils/biliWbi.js
 */

import crypto from 'node:crypto';
import { BILI_NAV } from '../api-constants.js';

const MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52,
];

function getMixinKey(orig: string): string {
    return MIXIN_KEY_ENC_TAB.map(n => orig[n]).join('').slice(0, 32);
}

function md5(str: string): string {
    return crypto.createHash('md5').update(str).digest('hex');
}

async function getWbiKeys(sessData: string): Promise<{ imgKey: string; subKey: string }> {
    const cookieHeader = sessData.includes('SESSDATA=') ? sessData : `SESSDATA=${sessData}`;
    const resp = await fetch(BILI_NAV, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Cookie': cookieHeader,
        },
    });
    const json = await resp.json() as any;
    const { img_url, sub_url } = json.data.wbi_img;

    const imgKey = img_url.split('/').pop()!.split('.')[0];
    const subKey = sub_url.split('/').pop()!.split('.')[0];
    return { imgKey, subKey };
}

/**
 * Generate WBI signed query string
 * @param params - API parameters to sign (e.g. { bvid, cid, up_mid })
 * @param sessData - SESSDATA cookie value
 * @returns Signed query string
 */
export async function getWbi(
    params: Record<string, any>,
    sessData: string
): Promise<string> {
    const { imgKey, subKey } = await getWbiKeys(sessData);
    const mixinKey = getMixinKey(imgKey + subKey);
    const wts = Math.round(Date.now() / 1000);

    const allParams: Record<string, any> = { ...params, wts };

    // Sort by key
    const sortedKeys = Object.keys(allParams).sort();
    const query = sortedKeys
        .map(k => {
            // Filter special chars
            const value = String(allParams[k]).replace(/[!'()*]/g, '');
            return `${encodeURIComponent(k)}=${encodeURIComponent(value)}`;
        })
        .join('&');

    const wRid = md5(query + mixinKey);
    return `${query}&w_rid=${wRid}`;
}