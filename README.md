# napcat-plugin-rconsole

> 基于 [rconsole-plugin](https://github.com/zhiyu1998/rconsole-plugin) (Yunzai-Bot) 和 [astrbot_plugin_parser](https://github.com/Yun-Shan/astrbot_plugin_parser) (AstrBot) 重构的 NapCat 原生插件。

多平台内容解析插件 for [NapCat](https://github.com/NapNeko/NapCatQQ)，在群聊/私聊中自动识别链接并解析内容。

## ✨ 功能特性

- 🔗 **17+ 平台链接自动解析** — 发送链接即自动识别并返回内容
- 🎬 **视频自动下载发送** — B站/抖音/小红书/YouTube 等视频直接转发到群
- 🖼️ **图文内容提取** — 微博/小红书/抖音图集自动提取图片
- 🤖 **AI 总结** — B站视频 AI 摘要 + 任意链接 AI 总结
- ⚙️ **WebUI 配置** — 通过 NapCat WebUI 可视化配置所有选项
- 💾 **配置持久化** — 配置自动保存，重启不丢失
- 🔥 **热加载** — WebUI 修改配置后立即生效，无需重启

## 📋 支持平台

| 平台 | 链接格式 | 功能 | Cookie |
|---|---|---|---|
| **B站** | bilibili.com, b23.tv, BV号 | 视频/动态/专栏/直播/番剧/AI总结 | 可选（推荐） |
| **抖音** | v.douyin.com, douyin.com | 视频/图集/幻灯片 | 可选 |
| **微博** | weibo.com, m.weibo.cn | 微博/文章/视频/评论/转发 | 可选 |
| **小红书** | xhslink.com, xiaohongshu.com | 图文/视频笔记 | 可选 |
| **YouTube** | youtube.com, youtu.be | 视频下载 | 需 yt-dlp |
| **TikTok** | tiktok.com | 视频下载 | 需 yt-dlp + 代理 |
| **X/Twitter** | x.com | 图片/视频 | 需代理 |
| **A站** | acfun.cn | 视频 | — |
| **快手** | kuaishou.com | 视频 | — |
| **西瓜视频** | ixigua.com | 视频 | — |
| **皮皮虾** | pipix.com | 视频 | — |
| **微视** | weishi.qq.com | 视频 | — |
| **米游社** | miyoushe.com | 文章/图片/视频 | — |
| **小黑盒** | xiaoheihe.cn | 文章/游戏 | — |
| **网易云音乐** | music.163.com | 歌曲信息/播放 | — |
| **QQ音乐** | y.qq.com | 歌曲搜索/播放 | — |
| **波点音乐** | kuwo.cn | 歌曲播放 | — |
| **汽水音乐** | qishui.douyin.com | 歌曲播放 | — |
| **Telegram** | t.me | 媒体下载 | 需 tdl |
| **百度贴吧** | tieba.baidu.com | 图片/视频 | — |

## ⌨️ 命令功能

| 命令 | 说明 | 示例 |
|---|---|---|
| `#翻译 [目标语言] 文本` | 翻译文本 (DeepL/AI) | `#翻译 英语 你好世界` |
| `#点歌 [平台] 歌名` | 搜索并发送歌曲 | `#点歌 晴天` |
| `#总结 <链接>` | AI 总结链接内容 | `#总结 https://...` |
| `#帮助` | 显示帮助信息 | `#帮助` |
| `#解析开关` | 查看/管理解析开关 | `#解析开关` |

## 📁 项目结构

```
napcat-plugin-rconsole/
├── package.json          # 插件配置 + 依赖
├── tsconfig.json         # TypeScript 配置
├── vite.config.ts        # 构建配置
├── docker-compose.yml    # Docker 部署配置
├── dist/                 # ⭐ 构建产物（部署时只需要这个 + package.json）
│   ├── index.js          #   入口文件
│   └── *.js              #   各模块 chunks
└── src/                  # 源代码
    ├── index.ts          #   插件入口（8个生命周期函数）
    ├── core/             #   核心框架（状态/路由/配置schema）
    ├── handlers/         #   消息发送封装
    ├── parsers/          #   17个平台解析器 + 5个命令处理器
    ├── services/         #   翻译/点歌/AI总结服务
    ├── types/            #   TypeScript 类型定义
    └── utils/            #   工具函数（下载器/API/加密）
```

> **`dist/` 目录说明**：这是 Vite 构建 TypeScript 源码后输出的 JavaScript 文件。NapCat 运行时只加载 `dist/` 中的文件，不需要源码。如果你只是使用插件，只需要 `dist/` 和 `package.json`。

## 🚀 部署教程

### 前置依赖

| 依赖 | 必须？ | 安装方式 | 影响范围 |
|---|---|---|---|
| **Node.js 18+** | ✅ 必须 | NapCat 自带 | — |
| **ffmpeg** | ✅ 强烈推荐 | `apt install ffmpeg` | B站/抖音视频合并、缩略图 |
| **yt-dlp** | ❌ 可选 | `pip install yt-dlp` | YouTube + TikTok |
| **tdl** | ❌ 可选 | [github](https://github.com/iyear/tdl) | Telegram |

> 不安装可选依赖不会导致插件崩溃，只是对应功能不可用并给出提示。

### 方式一：使用预构建产物（推荐）

如果你下载的是 Release 包或已有 `dist/` 目录：

```bash
# 1. 将插件放到 NapCat 的 plugins 目录
mkdir -p /path/to/napcat/plugins/napcat-plugin-rconsole
cp -r dist/ /path/to/napcat/plugins/napcat-plugin-rconsole/
cp package.json /path/to/napcat/plugins/napcat-plugin-rconsole/

# 2. 安装运行时依赖
cd /path/to/napcat/plugins/napcat-plugin-rconsole
npm install --production

# 3. 重启 NapCat
```

### 方式二：从源码构建

```bash
# 1. 克隆/下载源码
git clone <repo-url>
cd napcat-plugin-rconsole

# 2. 安装依赖 + 构建
npm install
npm run build

# 3. 部署（同方式一）
mkdir -p /path/to/napcat/plugins/napcat-plugin-rconsole
cp -r dist/ /path/to/napcat/plugins/napcat-plugin-rconsole/
cp package.json /path/to/napcat/plugins/napcat-plugin-rconsole/
cd /path/to/napcat/plugins/napcat-plugin-rconsole
npm install --production
```

### 方式三：Docker 部署

使用项目自带的 `docker-compose.yml`：

```yaml
services:
  napcat:
    image: mlikiowa/napcat-docker:latest
    container_name: napcat
    restart: always
    environment:
      - NAPCAT_UID=0
      - NAPCAT_GID=0
      - TZ=Asia/Shanghai
    ports:
      - "127.0.0.1:3000:3000"    # NapCat WebUI
      - "127.0.0.1:3002:3001"
      - "127.0.0.1:6099:6099"
    volumes:
      - ./napcat/config:/app/napcat/config
      - ./napcat/plugins:/app/napcat/plugins    # 插件目录
      - ./ntqq:/app/.config/QQ
```

```bash
# 1. 将构建产物放到映射的 plugins 目录
mkdir -p ./napcat/plugins/napcat-plugin-rconsole
cp -r dist/ ./napcat/plugins/napcat-plugin-rconsole/
cp package.json ./napcat/plugins/napcat-plugin-rconsole/

# 2. 安装运行时依赖
cd ./napcat/plugins/napcat-plugin-rconsole
npm install --production
cd ../../..

# 3. 启动
docker compose up -d

# 4. 查看日志确认插件加载
docker logs napcat --tail 30
```

### 验证插件加载

日志中应该看到：
```
[Plugin: napcat-plugin-rconsole] [rconsole] rconsole-plus plugin initializing...
[Plugin: napcat-plugin-rconsole] [rconsole] Config loaded successfully
[Plugin: napcat-plugin-rconsole] [rconsole] Registered 22 parsers: [...]
[Plugin: napcat-plugin-rconsole] [rconsole] rconsole-plus plugin initialized successfully!
```

## ⚙️ 配置说明

插件加载后，通过 NapCat WebUI（默认 `http://localhost:3000`）进行配置：

1. 进入 WebUI → 插件管理 → `napcat-plugin-rconsole` → 配置
2. 根据需要填入各平台的 Cookie 和参数
3. 保存后**立即生效**（热加载），无需重启

### 关键配置项

| 配置 | 说明 | 获取方式 |
|---|---|---|
| B站 SESSDATA | B站登录凭证，用于高画质+AI总结 | 登录 bilibili.com → F12 → Cookie 中找 SESSDATA |
| B站画质 | 视频清晰度选择 | WebUI 下拉选择 |
| 代理地址 | 海外平台需要（YouTube/TikTok/Twitter） | 格式：`http://127.0.0.1:7890` |
| AI 接口 | 链接总结功能需要，兼容任何 OpenAI 格式 API | 填入 baseURL + API Key |

### 配置文件位置

配置自动保存到：
```
/app/napcat/config/plugins/napcat-plugin-rconsole/config.json
```

## 🔧 开发

```bash
# 安装依赖
npm install

# 监听模式（自动重新构建）
npm run dev

# 生产构建
npm run build
```

### 添加新的解析器

1. 在 `src/parsers/` 下创建新文件，继承 `BaseParser`
2. 实现 `name`、`patterns`、`handle()` 方法
3. 在 `src/index.ts` 的 `registerParsers()` 中注册

```typescript
import { BaseParser } from './base-parser.js';

export class MyParser extends BaseParser {
    name = 'myPlatform';
    displayName = '我的平台';
    priority = 300;
    patterns = [/myplatform\.com\/\w+/];

    async handle(ctx, event, match) {
        await this.sendText(ctx, event, '识别到我的平台链接！');
        return true;
    }
}
```

## 🙏 致谢

本项目基于以下优秀项目重构：

- [rconsole-plugin](https://github.com/zhiyu1998/rconsole-plugin) — 原始 Yunzai-Bot 插件，核心解析逻辑来源
- [astrbot_plugin_parser](https://github.com/Yun-Shan/astrbot_plugin_parser) — AstrBot 解析插件，抖音/小红书解析方案参考
- [NapCat Plugin Template](https://github.com/NapNeko/napcat-plugin-template) — NapCat 官方插件模板

## 📄 License

MIT