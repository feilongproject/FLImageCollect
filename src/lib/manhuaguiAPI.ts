import fetch from "node-fetch";


const serverURL = `https://tw.manhuagui.com/`;
const imageURL = "https://i.hamreus.com";
const timeout = 20 * 1000;

const headers = {
    "Referer": "https://tw.manhuagui.com/",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36 Edg/107.0.1418.56"
}

export async function mhgComicList(comicId: number) {

    return fetch(`${serverURL}comic/${comicId}/`, {
        agent: socketAgent,
        headers,
        timeout
    }).then(res => {
        return res.text();
    }).catch(err => {
        log.error(err);
    });
}

export async function mhgComicInfo(href: string) {
    return fetch(serverURL + href, {
        agent: socketAgent,
        headers,
        timeout
    }).then(res => {
        return res.text();
    });
}

export async function mhgImage(path: string) {
    return fetch(imageURL + path, {
        headers,
        timeout,
        agent: socketAgent,
    })
}