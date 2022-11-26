import { extname } from "path";
import * as cheerio from 'cheerio';
import LZString from "lz-string";
import ProgressBar from "progress";
import progressStream from "progress-stream";
import { HttpProxyAgent } from 'http-proxy-agent';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { sleep } from "../lib/common";
import { mhgComicInfo, mhgComicList, mhgImage } from "../lib/manhuaguiAPI";
import config from "../../config/config.json";
import fetch from "node-fetch";

/* export async function testProxy() {
    const proxys = readFileSync(`${_path}/config/proxy.txt`).toString().split("\n");
    const usful: string[] = [];
    const threads = [];
    const bar = new ProgressBar("err::err ok::ok [:bar]", {
        total: proxys.length,
        complete: "\u001b[42m \u001b[0m",
        incomplete: " ",
        width: 100,
    });
    const proxyInfo = { err: 0, ok: 0 };
    for (const proxy of proxys) {
        threads.push(fetch("https://tw.manhuagui.com/", {
            agent: new HttpProxyAgent({
                hostname: proxy.split(":")[0],
                port: proxy.split(":")[1],
            }),
            timeout: 10 * 1000,
        }).then(async res => {
            if (!res.ok) throw new Error("");
            const text = await res.text();
            if (!text.includes("manhuagui")) throw new Error("");
            log.debug(text);
            //await sleep(1000);

            usful.push(proxy);
            proxyInfo.ok++;
            bar.tick(proxyInfo);
            return res.text();
        }).catch(err => {
            //log.error
            proxyInfo.err++;
            bar.tick(proxyInfo);
        }));
    }
    Promise.all(threads).then(() => {
        log.debug(usful);
        writeFileSync(`${_path}/config/proxy-usful.json`, JSON.stringify(usful));
    })
} */

export async function downloadComic(keywords: string[]) {

    const comicId = Number(keywords[0]);
    const downloadConfig: {
        continueTitle: string | undefined;
        logLevel: string;
    } = { continueTitle: undefined, logLevel: "full" };
    keywords.shift();
    for (let i = 0; i < keywords.length; i += 2) {
        const keyword = keywords[i];
        switch (keyword) {
            case "-n":
            case "--next":
                downloadConfig.continueTitle = keywords[i + 1];
                break;
            case "-l":
            case "--log":
                downloadConfig.logLevel = keywords[i + 1];
                break;
        }
    }
    //if (1) return log.debug(keywords, downloadConfig);
    const comicListHtml = await mhgComicList(comicId);
    if (!comicListHtml) return log.error("未获取到html信息");
    const $ = cheerio.load(comicListHtml);
    const list = $("#chapter-list-0").find($("a"));

    for (const div of list) {
        const comicInfo = { href: div.attribs.href, title: div.attribs.title };
        if (downloadConfig.continueTitle && !comicInfo.title.includes(downloadConfig.continueTitle)) continue;
        downloadConfig.continueTitle = undefined;

        const comicInfoHtml = await mhgComicInfo(comicInfo.href);
        const jsSlic = comicInfoHtml.match(/>window.*(\(function\(p.*?)<\/script>/)![1];
        const coreStr = /[0-9],'([A-Za-z0-9+/=]+?)'/.exec(jsSlic)![1];
        const decStr = LZString.decompressFromBase64(coreStr);
        const jsNew = jsSlic.replace(/'[A-Za-z0-9+/=]*'\[.*\]\('\\x7c'\)/, "'" + decStr + "'.split('|')");
        const sol: ComicInfo = JSON.parse(eval(jsNew).match(/\(({.*})\)/)![1]);

        const fullFilesPath = `${_path}/${config.downloadFile}/manhuagui/${sol.bname}/${sol.cname}/`;
        if (!existsSync(fullFilesPath)) {
            log.info(`文件夹 ${fullFilesPath} 不存在，正在创建`);
            mkdirSync(fullFilesPath, { recursive: true });
        }
        var id = 0;
        const idLen = String(sol.len).length;
        const thread: Promise<void>[] = [];
        const fileInfo = { err: 0, fin: 0, skip: 0 };
        const bar = new ProgressBar(`${sol.cname} err::err fin::fin skip::skip total::total [:bar]`, {
            total: sol.len,
            complete: "\u001b[42m \u001b[0m",
            incomplete: " ",
            width: 100,
        });

        const change = { source: 0, will: 0 };
        change.will = change.source = Math.random();
        for (const file of sol.files) {
            change.will = Math.random();
            const ext = extname(file);
            const fullFileName = fullFilesPath + String(id).padStart(idLen, "0") + ext;
            const imagePath = `${sol.path}${file}?e=${sol.sl.e}&m=${sol.sl.m}`;

            if (existsSync(fullFileName)) {
                thread.push(new Promise((resolve) => {
                    ++fileInfo.skip;
                    if (downloadConfig.logLevel == "full") bar.interrupt(`文件${sol.cname}/${file}已存在`);
                    bar.tick(fileInfo);
                    resolve();
                }));
            } else {
                thread.push(mhgImage(imagePath).then((res) => {
                    if (!res || !res.ok) {
                        bar.interrupt(`未获取到资源信息`);
                        bar.tick(fileInfo);
                        //threadsQueue[threadId].err = `未获取到资源信息`;
                        //threadsQueue[threadId].err = `文件状态错误: ${res.status}:${res.statusText}`;     
                        return;
                    }
                    const fsize = res.headers.get("Content-Length") || "";
                    const progress = progressStream({ length: Number(fsize), time: 500, });

                    if (downloadConfig.logLevel == "full") bar.interrupt(`正准备下载：${sol.bname} ${file}`);
                    progress.on('progress', (progressData) => {
                        if (progressData.percentage == 100) {
                            fileInfo.fin++;
                            bar.tick(fileInfo);
                            return;
                        }
                        change.will = Math.random();
                    });
                    //res.body.pipe(progress).pipe(fileStream(fileName, threadId));
                    res.body.pipe(progress).pipe(createWriteStream(fullFileName));
                }).catch(err => {
                    bar.interrupt(err);
                    fileInfo.err;
                }));
            }
            await sleep(500);
            id++;
        }
        while (fileInfo.err + fileInfo.fin + fileInfo.skip != sol.len) {
            await sleep(10 * 1000);
            if (change.will == change.source) log.error(`长时间未响应`);
            change.source = change.will;
        }
        await sleep(2000);
    }
    log.info("所有下载已完毕！");
}


interface ComicInfo {
    bid: number;
    bname: string;
    bpic: string;
    cid: number;
    cname: string;
    files: string[];
    finished: boolean;
    len: number;
    path: string;
    status: number;
    block_cc: string;
    nextId: number;
    prevId: number;
    sl: {
        e: number;
        m: string;
    }
}