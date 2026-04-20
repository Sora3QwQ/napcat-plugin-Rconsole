/**
 * rconsole-plus NapCat Plugin - Song Request Service
 * Supports: 酷狗, QQ音乐, 网易云 music search & playback
 * Migrated from rconsole-plugin apps/songRequest.js + utils/kugou.js
 */

import axios from 'axios';
import { pluginState } from '../core/state.js';
import { NETEASE_TEMP_API, QQ_MUSIC_TEMP_API } from '../utils/api-constants.js';

/** Kugou API endpoints */
const KUGOU_SEARCH = 'https://mobileservice.kugou.com/api/v3/search/song?keyword={}&page=1&pagesize=10';
const KUGOU_PLAY = 'https://www.kugou.com/yy/index.php?r=play/getdata&hash={}&album_id={}&mid=1';

export interface SongResult {
    title: string;
    artist: string;
    album?: string;
    cover?: string;
    audioUrl?: string;
    source: string;
}

/**
 * Search songs by keyword across multiple platforms
 */
export async function searchSong(keyword: string, platform: string = 'kugou'): Promise<SongResult[]> {
    switch (platform.toLowerCase()) {
        case 'kugou': return searchKugou(keyword);
        case 'qq': return searchQQMusic(keyword);
        case 'netease': return searchNetease(keyword);
        default: return searchKugou(keyword);
    }
}

// ==================== Kugou ====================

async function searchKugou(keyword: string): Promise<SongResult[]> {
    try {
        const url = KUGOU_SEARCH.replace('{}', encodeURIComponent(keyword));
        const resp = await axios.get(url, { timeout: 10000 });
        const songs = resp.data?.data?.info || [];

        return songs.slice(0, 5).map((s: any) => ({
            title: (s.songname || '').replace(/<\/?em>/g, ''),
            artist: s.singername || '未知',
            album: s.album_name || '',
            cover: '',
            audioUrl: undefined, // Need to fetch with hash
            source: 'kugou',
            _hash: s.hash,
            _albumId: s.album_id,
        }));
    } catch {
        return [];
    }
}

/**
 * Get Kugou song play URL by hash
 */
export async function getKugouPlayUrl(hash: string, albumId: string): Promise<string | null> {
    try {
        const url = KUGOU_PLAY.replace('{}', hash).replace('{}', albumId);
        const resp = await axios.get(url, {
            headers: {
                'Cookie': 'kg_mid=1',
            },
            timeout: 10000,
        });
        return resp.data?.data?.play_url || resp.data?.data?.play_backup_url || null;
    } catch {
        return null;
    }
}

// ==================== QQ Music ====================

async function searchQQMusic(keyword: string): Promise<SongResult[]> {
    try {
        const url = QQ_MUSIC_TEMP_API.replace('{}', encodeURIComponent(keyword));
        const resp = await axios.get(url, { timeout: 10000 });
        const data = resp.data;

        if (data?.code === 200 && data?.music_url) {
            return [{
                title: data.title || keyword,
                artist: data.author || '未知',
                cover: data.cover || '',
                audioUrl: data.music_url,
                source: 'qq',
            }];
        }
        return [];
    } catch {
        return [];
    }
}

// ==================== Netease ====================

async function searchNetease(keyword: string): Promise<SongResult[]> {
    try {
        const url = NETEASE_TEMP_API.replace('{}', encodeURIComponent(keyword));
        const resp = await axios.get(url, { timeout: 10000 });
        const data = resp.data;

        if (data?.code === 200 && data?.music_url) {
            return [{
                title: data.title || keyword,
                artist: data.author || '未知',
                cover: data.cover || '',
                audioUrl: data.music_url,
                source: 'netease',
            }];
        }
        return [];
    } catch {
        return [];
    }
}