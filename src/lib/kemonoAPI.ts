import fetch from "node-fetch";

const timeout = 20 * 1000;
const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Safari/537.36" };


export async function kemonoUserInfo(service: string, uid: number, next = 0): Promise<KemonoUser.UserRoot | null> {

    return fetch(`https://kemono.party/api/${service}/user/${uid}?o=${next}`, {
        timeout,
        headers,
        agent: socketAgent,
    }).then(res => {
        return res.json();
    }).then((json: KemonoUser.UserRoot) => {
        //log.debug(json);
        return json;
    }).catch(err => {
        log.error(err);
        return null;
    });
}

export async function kemonoDownloadImage(fileUrl: string) {
    return fetch(fileUrl, {
        headers,
        timeout,
        agent: socketAgent,
    }).then(res => {
        return res;
    }).catch(err => {
        log.error(err);
    });
}

declare module KemonoUser {

    interface Attachment {
        name: string;
        path: string;
    }

    interface Embed { }

    interface File {
        name: string;
        path: string;
    }

    interface PostInfo {
        added: string;
        attachments: Attachment[];
        content: string;
        edited: string;
        embed: Embed;
        file: File;
        id: string;
        published: string;
        service: string;
        shared_file: boolean;
        title: string;
        user: string;
    }

    type UserRoot = PostInfo[];
}