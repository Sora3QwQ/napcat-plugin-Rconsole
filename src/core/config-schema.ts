/**
 * rconsole-plus NapCat Plugin - WebUI Configuration Schema
 * Defines the config panel that appears in NapCat's WebUI.
 */

export const configSchema = [
    // ===== Global Settings =====
    {
        key: 'global.identifyPrefix',
        label: '识别前缀',
        type: 'string',
        default: 'R插件',
        description: '解析结果的前缀文字，如 "R插件识别："',
    },
    {
        key: 'global.defaultCachePath',
        label: '缓存路径',
        type: 'string',
        default: './rconsole-cache',
        description: '视频/图片缓存目录',
    },
    {
        key: 'global.videoSizeLimit',
        label: '视频大小限制(MB)',
        type: 'number',
        default: 100,
        description: '超过此大小的视频不发送',
    },
    {
        key: 'global.imageBatchThreshold',
        label: '图片分批阈值',
        type: 'number',
        default: 50,
        description: '合并转发消息中每批图片数量',
    },
    {
        key: 'global.globalImageLimit',
        label: '直发图片上限',
        type: 'number',
        default: 10,
        description: '超过此数量改为合并转发',
    },

    // ===== Proxy Settings =====
    {
        key: 'proxy.enabled',
        label: '启用代理',
        type: 'boolean',
        default: false,
        description: '用于YouTube/TikTok/Twitter等海外平台',
    },
    {
        key: 'proxy.address',
        label: '代理地址',
        type: 'string',
        default: '127.0.0.1',
    },
    {
        key: 'proxy.port',
        label: '代理端口',
        type: 'number',
        default: 7890,
    },

    // ===== Bilibili Settings =====
    {
        key: 'bilibili.sessData',
        label: 'B站SESSDATA',
        type: 'string',
        default: '',
        description: '登录B站后获取的SESSDATA Cookie',
    },
    {
        key: 'bilibili.smartResolution',
        label: '智能分辨率',
        type: 'boolean',
        default: true,
        description: '根据文件大小限制自动选择最高可用画质',
    },
    {
        key: 'bilibili.fileSizeLimit',
        label: '文件大小限制(MB)',
        type: 'number',
        default: 100,
    },
    {
        key: 'bilibili.videoCodec',
        label: '视频编码',
        type: 'string',
        default: 'auto',
        description: '可选: auto, av1, hevc, avc',
    },
    {
        key: 'bilibili.displayCover',
        label: '显示封面',
        type: 'boolean',
        default: true,
    },
    {
        key: 'bilibili.displayInfo',
        label: '显示视频信息',
        type: 'boolean',
        default: true,
    },
    {
        key: 'bilibili.displayIntro',
        label: '显示简介',
        type: 'boolean',
        default: true,
    },
    {
        key: 'bilibili.displaySummary',
        label: '显示AI总结',
        type: 'boolean',
        default: true,
    },
    {
        key: 'bilibili.durationLimit',
        label: '视频时长限制(秒)',
        type: 'number',
        default: 480,
    },
    {
        key: 'bilibili.bangumiDirect',
        label: '番剧直接解析',
        type: 'boolean',
        default: false,
        description: '开启后直接下载番剧视频',
    },

    // ===== Douyin Settings =====
    {
        key: 'douyin.cookie',
        label: '抖音Cookie',
        type: 'string',
        default: '',
    },
    {
        key: 'douyin.durationLimit',
        label: '抖音时长限制(秒)',
        type: 'number',
        default: 300,
    },
    {
        key: 'douyin.displayCover',
        label: '显示抖音封面',
        type: 'boolean',
        default: true,
    },
    {
        key: 'douyin.enableComments',
        label: '显示抖音评论',
        type: 'boolean',
        default: false,
    },
    {
        key: 'douyin.enableMusic',
        label: '发送抖音背景音乐',
        type: 'boolean',
        default: true,
    },

    // ===== Weibo Settings =====
    {
        key: 'weibo.cookie',
        label: '微博Cookie',
        type: 'string',
        default: '',
    },
    {
        key: 'weibo.enableComments',
        label: '显示微博评论',
        type: 'boolean',
        default: true,
    },

    // ===== XHS Settings =====
    {
        key: 'xhs.cookie',
        label: '小红书Cookie',
        type: 'string',
        default: '',
    },

    // ===== YouTube Settings =====
    {
        key: 'youtube.durationLimit',
        label: 'YouTube时长限制(秒)',
        type: 'number',
        default: 480,
    },

    // ===== Netease Settings =====
    {
        key: 'netease.cookie',
        label: '网易云Cookie',
        type: 'string',
        default: '',
    },

    // ===== XHH Settings =====
    {
        key: 'xiaoheihe.cookie',
        label: '小黑盒Cookie',
        type: 'string',
        default: '',
    },

    // ===== AI Settings =====
    {
        key: 'ai.baseURL',
        label: 'AI接口地址',
        type: 'string',
        default: '',
        description: '兼容OpenAI格式的API地址',
    },
    {
        key: 'ai.apiKey',
        label: 'AI API Key',
        type: 'string',
        default: '',
    },
    {
        key: 'ai.model',
        label: 'AI模型名称',
        type: 'string',
        default: '',
    },

    // ===== Parser Enable/Disable =====
    {
        key: 'resolveController.bilibili',
        label: '启用B站解析',
        type: 'boolean',
        default: true,
    },
    {
        key: 'resolveController.douyin',
        label: '启用抖音解析',
        type: 'boolean',
        default: true,
    },
    {
        key: 'resolveController.weibo',
        label: '启用微博解析',
        type: 'boolean',
        default: true,
    },
    {
        key: 'resolveController.xhs',
        label: '启用小红书解析',
        type: 'boolean',
        default: true,
    },
    {
        key: 'resolveController.twitter',
        label: '启用X/Twitter解析',
        type: 'boolean',
        default: true,
    },
    {
        key: 'resolveController.youtube',
        label: '启用YouTube解析',
        type: 'boolean',
        default: true,
    },
    {
        key: 'resolveController.tiktok',
        label: '启用TikTok解析',
        type: 'boolean',
        default: true,
    },
    {
        key: 'resolveController.acfun',
        label: '启用A站解析',
        type: 'boolean',
        default: true,
    },
    {
        key: 'resolveController.netease',
        label: '启用网易云解析',
        type: 'boolean',
        default: true,
    },
    {
        key: 'resolveController.xiaoheihe',
        label: '启用小黑盒解析',
        type: 'boolean',
        default: true,
    },
    {
        key: 'resolveController.general',
        label: '启用通用解析(快手/西瓜等)',
        type: 'boolean',
        default: true,
    },
];