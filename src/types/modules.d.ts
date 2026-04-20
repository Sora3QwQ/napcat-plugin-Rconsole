/** Type declarations for optional modules */

declare module 'https-proxy-agent' {
    export class HttpsProxyAgent {
        constructor(proxy: string);
    }
}

declare module 'qrcode' {
    export function toFile(path: string, text: string): Promise<void>;
}