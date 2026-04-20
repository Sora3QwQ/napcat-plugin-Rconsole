/**
 * rconsole-plus NapCat Plugin - Message Handler
 * Unified message sending utilities replacing Yunzai's e.reply() and segment.*
 */

import type { OB11Segment, ForwardNode } from '../types/parser.js';
import { seg, buildForwardNode } from '../types/parser.js';
import { pluginState } from '../core/state.js';
import child_process from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

/** Send message segments to the source (auto-detect group/private) */
export async function sendMessage(ctx: any, event: any, message: OB11Segment | OB11Segment[] | string) {
    const segments = normalizeMessage(message);
    const params: any = {
        message: segments,
        message_type: event.message_type,
    };
    if (event.message_type === 'group' && event.group_id) {
        params.group_id = String(event.group_id);
    } else if (event.message_type === 'private' && event.user_id) {
        params.user_id = String(event.user_id);
    }
    return pluginState.callApi('send_msg', params);
}

/** Send text reply */
export async function sendText(ctx: any, event: any, text: string) {
    return sendMessage(ctx, event, text);
}

/** Send image (URL, local path, or base64) */
export async function sendImage(ctx: any, event: any, file: string) {
    return sendMessage(ctx, event, seg.image(file));
}

/** Send multiple images */
export async function sendImages(ctx: any, event: any, files: string[]) {
    const segments = files.map(f => seg.image(f));
    return sendMessage(ctx, event, segments);
}

/** Send video file (auto-generates thumbnail for NapCat compatibility) */
export async function sendVideo(ctx: any, event: any, filePath: string) {
    // NapCat requires a thumbnail for video messages
    let thumbPath: string | undefined;
    try {
        thumbPath = await generateVideoThumbnail(filePath);
    } catch {
        // If thumbnail generation fails, try sending without it
    }
    try {
        return await sendMessage(ctx, event, seg.video(filePath, thumbPath));
    } finally {
        // Clean up thumbnail
        if (thumbPath) {
            try { fs.unlinkSync(thumbPath); } catch { /* ignore */ }
        }
    }
}

/** Generate a video thumbnail using ffmpeg */
async function generateVideoThumbnail(videoPath: string): Promise<string> {
    const dir = path.dirname(videoPath);
    const baseName = path.basename(videoPath, path.extname(videoPath));
    const thumbPath = path.join(dir, `${baseName}_thumb.jpg`);
    
    return new Promise((resolve, reject) => {
        const proc = child_process.spawn('ffmpeg', [
            '-i', videoPath,
            '-ss', '00:00:01',
            '-vframes', '1',
            '-q:v', '5',
            '-y',
            thumbPath,
        ], { timeout: 15000 });
        proc.on('close', (code) => {
            if (code === 0 && fs.existsSync(thumbPath)) {
                resolve(thumbPath);
            } else {
                reject(new Error(`ffmpeg thumbnail failed with code ${code}`));
            }
        });
        proc.on('error', reject);
    });
}

/** Send voice/record file */
export async function sendRecord(ctx: any, event: any, filePath: string) {
    return sendMessage(ctx, event, seg.record(filePath));
}

/** Send mixed content (images + text combined) */
export async function sendMixed(ctx: any, event: any, segments: OB11Segment[]) {
    return sendMessage(ctx, event, segments);
}

/** Send forward message (合并转发) */
export async function sendForwardMsg(ctx: any, event: any, nodes: ForwardNode[]) {
    const params: any = {
        messages: nodes,
    };
    if (event.message_type === 'group' && event.group_id) {
        params.group_id = String(event.group_id);
        return pluginState.callApi('send_group_forward_msg', params);
    } else if (event.message_type === 'private' && event.user_id) {
        params.user_id = String(event.user_id);
        return pluginState.callApi('send_private_forward_msg', params);
    }
}

/**
 * Send images in batches as forward messages
 * Used when image count exceeds threshold
 */
export async function sendImagesInBatches(
    ctx: any,
    event: any,
    imageFiles: string[],
    batchSize: number = 50,
    senderName: string = 'Bot'
) {
    const senderId = String(event.self_id || event.user_id || '10001');
    for (let i = 0; i < imageFiles.length; i += batchSize) {
        const batch = imageFiles.slice(i, i + batchSize);
        const nodes = batch.map(file =>
            buildForwardNode(senderId, senderName, [seg.image(file)])
        );
        await sendForwardMsg(ctx, event, nodes);
    }
}

/**
 * Send text array as forward message
 * Replaces Yunzai's textArrayToMakeForward
 */
export async function sendTextsAsForward(
    ctx: any,
    event: any,
    texts: string[],
    senderName: string = 'Bot'
) {
    const senderId = String(event.self_id || event.user_id || '10001');
    const nodes = texts.map(text =>
        buildForwardNode(senderId, senderName, [seg.text(text)])
    );
    await sendForwardMsg(ctx, event, nodes);
}

/** Upload group file */
export async function uploadGroupFile(ctx: any, groupId: string | number, filePath: string, fileName: string) {
    return pluginState.callApi('upload_group_file', {
        group_id: String(groupId),
        file: filePath,
        name: fileName,
    });
}

/** Set emoji reaction on a message */
export async function setMsgEmojiLike(ctx: any, messageId: string | number, emojiId: string) {
    return pluginState.callApi('set_msg_emoji_like', {
        message_id: String(messageId),
        emoji_id: emojiId,
    });
}

/** Normalize message input to OB11Segment array */
function normalizeMessage(message: OB11Segment | OB11Segment[] | string): OB11Segment[] {
    if (typeof message === 'string') {
        return [seg.text(message)];
    }
    if (Array.isArray(message)) {
        return message;
    }
    return [message];
}

/** Re-export segment builders for convenience */
export { seg, buildForwardNode } from '../types/parser.js';