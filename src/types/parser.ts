/**
 * rconsole-plus NapCat Plugin - Parser Types
 */

/** Parser route definition for the message router */
export interface ParserRoute {
    /** Internal name, e.g. "bilibili" */
    name: string;
    /** Display name, e.g. "哔哩哔哩" */
    displayName: string;
    /** URL patterns to match */
    patterns: RegExp[];
    /** Handler function */
    handler: (ctx: any, event: any, match: RegExpExecArray) => Promise<boolean>;
    /** Priority (lower = higher priority, default 300) */
    priority?: number;
}

/** OneBot11 message segment types */
export type OB11Segment =
    | { type: 'text'; data: { text: string } }
    | { type: 'image'; data: { file: string; summary?: string } }
    | { type: 'video'; data: { file: string; thumb?: string } }
    | { type: 'record'; data: { file: string } }
    | { type: 'at'; data: { qq: string } }
    | { type: 'reply'; data: { id: string } }
    | { type: 'face'; data: { id: string } }
    | { type: 'json'; data: { data: string } }
    | { type: 'music'; data: { type: 'custom'; url: string; audio: string; title: string; image?: string } };

/** Forward message node */
export interface ForwardNode {
    type: 'node';
    data: {
        user_id: string;
        nickname: string;
        content: OB11Segment[];
    };
}

/** Segment builder helpers */
export const seg = {
    text(text: string): OB11Segment {
        return { type: 'text', data: { text } };
    },
    image(file: string): OB11Segment {
        return { type: 'image', data: { file } };
    },
    video(file: string, thumb?: string): OB11Segment {
        const data: any = { file };
        if (thumb) data.thumb = thumb;
        return { type: 'video', data };
    },
    record(file: string): OB11Segment {
        return { type: 'record', data: { file } };
    },
    at(qq: string | number): OB11Segment {
        return { type: 'at', data: { qq: String(qq) } };
    },
    reply(id: string | number): OB11Segment {
        return { type: 'reply', data: { id: String(id) } };
    },
    face(id: string | number): OB11Segment {
        return { type: 'face', data: { id: String(id) } };
    },
    json(data: string): OB11Segment {
        return { type: 'json', data: { data } };
    },
    music(url: string, audio: string, title: string, image?: string): OB11Segment {
        return { type: 'music', data: { type: 'custom', url, audio, title, image } };
    },
};

/** Build a forward message node */
export function buildForwardNode(userId: string, nickname: string, content: OB11Segment[]): ForwardNode {
    return {
        type: 'node',
        data: { user_id: userId, nickname, content },
    };
}