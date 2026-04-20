/**
 * rconsole-plus NapCat Plugin - Configuration Types
 */

export interface GlobalConfig {
    identifyPrefix: string;
    defaultCachePath: string;
    videoSizeLimit: number;
    imageBatchThreshold: number;
    globalImageLimit: number;
    msgElementLimit: number;
}

export interface ProxyConfig {
    enabled: boolean;
    address: string;
    port: number;
}

export interface BilibiliConfig {
    sessData: string;
    resolution: number;
    smartResolution: boolean;
    fileSizeLimit: number;
    videoCodec: 'auto' | 'av1' | 'hevc' | 'avc';
    cdnMode: 0 | 1 | 2;
    displayCover: boolean;
    displayInfo: boolean;
    displayIntro: boolean;
    introLenLimit: number;
    displayOnline: boolean;
    displaySummary: boolean;
    durationLimit: number;
    bangumiDirect: boolean;
    bangumiDuration: number;
    bangumiResolution: number;
    useBBDown: boolean;
    bbdownCDN: string;
    minResolution: number;
}

export interface DouyinConfig {
    cookie: string;
    durationLimit: number;
    compression: boolean;
    displayCover: boolean;
    enableComments: boolean;
    enableMusic: boolean;
    musicSendType: 'voice' | 'card';
}

export interface WeiboConfig {
    cookie: string;
    enableComments: boolean;
}

export interface XhsConfig {
    cookie: string;
}

export interface YoutubeConfig {
    cookiePath: string;
    durationLimit: number;
    clipTime: number;
    graphicsOptions: string;
}

export interface NeteaseConfig {
    cookie: string;
    cloudCookie: string;
    useLocalAPI: boolean;
    apiServer: string;
    audioQuality: string;
    sendAsVoice: boolean;
}

export interface XiaoheiheConfig {
    cookie: string;
}

export interface AIConfig {
    baseURL: string;
    apiKey: string;
    model: string;
}

export interface TranslateConfig {
    deeplApiUrls: string[];
}

export interface GroupConfig {
    enabled: boolean;
    disabledParsers: string[];
}

export interface ResolveController {
    [parserName: string]: boolean;
}

export interface PluginConfig {
    global: GlobalConfig;
    proxy: ProxyConfig;
    bilibili: BilibiliConfig;
    douyin: DouyinConfig;
    weibo: WeiboConfig;
    xhs: XhsConfig;
    youtube: YoutubeConfig;
    netease: NeteaseConfig;
    xiaoheihe: XiaoheiheConfig;
    ai: AIConfig;
    translate: TranslateConfig;
    resolveController: ResolveController;
    groupConfigs: { [groupId: string]: GroupConfig };
}

export const DEFAULT_CONFIG: PluginConfig = {
    global: {
        identifyPrefix: 'R插件',
        defaultCachePath: './rconsole-cache',
        videoSizeLimit: 100,
        imageBatchThreshold: 50,
        globalImageLimit: 10,
        msgElementLimit: 50,
    },
    proxy: {
        enabled: false,
        address: '127.0.0.1',
        port: 7890,
    },
    bilibili: {
        sessData: '',
        resolution: 8,
        smartResolution: true,
        fileSizeLimit: 100,
        videoCodec: 'auto',
        cdnMode: 0,
        displayCover: true,
        displayInfo: true,
        displayIntro: true,
        introLenLimit: 100,
        displayOnline: false,
        displaySummary: true,
        durationLimit: 480,
        bangumiDirect: false,
        bangumiDuration: 1800,
        bangumiResolution: 8,
        useBBDown: false,
        bbdownCDN: '',
        minResolution: 10,
    },
    douyin: {
        cookie: '',
        durationLimit: 300,
        compression: false,
        displayCover: true,
        enableComments: false,
        enableMusic: true,
        musicSendType: 'voice',
    },
    weibo: {
        cookie: '',
        enableComments: true,
    },
    xhs: {
        cookie: '',
    },
    youtube: {
        cookiePath: '',
        durationLimit: 480,
        clipTime: 0,
        graphicsOptions: '',
    },
    netease: {
        cookie: '',
        cloudCookie: '',
        useLocalAPI: false,
        apiServer: '',
        audioQuality: 'standard',
        sendAsVoice: false,
    },
    xiaoheihe: {
        cookie: '',
    },
    ai: {
        baseURL: '',
        apiKey: '',
        model: '',
    },
    translate: {
        deeplApiUrls: [],
    },
    resolveController: {
        bilibili: true,
        douyin: true,
        weibo: true,
        xhs: true,
        twitter: true,
        youtube: true,
        tiktok: true,
        acfun: true,
        general: true,
        miyoushe: true,
        xiaoheihe: true,
        netease: true,
        bodian: true,
        qqMusic: true,
        qishuiMusic: true,
        freyr: true,
        telegram: true,
        tieba: true,
    },
    groupConfigs: {},
};