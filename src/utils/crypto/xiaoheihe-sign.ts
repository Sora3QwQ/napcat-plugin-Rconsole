/**
 * Xiaoheihe API signature generation
 * Ported from rconsole-plus/utils/xiaoheihe.js
 */

import crypto from 'node:crypto';

const SALT = 'AB45STUVWZEFGJ6CH01D237IXYPQRKLMN89';

function md5(data: string): string {
    return crypto.createHash('md5').update(data).digest('hex');
}

function DA(e: number) { return 128 & e ? 255 & (e << 1 ^ 27) : e << 1; }
function BA(e: number) { return DA(e) ^ e; }
function NA(e: number) { return BA(DA(e)); }
function FA(e: number) { return NA(BA(DA(e))); }
function UA(e: number) { return FA(e) ^ NA(e) ^ BA(e); }

function zA(e: string, t: string, n: number): string {
    let r = '', i = t.slice(0, n);
    for (let o = 0; o < e.length; o++) {
        r += i[e.charCodeAt(o) % i.length];
    }
    return r;
}

function WA(e: string, t: string): string {
    let n = '';
    for (let r = 0; r < e.length; r++) {
        n += t[e.charCodeAt(r) % t.length];
    }
    return n;
}

function HA(path: string, timestamp: number, nonce: string): string {
    path = `/${path.split('/').filter(e => e).join('/')}/`;
    const interleaved = (function (arr: string[]) {
        let t = '';
        const maxLen = Math.max(...arr.map(e => e.length));
        for (let n = 0; n < maxLen; n++) arr.forEach(e => { if (n < e.length) t += e[n]; });
        return t;
    })([zA(String(timestamp), SALT, -2), WA(path, SALT), WA(nonce, SALT)]).slice(0, 20);

    const o = md5(interleaved);
    let a = '' + (function (e: number[]) {
        let t = [0, 0, 0, 0];
        t[0] = UA(e[0]) ^ FA(e[1]) ^ NA(e[2]) ^ BA(e[3]);
        t[1] = BA(e[0]) ^ UA(e[1]) ^ FA(e[2]) ^ NA(e[3]);
        t[2] = NA(e[0]) ^ BA(e[1]) ^ UA(e[2]) ^ FA(e[3]);
        t[3] = FA(e[0]) ^ NA(e[1]) ^ BA(e[2]) ^ UA(e[3]);
        return t;
    })(o.slice(-6).split('').map(e => e.charCodeAt(0))).reduce((e, t) => e + t, 0) % 100;

    a = a.length < 2 ? `0${a}` : a;
    return `${zA(o.substring(0, 5), SALT, -4)}${a}`;
}

/**
 * Generate complete API params for Xiaoheihe requests
 */
export function getXhhApiParams(type: 'bbs' | 'pc' | 'console' | 'mobile', id: string): Record<string, any> {
    const pathMap: Record<string, string> = {
        bbs: 'bbs/app/link/tree',
        pc: 'game/get_game_detail',
        console: 'game/console/get_game_detail',
        mobile: 'game/mobile/get_game_detail',
    };
    const path = pathMap[type] || pathMap.bbs;
    const timestamp = ~~(Date.now() / 1e3);
    const nonce = md5(timestamp + Math.random().toString()).toUpperCase();
    const hkey = HA(path, timestamp + 1, nonce);

    const authParams = { version: '999.0.4', hkey, _time: timestamp, nonce };
    const baseParams = { os_type: 'web', ...authParams };

    switch (type) {
        case 'bbs':
            return { ...baseParams, link_id: id, limit: 20, web_version: '2.5', x_client_type: 'web', x_app: 'heybox_website', x_os_type: 'Android' };
        case 'pc':
            return { ...baseParams, steam_appid: id };
        case 'console':
        case 'mobile':
            return { ...baseParams, appid: id };
        default:
            return baseParams;
    }
}
