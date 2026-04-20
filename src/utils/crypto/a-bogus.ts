/**
 * rconsole-plus NapCat Plugin - Douyin A-Bogus Signature
 * Ported from rconsole-plugin/utils/a-bogus.cjs
 * For learning and communication use only.
 */

function rc4_encrypt(plaintext: string, key: string): string {
    const s: number[] = [];
    for (let i = 0; i < 256; i++) s[i] = i;
    let j = 0;
    for (let i = 0; i < 256; i++) {
        j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
        const temp = s[i]; s[i] = s[j]; s[j] = temp;
    }
    let ii = 0; j = 0;
    const cipher: string[] = [];
    for (let k = 0; k < plaintext.length; k++) {
        ii = (ii + 1) % 256;
        j = (j + s[ii]) % 256;
        const temp = s[ii]; s[ii] = s[j]; s[j] = temp;
        const t = (s[ii] + s[j]) % 256;
        cipher.push(String.fromCharCode(s[t] ^ plaintext.charCodeAt(k)));
    }
    return cipher.join('');
}

function le(e: number, r: number): number {
    r %= 32;
    return ((e << r) | (e >>> (32 - r))) >>> 0;
}

function de(e: number): number {
    return 0 <= e && e < 16 ? 2043430169 : 16 <= e && e < 64 ? 2055708042 : 0;
}

function pe(e: number, r: number, t: number, n: number): number {
    return 0 <= e && e < 16 ? (r ^ t ^ n) >>> 0 : 16 <= e && e < 64 ? ((r & t) | (r & n) | (t & n)) >>> 0 : 0;
}

function he(e: number, r: number, t: number, n: number): number {
    return 0 <= e && e < 16 ? (r ^ t ^ n) >>> 0 : 16 <= e && e < 64 ? ((r & t) | (~r & n)) >>> 0 : 0;
}

function se(str: string, len: number, pad: string): string {
    while (str.length < len) str = pad + str;
    return str;
}

class SM3 {
    reg: number[] = [];
    chunk: number[] = [];
    size: number = 0;

    constructor() { this.reset(); }

    reset() {
        this.reg = [1937774191, 1226093241, 388252375, 3666478592, 2842636476, 372324522, 3817729613, 2969243214];
        this.chunk = [];
        this.size = 0;
    }

    write(e: string | number[]) {
        let a: number[];
        if (typeof e === 'string') {
            const n = encodeURIComponent(e).replace(/%([0-9A-F]{2})/g, (_, r) => String.fromCharCode(parseInt('0x' + r)));
            a = new Array(n.length);
            Array.prototype.forEach.call(n, (ch: string, r: number) => { a[r] = ch.charCodeAt(0); });
        } else {
            a = e;
        }
        this.size += a.length;
        const f = 64 - this.chunk.length;
        if (a.length < f) {
            this.chunk = this.chunk.concat(a);
        } else {
            this.chunk = this.chunk.concat(a.slice(0, f));
            while (this.chunk.length >= 64) {
                this._compress(this.chunk);
                if (f < a.length) {
                    this.chunk = a.slice(f, Math.min(f + 64, a.length));
                } else {
                    this.chunk = [];
                }
            }
        }
    }

    sum(e?: string | number[], t?: string): any {
        if (e !== undefined) { this.reset(); this.write(e); }
        this._fill();
        for (let f = 0; f < this.chunk.length; f += 64) this._compress(this.chunk.slice(f, f + 64));
        let result: any;
        if (t === 'hex') {
            result = '';
            for (let f = 0; f < 8; f++) result += se(this.reg[f].toString(16), 8, '0');
        } else {
            result = new Array(32);
            for (let f = 0; f < 8; f++) {
                let c = this.reg[f];
                result[4 * f + 3] = (255 & c) >>> 0; c >>>= 8;
                result[4 * f + 2] = (255 & c) >>> 0; c >>>= 8;
                result[4 * f + 1] = (255 & c) >>> 0; c >>>= 8;
                result[4 * f] = (255 & c) >>> 0;
            }
        }
        this.reset();
        return result;
    }

    _compress(t: number[]) {
        if (t.length < 64) return;
        const f: number[] = new Array(132);
        for (let i = 0; i < 16; i++) {
            f[i] = (t[4 * i] << 24) | (t[4 * i + 1] << 16) | (t[4 * i + 2] << 8) | t[4 * i + 3];
            f[i] >>>= 0;
        }
        for (let n = 16; n < 68; n++) {
            let a = f[n - 16] ^ f[n - 9] ^ le(f[n - 3], 15);
            a = a ^ le(a, 15) ^ le(a, 23);
            f[n] = (a ^ le(f[n - 13], 7) ^ f[n - 6]) >>> 0;
        }
        for (let n = 0; n < 64; n++) f[n + 68] = (f[n] ^ f[n + 4]) >>> 0;

        const ii = this.reg.slice(0);
        for (let c = 0; c < 64; c++) {
            let o = le(ii[0], 12) + ii[4] + le(de(c), c);
            o = (4294967295 & o) >>> 0;
            const s = (le(o, 7) ^ le(ii[0], 12)) >>> 0;
            let u = pe(c, ii[0], ii[1], ii[2]);
            u = (4294967295 & (u + ii[3] + s + f[c + 68])) >>> 0;
            let b = he(c, ii[4], ii[5], ii[6]);
            b = (4294967295 & (b + ii[7] + le(o, 7) + f[c])) >>> 0;
            ii[3] = ii[2]; ii[2] = le(ii[1], 9); ii[1] = ii[0]; ii[0] = u;
            ii[7] = ii[6]; ii[6] = le(ii[5], 19); ii[5] = ii[4];
            ii[4] = (b ^ le(b, 9) ^ le(b, 17)) >>> 0;
        }
        for (let l = 0; l < 8; l++) this.reg[l] = (this.reg[l] ^ ii[l]) >>> 0;
    }

    _fill() {
        const a = 8 * this.size;
        let f = this.chunk.push(128) % 64;
        if (64 - f < 8) f -= 64;
        while (f < 56) { this.chunk.push(0); f++; }
        for (let i = 0; i < 4; i++) {
            const c = Math.floor(a / 4294967296);
            this.chunk.push((c >>> (8 * (3 - i))) & 255);
        }
        for (let i = 0; i < 4; i++) this.chunk.push((a >>> (8 * (3 - i))) & 255);
    }
}

function result_encrypt(long_str: string, num: string): string {
    const s_obj: Record<string, string> = {
        s0: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=',
        s1: 'Dkdpgh4ZKsQB80/Mfvw36XI1R25+WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=',
        s2: 'Dkdpgh4ZKsQB80/Mfvw36XI1R25-WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=',
        s3: 'ckdp1h4ZKsUB80/Mfvw36XIgR25+WQAlEi7NLboqYTOPuzKFjJnry79HbGcaStCe',
        s4: 'Dkdpgh2ZmsQB80/MfvV36XI1R45-WUAlEixNLwoqYTOPuzKFjJnry79HbGcaStCe',
    };
    const constant = { 0: 16515072, 1: 258048, 2: 4032, str: s_obj[num] };
    let result = '';
    let lound = 0;
    let long_int = get_long_int(lound, long_str);
    let temp_int: number;
    for (let i = 0; i < (long_str.length / 3) * 4; i++) {
        if (Math.floor(i / 4) !== lound) {
            lound += 1;
            long_int = get_long_int(lound, long_str);
        }
        const key = i % 4;
        switch (key) {
            case 0: temp_int = (long_int & constant[0]) >> 18; result += constant.str.charAt(temp_int); break;
            case 1: temp_int = (long_int & constant[1]) >> 12; result += constant.str.charAt(temp_int); break;
            case 2: temp_int = (long_int & constant[2]) >> 6; result += constant.str.charAt(temp_int); break;
            case 3: temp_int = long_int & 63; result += constant.str.charAt(temp_int); break;
        }
    }
    return result;
}

function get_long_int(round: number, long_str: string): number {
    round = round * 3;
    return (long_str.charCodeAt(round) << 16) | (long_str.charCodeAt(round + 1) << 8) | long_str.charCodeAt(round + 2);
}

function gener_random(random: number, option: number[]): number[] {
    return [
        (random & 255 & 170) | (option[0] & 85),
        (random & 255 & 85) | (option[0] & 170),
        ((random >> 8) & 255 & 170) | (option[1] & 85),
        ((random >> 8) & 255 & 85) | (option[1] & 170),
    ];
}

function generate_rc4_bb_str(
    url_search_params: string,
    user_agent: string,
    window_env_str: string,
    suffix: string = 'cus',
    args: number[] = [0, 1, 14]
): string {
    const sm3 = new SM3();
    const start_time = Date.now();
    const url_search_params_list = sm3.sum(sm3.sum(url_search_params + suffix));
    const cus = sm3.sum(sm3.sum(suffix));
    const ua = sm3.sum(result_encrypt(rc4_encrypt(user_agent, String.fromCharCode.apply(null, [0.00390625, 1, 14] as any)), 's3'));
    const end_time = Date.now();

    const b: Record<number, any> = {
        8: 3, 10: end_time, 16: start_time, 18: 44, 19: [1, 0, 1, 5],
        15: { aid: 6383, pageId: 6241, boe: false, ddrt: 7, paths: { include: [{}, {}, {}, {}, {}, {}, {}], exclude: [] }, track: { mode: 0, delay: 300, paths: [] }, dump: true, rpU: '' },
    };

    b[20] = (b[16] >> 24) & 255; b[21] = (b[16] >> 16) & 255;
    b[22] = (b[16] >> 8) & 255; b[23] = b[16] & 255;
    b[24] = (b[16] / 256 / 256 / 256 / 256) >> 0;
    b[25] = (b[16] / 256 / 256 / 256 / 256 / 256) >> 0;

    b[26] = (args[0] >> 24) & 255; b[27] = (args[0] >> 16) & 255;
    b[28] = (args[0] >> 8) & 255; b[29] = args[0] & 255;
    b[30] = (args[1] / 256) & 255; b[31] = args[1] % 256 & 255;
    b[32] = (args[1] >> 24) & 255; b[33] = (args[1] >> 16) & 255;
    b[34] = (args[2] >> 24) & 255; b[35] = (args[2] >> 16) & 255;
    b[36] = (args[2] >> 8) & 255; b[37] = args[2] & 255;

    b[38] = url_search_params_list[21]; b[39] = url_search_params_list[22];
    b[40] = cus[21]; b[41] = cus[22];
    b[42] = ua[23]; b[43] = ua[24];

    b[44] = (b[10] >> 24) & 255; b[45] = (b[10] >> 16) & 255;
    b[46] = (b[10] >> 8) & 255; b[47] = b[10] & 255;
    b[48] = b[8];
    b[49] = (b[10] / 256 / 256 / 256 / 256) >> 0;
    b[50] = (b[10] / 256 / 256 / 256 / 256 / 256) >> 0;

    b[51] = b[15].pageId;
    b[52] = (b[15].pageId >> 24) & 255; b[53] = (b[15].pageId >> 16) & 255;
    b[54] = (b[15].pageId >> 8) & 255; b[55] = b[15].pageId & 255;
    b[56] = b[15].aid; b[57] = b[15].aid & 255;
    b[58] = (b[15].aid >> 8) & 255; b[59] = (b[15].aid >> 16) & 255;
    b[60] = (b[15].aid >> 24) & 255;

    const window_env_list: number[] = [];
    for (let i = 0; i < window_env_str.length; i++) window_env_list.push(window_env_str.charCodeAt(i));
    b[64] = window_env_list.length;
    b[65] = b[64] & 255; b[66] = (b[64] >> 8) & 255;
    b[69] = 0; b[70] = 0; b[71] = 0;

    b[72] = b[18] ^ b[20] ^ b[26] ^ b[30] ^ b[38] ^ b[40] ^ b[42] ^ b[21] ^ b[27] ^ b[31] ^ b[35] ^ b[39] ^ b[41] ^ b[43] ^ b[22] ^ b[28] ^ b[32] ^ b[36] ^ b[23] ^ b[29] ^ b[33] ^ b[37] ^ b[44] ^ b[45] ^ b[46] ^ b[47] ^ b[48] ^ b[49] ^ b[50] ^ b[24] ^ b[25] ^ b[52] ^ b[53] ^ b[54] ^ b[55] ^ b[57] ^ b[58] ^ b[59] ^ b[60] ^ b[65] ^ b[66] ^ b[70] ^ b[71];

    let bb: number[] = [
        b[18], b[20], b[52], b[26], b[30], b[34], b[58], b[38], b[40], b[53],
        b[42], b[21], b[27], b[54], b[55], b[31], b[35], b[57], b[39], b[41],
        b[43], b[22], b[28], b[32], b[60], b[36], b[23], b[29], b[33], b[37],
        b[44], b[45], b[59], b[46], b[47], b[48], b[49], b[50], b[24], b[25],
        b[65], b[66], b[70], b[71],
    ];
    bb = bb.concat(window_env_list).concat(b[72]);
    return rc4_encrypt(String.fromCharCode.apply(null, bb as any), String.fromCharCode.apply(null, [121] as any));
}

function generate_random_str(): string {
    let list: number[] = [];
    list = list.concat(gener_random(Math.random() * 10000, [3, 45]));
    list = list.concat(gener_random(Math.random() * 10000, [1, 0]));
    list = list.concat(gener_random(Math.random() * 10000, [1, 5]));
    return String.fromCharCode.apply(null, list as any);
}

/**
 * Generate a-bogus parameter for Douyin API
 * @param url_search_params - URL query string to sign
 * @param user_agent - User-Agent string
 * @returns a_bogus parameter value
 */
export function generate_a_bogus(url_search_params: string, user_agent: string): string {
    const result_str = generate_random_str() + generate_rc4_bb_str(
        url_search_params, user_agent,
        '1536|747|1536|834|0|30|0|0|1536|834|1536|864|1525|747|24|24|Win32'
    );
    return result_encrypt(result_str, 's4') + '=';
}