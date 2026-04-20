/**
 * rconsole-plus NapCat Plugin - API Constants
 * Migrated from rconsole-plugin constants/tools.js
 */

// ==================== Bilibili ====================
export const BILI_SUMMARY = 'https://api.bilibili.com/x/web-interface/view/conclusion/get';
export const BILI_PLAY_STREAM = 'https://api.bilibili.com/x/player/wbi/playurl?cid={cid}&bvid={bvid}&qn={qn}&fnval={fnval}&fourk={fourk}';
export const BILI_DYNAMIC = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/opus/detail?id={}&features=onlyfansVote,onlyfansAssetsV2,decorationCard,htmlNewStyle,ugcDelete,editable,opusPrivateVisible,tribeeEdit,avatarAutoTheme,avatarTypeOpus';
export const BILI_BVID_TO_CID = 'https://api.bilibili.com/x/player/pagelist?bvid={bvid}&jsonp=jsonp';
export const BILI_VIDEO_INFO = 'http://api.bilibili.com/x/web-interface/view';
export const BILI_NAV = 'https://api.bilibili.com/x/web-interface/nav';
export const BILI_NAV_STAT = 'https://api.bilibili.com/x/web-interface/nav/stat';
export const BILI_SCAN_CODE_GENERATE = 'https://passport.bilibili.com/x/passport-login/web/qrcode/generate';
export const BILI_SCAN_CODE_DETECT = 'https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key={}';
export const BILI_STREAM_INFO = 'https://api.live.bilibili.com/room/v1/Room/get_info';
export const BILI_STREAM_FLV = 'https://api.live.bilibili.com/room/v1/Room/playUrl';
export const BILI_ONLINE = 'https://api.bilibili.com/x/player/online/total?bvid={0}&cid={1}';
export const BILI_EP_INFO = 'https://api.bilibili.com/pgc/view/web/season?ep_id={}';
export const BILI_BANGUMI_STREAM = 'https://api.bilibili.com/pgc/player/web/playurl?ep_id={ep_id}&cid={cid}&qn={qn}&fnval={fnval}&fourk={fourk}';
export const BILI_SSID_INFO = 'https://api.bilibili.com/pgc/web/season/section?season_id={}';
export const BILI_ARTICLE_INFO = 'https://api.bilibili.com/x/article/viewinfo?id={}';

// ==================== Douyin ====================
export const DY_INFO = 'https://www.douyin.com/aweme/v1/web/aweme/detail/?device_platform=webapp&aid=6383&channel=channel_pc_web&aweme_id={}&pc_client_type=1&version_code=190500&version_name=19.5.0&cookie_enabled=true&screen_width=1344&screen_height=756&browser_language=zh-CN&browser_platform=Win32&browser_name=Firefox&browser_version=118.0&browser_online=true&engine_name=Gecko&engine_version=109.0&os_name=Windows&os_version=10&cpu_core_num=16&device_memory=&platform=PC';
export const DY_COMMENT = 'https://www.douyin.com/aweme/v1/web/comment/list/?device_platform=webapp&aid=6383&channel=channel_pc_web&aweme_id={}&cursor=0&count=20&item_type=0&insert_ids=&whale_cut_token=&cut_version=1&rcFT=&pc_client_type=1&version_code=170400&version_name=17.4.0&cookie_enabled=true&screen_width=1920&screen_height=1080&browser_language=zh-CN&browser_platform=Win32&browser_name=Chrome&browser_version=124.0.0.0&browser_online=true&engine_name=Blink&engine_version=124.0.0.0&os_name=Windows&os_version=10&cpu_core_num=20&device_memory=8&platform=PC&downlink=10&effective_type=4g&round_trip_time=50&webid=7361743797237679616';
export const DY_TOUTIAO_INFO = 'https://aweme.snssdk.com/aweme/v1/play/?video_id={}&ratio=1080p&line=0';
export const DY_LIVE_INFO = 'https://live.douyin.com/webcast/room/web/enter/?device_platform=webapp&aid=6383&channel=channel_pc_web&pc_client_type=1&version_code=190500&version_name=19.5.0&cookie_enabled=true&screen_width=1920&screen_height=1080&browser_language=zh-CN&browser_platform=Win32&browser_name=Firefox&browser_version=124.0&browser_online=true&engine_name=Gecko&engine_version=122.0.0.0&os_name=Windows&os_version=10&cpu_core_num=12&device_memory=8&platform=PC&web_rid={}&room_id_str={}';
export const DY_LIVE_INFO_2 = 'https://webcast.amemv.com/webcast/room/reflow/info/?type_id=0&live_id=1&sec_user_id=&version_code=99.99.99&app_id=1128&room_id={}';

// ==================== Weibo ====================
export const WEIBO_SINGLE_INFO = 'https://m.weibo.cn/statuses/show?id={}';

// ==================== Xiaohongshu ====================
export const XHS_REQ_LINK = 'https://www.xiaohongshu.com/explore/';
export const XHS_VIDEO = 'http://sns-video-bd.xhscdn.com/';

// ==================== Twitter/X ====================
export const TWITTER_TWEET_INFO = 'https://api.twitter.com/2/tweets?ids={}';

// ==================== General Parse ====================
export const GENERAL_REQ_LINK = {
    link: 'http://47.99.158.118/video-crack/v2/parse?content={}',
    sign: 1,
};

// ==================== Netease ====================
export const NETEASE_API_CN = 'http://118.89.80.17:3000';
export const NETEASE_TEMP_API = 'https://www.hhlqilongzhu.cn/api/dg_wyymusic.php?gm={}&n=1&type=json';
export const QQ_MUSIC_TEMP_API = 'https://www.hhlqilongzhu.cn/api/dg_QQmusicflac.php?msg={}&n=1&type=json';
export const QISHUI_MUSIC_TEMP_API = 'https://api.cenguigui.cn/api/qishui/?msg={}&limit=1&type=json&n=1';

// ==================== Miyoushe ====================
export const MIYOUSHE_ARTICLE = 'https://bbs-api.miyoushe.com/post/wapi/getPostFull?post_id={}';

// ==================== Xiaoheihe ====================
export const XHH_BBS_LINK = 'https://api.xiaoheihe.cn/bbs/app/link/tree';
export const XHH_GAME_LINK = 'https://api.xiaoheihe.cn/game/get_game_detail';
export const XHH_CONSOLE_LINK = 'https://api.xiaoheihe.cn/game/console/get_game_detail';
export const XHH_MOBILE_LINK = 'https://api.xiaoheihe.cn/game/mobile/get_game_detail';

// ==================== Misc ====================
export const WEISHI_VIDEO_INFO = 'https://h5.weishi.qq.com/webapp/json/weishi/WSH5GetPlayPage?feedid={}';
export const HIBI_API_SERVICE = 'http://0d00.us.kg:8080/api';

// ==================== Common ====================
export const COMMON_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
export const BILI_HEADER = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
    'Referer': 'https://www.bilibili.com',
};

export const XHS_NO_WATERMARK_HEADER: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'cookie': '',
};