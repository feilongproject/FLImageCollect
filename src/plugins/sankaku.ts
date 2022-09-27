import fs from "fs";
import path from "path";
import { sleep } from '../lib/common';
import progressStream from 'progress-stream';
import { sankakuDownloadImage, sankakuSearch } from '../lib/sankakuAPI';
import config from "../../config/config.json";

const MOVE_LEFT = Buffer.from('1b5b3130303044', 'hex').toString();
const CLEAR_LINE = Buffer.from('1b5b304b', 'hex').toString();
const MOVE_UP = Buffer.from('1b5b3141', 'hex').toString();
const threadsInfo: ThreadInfo[] = [];
var lastThreadLen = 0;

export async function search(keywords: string[]) {




    /* const dataQueue: Promise<PixivIllust[] | null>[] = [];
    for (var t = 0; t < options.timesLimit; t++) {
        log.info(`正在进行第${t + 1}次搜索`);
        dataQueue.push(pixivSearchIllust({
            word: keyword,
            search_target: "partial_match_for_tags",
            sort: "date_desc",
            offset: t * 30,
        }).then(data => {
            if (data?.illusts) return data.illusts;
            return [];
        }).catch(err => {
            log.error(`第${t + 1}次搜索失败`, err);
            return [];
        }));
        await sleep(2000);
    }

    const illustsData: PixivIllust[] = [];
    const datas = await Promise.all(dataQueue);
    for (const _data of datas) {
        if (_data) illustsData.push(..._data);
    }

    const databaseQueue: Promise<any>[] = [];
    const stst = {
        databaseHas: (await picRedis.keys(`pid:*`)).length,
        databasePut: 0,
        searchCount: illustsData.length,
    };

    for (const [index, illust] of illustsData.entries()) {
        databaseQueue.push(picRedis.exists(`pid:${illust.id}`).then(has => {
            if (has == 1) {
                log.info(`已找到第${index}张，id：${illust.id}，总页数：${illust.page_count}，已置入数据库`);
            } else {
                log.info(`已找到第${index}张，id：${illust.id}，总页数：${illust.page_count}，正在置入数据库中`);
                stst.databasePut++;
                stst.databaseHas++;
                const tags: string[] = [];
                for (const tag of illust.tags) {
                    tags.push(tag.name);
                }
                const metaPages: {
                    original?: string;
                    square_medium?: string;
                    medium?: string;
                    large?: string;
                }[] = [];
                if ((illust.page_count == 1) && illust.meta_single_page.original_image_url) {
                    metaPages.push({ original: illust.meta_single_page.original_image_url });
                } else {
                    for (const page of illust.meta_pages) metaPages.push(page.image_urls);


                }
                return picRedis.hSet(`pid:${illust.id}`, [
                    ["id", illust.id],
                    ["title", illust.title],
                    ["type", illust.type],
                    ["caption", illust.caption],
                    ["user:id", illust.user.id],
                    ["user:name", illust.user.name],
                    ["user:account", illust.user.account],
                    ["tags", tags.join()],
                    ["create_date", new Date(illust.create_date).getTime()],
                    ["page_count", illust.page_count],
                    ["sanity_level", illust.sanity_level],
                    ["meta_pages", JSON.stringify(metaPages)],
                    ["total_view", illust.total_view],
                    ["total_bookmarks", illust.total_bookmarks],
                ]);
            }
        }));
    }

    await Promise.all(databaseQueue);
    log.info(`本次查找已找到${stst.searchCount}张，已向数据库添加${stst.databasePut}张，数据库总计共有${stst.databaseHas}张`); */

}

export async function downloadTags(keywords: string[]) {
    const keyword = keywords[0];
    if (!keyword) {
        log.error(`未找到关键词，请重试！`);
        return;
    }

    const options = {
        timesLimit: 1,
        unlimited: false,

    };
    for (let i = 1; i < keywords.length; i += 2) {
        const argvC = keywords[i];
        const argvD = keywords[i + 1];
        switch (argvC) {
            case "-t":
            case "--times":

                if (argvD == "-1") {
                    options.unlimited = true;
                    continue;
                }
                options.timesLimit = parseInt(argvD);
                if (!options.timesLimit || options.timesLimit < 1) {
                    log.error(`错误的请求上限！至少进行1次请求！`);
                    return;
                }
                break;

            default:
                break;
        }
    }

    log.info(`正在搜索关键词：\x1b[36m${keyword}\x1b[0m，搜索次数：\x1b[36m${options.unlimited ? "无限制" : `${options.timesLimit}`}\x1b[0m`);

    var nextPage: string = ``;
    var rlBreak = false;
    rl.question("开始获取资源并下载中，按回车键停止运行！\n", (ans) => {
        //log.debug(ans);
        rlBreak = true;
    });


    while ((options.timesLimit-- || options.unlimited) && !rlBreak) {
        log.info(`G(${keyword}):${nextPage}`);
        const queue: Promise<void>[] = [];


        const data = await sankakuSearch(keyword, nextPage);
        if (!data || !data.meta.next) {
            log.error(`获取出错！`);
            return;
        }
        nextPage = data.meta.next;

        for (const page of data.data) {
            threadsInfo.splice(0, threadsInfo.length);
            const tags: number[] = [];
            for (const tag of page.tags) {
                tags.push(tag.id);
                await picRedis.hSet(`tag:${tag.id}`, [
                    ["id", tag.id],
                    ["name_en", tag.name_en],
                    ["name_ja", `${tag.name_ja}`],
                    ["type", tag.type],
                    ["count", tag.count],
                    ["post_count", tag.post_count],
                    ["pool_count", tag.pool_count],
                    ["locale", tag.locale],
                    ["rating", `${tag.rating}`],
                    ["version", `${tag.version}`],
                    ["tagName", tag.tagName],
                    ["total_post_count", tag.total_post_count],
                    ["total_pool_count", tag.total_pool_count],
                    ["name", tag.name],
                ]).catch(err => {
                    log.error(err);
                });
            }

            await picRedis.hSet(`pid:${page.id}`, [
                ["id", page.id],
                ["md5", page.md5],
                ["rat", page.rating],
                //["title", page.title],
                //["type", page.type],
                //["caption", page.caption],
                ["user:id", page.author.id],
                ["user:name", page.author.name],
                //["user:account", page.user.account],
                ["tags", tags.join()],
                ["create_date", new Date(page.created_at.s * 1000).getTime()],
                ["total_score", page.total_score],
                ["vote_count", page.vote_count],
                ["fav_count", page.fav_count],

            ]);

            if (fs.existsSync(`${_path}/${config.downloadFiles}/${page.id}${path.extname(page.file_url.match(/.*(?=\?)/)[0])}`)) {
                log.info(`id:${page.id}已下载`);
                continue;
            }

            queue.push(sankakuDownloadImage(page.file_url).then((res) => {
                if (!res) {
                    log.error(res);
                    return;
                };
                //threadInfo.push({ threadId:});
                const threadId = createThread(page.id);
                if (threadId == -1) {
                    log.error(`线程超过限制，暂时终止`);
                    return;
                }

                const fsize = res.headers.get("content-length");
                const str = progressStream({ length: Number(fsize) || undefined, time: 500, });

                str.on('progress', function (progressData) {
                    threadsInfo[threadId].percent = progressData.percentage;
                    if (progressData.percentage == 100) threadsInfo[threadId].finish = true;
                    getThreadStatus();
                });
                res.body.pipe(str).pipe(fileStream(`${page.id}${path.extname(page.file_url.match(/.*(?=\?)/)[0])}`));
            }));
        }
        await Promise.all(queue);
        await sleep(500);
    }

}

function fileStream(fileName: string) {
    return fs.createWriteStream(`${_path}${config.downloadFiles}/${fileName}`).on('error', function (e) {
        log.error(e);
    });
}

function createThread(pid: number) {
    if (threadsInfo.length >= config.downloadThread) {
        for (const threadInfo of threadsInfo) {
            if (threadInfo.finish) return threadInfo.threadId;
        }
        return -1;
    } else {
        return (threadsInfo.push({
            threadId: threadsInfo.length,
            finish: false,
            percent: 0,
            pid
        }) - 1);
    }
}

function getThreadStatus() {

    const lineFile = Array.from(Array(lastThreadLen), () => MOVE_UP);
    process.stdout.write(MOVE_LEFT + CLEAR_LINE + lineFile.join(""));

    for (const thread of threadsInfo) {
        process.stdout.write('\x1B[K');
        if (thread.percent == 100) process.stdout.write(`线程${thread.threadId}--图片id：${thread.pid}，进度：\x1B[42;30m下载完成\x1B[m\n`);
        else process.stdout.write(`线程${thread.threadId}--图片id：${thread.pid}，进度：\x1B[43;30m${thread.percent.toFixed(2)}%\x1B[m\n`);
    }
    lastThreadLen = threadsInfo.length;
}

interface ThreadInfo {
    threadId: number;
    finish: boolean;
    percent: number;
    pid: number;
}