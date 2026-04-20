/**
 * Xiaoheihe API signature generation
 * Ported from astrbot_plugin_parser/core/parsers/xiaoheihe.py (_sign_path)
 */

import crypto from 'node:crypto';

const CHAR_TABLE = 'AB45STUVWZEFGJ6CH01D237IXYPQRKLMN89';

function md5(data: string): string {
    return crypto.createHash('md5').update(data).digest('hex');
}

/** AES-like xtime */
function xtime(v: number): number {
    return (v & 128) ? ((v << 1) ^ 27) & 0xFF : v << 1;
}
function mul3(v: number): number { return xtime(v) ^ v; }
function mul6(v: number): number { return mul3(xtime(v)); }
function mul12(v: number): number { return mul6(mul3(xtime(v))); }
function mul14(v: number): number { return mul12(v) ^ mul6(v) ^ mul3(v); }

function mixColumns(col: number[]): number[] {
    const values = [...col];
    while (values.length < 4) values.push(0);
    return [
        mul14(values[0]) ^ mul12(values[1]) ^ mul6(values[2]) ^ mul3(values[3]),
        mul3(values[0]) ^ mul14(values[1]) ^ mul12(values[2]) ^ mul6(values[3]),
        mul6(values[0]) ^ mul3(values[1]) ^ mul14(values[2]) ^ mul12(values[3]),
        mul12(values[0]) ^ mul6(values[1]) ^ mul3(values[2]) ^ mul14(values[3]),
    ];
}

/** Map chars through CHAR_TABLE with cut (negative = slice from end) */
function av(text: string, cut: number): string {
    const table = CHAR_TABLE.slice(0, cut); // cut is negative, so slices off end
    return Array.from(text).map(c => table[c.charCodeAt(0) % table.length]).join('');
}

/** Map chars through full CHAR_TABLE */
function sv(text: string): string {
    return Array.from(text).map(c => CHAR_TABLE[c.charCodeAt(0) % CHAR_TABLE.length]).join('');
}

/** Interleave multiple strings char by char */
function interleave(parts: string[]): string {
    const result: string[] = [];
    const maxLen = Math.max(...parts.map(p => p.length));
    for (let i = 0; i < maxLen; i++) {
        for (const part of parts) {
            if (i < part.length) result.push(part[i]);
        }
    }
    return result.join('');
}

/**
 * Generate hkey signature for a given API path
 * Matches astrbot_plugin_parser's _ov() method
 */
function signPath(apiPath: string): { hkey: string; _time: number; nonce: string } {
    const now = Math.floor(Date.now() / 1000);
    const nonce = md5(now + Math.random().toString()).toUpperCase();

    // Normalize path
    const normalizedPath = '/' + apiPath.split('/').filter(p => p).join('/') + '/';

    // Interleave av(timestamp, -2), sv(path), sv(nonce) then take first 20 chars
    const interleavedStr = interleave([
        av(String(now + 1), -2),  // timestamp + 1, matching astrbot
        sv(normalizedPath),
        sv(nonce),
    ]).slice(0, 20);

    const md5Hex = md5(interleavedStr);

    // prefix: av(first 5 chars of md5, -4)
    const prefix = av(md5Hex.slice(0, 5), -4);

    // suffix: mixColumns on last 6 chars' charCodes, sum % 100, zero-padded
    const lastSixCodes = md5Hex.slice(-6).split('').map(c => c.charCodeAt(0));
    const mixed = mixColumns(lastSixCodes);
    const suffix = String(mixed.reduce((a, b) => a + b, 0) % 100).padStart(2, '0');

    return {
        hkey: prefix + suffix,
        _time: now,
        nonce,
    };
}

/**
 * Generate complete API params for Xiaoheihe BBS requests
 * Matches astrbot_plugin_parser's _fetch_link_tree params
 */
export function getXhhBbsParams(linkId: string, deviceId?: string): Record<string, any> {
    const sig = signPath('/bbs/app/link/tree');
    return {
        os_type: 'web',
        app: 'heybox',
        client_type: 'web',
        version: '999.0.4',
        web_version: '2.5',
        x_client_type: 'web',
        x_app: 'heybox_website',
        heybox_id: '',
        x_os_type: 'Windows',
        device_info: 'Chrome',
        device_id: deviceId || '',
        link_id: linkId,
        owner_only: '1',
        ...sig,
    };
}

/**
 * Generate params for game detail API
 */
export function getXhhGameParams(steamAppId: string): Record<string, any> {
    const sig = signPath('/game/get_game_detail');
    return {
        os_type: 'web',
        app: 'heybox',
        client_type: 'web',
        version: '999.0.4',
        x_client_type: 'web',
        x_app: 'heybox_website',
        x_os_type: 'Windows',
        device_info: 'Chrome',
        steam_appid: steamAppId,
        ...sig,
    };
}

// Keep backward compat
export function getXhhApiParams(type: 'bbs' | 'pc' | 'console' | 'mobile', id: string): Record<string, any> {
    if (type === 'bbs') return getXhhBbsParams(id);
    return getXhhGameParams(id);
}

