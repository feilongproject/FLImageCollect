import fetch from "node-fetch";
import { SocksProxyAgent } from "socks-proxy-agent";
import config from "../../config/config.json";

const agent = new SocksProxyAgent(config.proxy);
const timeout = 30 * 1000;
const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Safari/537.36" };


export async function sankakuSearch(tag: string, next = "", limit = 40) {
    return fetch(`https://capi-v2.sankakucomplex.com/posts/keyset?lang=en&limit=${limit}&tags=${tag}&next=${next}`, {
        headers,
        timeout,
        agent,
    }).then(res => {
        return res.json();
    }).then((json: SankakuSearch.SearchRoot) => {
        return json;
    }).catch(err => {
        log.error(err);
    });
}

export async function sankakuDownloadImage(fileUrl: string) {
    return fetch(fileUrl, {
        headers,
        agent
    }).then(res => {
        return res;
    }).catch(err => {
        log.error(err);
    });
}

export declare module SankakuSearch {

    interface Meta {
        next?: string | null;
        prev?: string | null;
    }

    interface Tag {
        id: number;
        name_en: string;
        name_ja: string | null;
        type: number;
        count: number;
        post_count: number;
        pool_count: number;
        locale: string;
        rating: string | null;
        version: number | null;
        tagName: string;
        total_post_count: number;
        total_pool_count: number;
        name: string;
    }

    interface Datum {
        id: number;
        rating: string;
        status: string;
        author: {
            id: number;
            name: string;
            avatar: string;
            avatar_rating: string;
        };
        sample_url: string;
        sample_width: number;
        sample_height: number;
        preview_url: string;
        preview_width: number;
        preview_height: number;
        file_url: string;
        width: number;
        height: number;
        file_size: number;
        file_type: string;
        created_at: {
            json_class: string;
            s: number;
            n: number;
        };
        has_children: boolean;
        has_comments: boolean;
        has_notes: boolean;
        is_favorited: boolean;
        user_vote: null;
        md5: string;
        parent_id: number | null;
        change: number;
        fav_count: number;
        recommended_posts: number;
        recommended_score: number;
        vote_count: number;
        total_score: number;
        comment_count: null;
        source: string;
        in_visible_pool: boolean;
        is_premium: boolean;
        is_rating_locked: boolean;
        is_note_locked: boolean;
        is_status_locked: boolean;
        redirect_to_signup: boolean;
        sequence: null;
        tags: Tag[];
        video_duration: null;
    }

    interface SearchRoot {
        meta: Meta;
        data: Datum[];
    }
}
