import fs from "fs";
import path from "path";
import crypto from "crypto";
import { sleep } from '../lib/common';
import progressStream from 'progress-stream';
import { sankakuDownloadImage, sankakuSearch } from '../lib/sankakuAPI';
import config from "../../config/config.json";

const MOVE_LEFT = Buffer.from('1b5b3130303044', 'hex').toString();
const CLEAR_LINE = Buffer.from('1b5b304b', 'hex').toString();
const MOVE_UP = Buffer.from('1b5b3141', 'hex').toString();
const threadsInfo: ThreadInfo[] = [];
var lastThreadLen = 0;

export async function downloadTags(keywords: string[]) {
    const keyword = keywords[0];
    var nextPage: string = ``;
    var rlBreak = false;

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
            case "-n":
            case "--next":
                nextPage = argvD;
                log.info(`已设置续传页面为：${nextPage}`);
                break;
            default:
                break;
        }
    }

    log.info(`正在搜索关键词：\x1b[36m${keyword}\x1b[0m，搜索次数：\x1b[36m${options.unlimited ? "无限制" : `${options.timesLimit}`}\x1b[0m`);
    log.mark('开始获取资源并下载中，按任意键停止运行！');

    const a = process.stdin.once("data", () => {
        //process.stdout.write('\x1B[0K');
        //process.stdout.write(data.toString());
        process.stdout.write(`\n\x1B[0K已停止运行\n`);
        rlBreak = true;
    });

    while (options.timesLimit-- || options.unlimited) {
        while (threadsInfo.length) threadsInfo.pop();
        lastThreadLen = 0;//清空历史线程

        if (rlBreak) return;

        var threadsInfoStr = JSON.stringify(threadsInfo);
        const queue: Promise<any>[] = [];
        const data = await sankakuSearch(keyword, nextPage);
        const _nextPage = nextPage;

        log.info(`G(${keyword}):${nextPage}`);
        //log.debug(threadsInfo);

        if (!data || !data.meta.next) {
            log.error(`获取出错！`, data);
            return;
        }
        nextPage = data.meta.next;
        if (!nextPage) {
            log.info(`未找到结束页面，停止搜索`);
            return;
        }

        for (const page of data.data) {
            if (rlBreak) return;
            const tags: number[] = [];
            //log.debug(page.file_url);
            if (!page.file_url) {
                const threadId = threadsInfo.push({
                    threadId: threadsInfo.length,
                    pid: page.id,
                    filePath: ``,
                    percent: 100,
                    sourceMD5: page.md5,
                    verifyMD5: null,
                    verifyFinish: false,
                    err: `未找到文件url`,
                }) - 1;
                getThreadStatus(threadId);
                continue;
            }
            const fileName = `${page.id}${path.extname(page.file_url.match(/.*(?=\?)/)[0])}`;

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
                    lastThreadLen = 0;//清空历史线程
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

            if (fs.existsSync(`${_path}/${config.downloadFiles}/${fileName}`)) {
                //log.info(`id:${page.id}已下载`);
                const threadId = threadsInfo.push({
                    threadId: threadsInfo.length,
                    pid: page.id,
                    filePath: `${_path}/${config.downloadFiles}/${fileName}`,
                    percent: 100,
                    sourceMD5: page.md5,
                    verifyMD5: null,
                    verifyFinish: false,
                }) - 1;
                getThreadStatus(threadId);
                continue;
            }

            queue.push(sankakuDownloadImage(page.file_url).then((res) => {
                if (!res) {
                    log.error(res);
                    lastThreadLen = 0;//清空历史线程
                    return;
                };
                const threadId = createThread(page.id, page.md5, `${_path}/${config.downloadFiles}/${fileName}`);
                const fsize = res.headers.get("content-length");
                const progress = progressStream({ length: Number(fsize), time: 500, });

                progress.on('progress', (progressData) => {
                    //log.info(`正加载线程id：${threadId}`);
                    try {
                        threadsInfo[threadId].percent = progressData.percentage;
                        getThreadStatus(threadId);
                    } catch (error) {
                        log.error(progressData);
                        log.error(error);
                        log.error(`threadId`, threadId);
                        log.error(`threadsInfo`, threadsInfo);
                        log.error(page);
                        lastThreadLen = 0;//清空历史线程
                        return;
                    }
                });
                //res.body.pipe(progress).pipe(fileStream(fileName, threadId));
                return res.body.pipe(progress).pipe(fs.createWriteStream(`${_path}${config.downloadFiles}/${fileName}`));

            }).catch(err => {
                log.error(err);
                lastThreadLen = 0;//清空历史线程
            }));
            //break;//break test
        }

        while (threadsInfo.length) {
            var threadEndLen = 0;
            for (const threadInfo of threadsInfo) {
                if (threadInfo.percent == 100) threadEndLen++;
            }
            if (threadEndLen == threadsInfo.length) {
                log.info(`已完成当前所有线程！`);
                break;
            }
            log.error(`${MOVE_UP}${MOVE_LEFT}${CLEAR_LINE}似乎有${threadsInfo.length - threadEndLen}个线程卡死\n`);
            getThreadStatus(-1, 1);
            await sleep(5000);

            if (threadsInfoStr == JSON.stringify(threadsInfo)) {
                log.error(`有${threadsInfo.length - threadEndLen}个线程长时间未响应，删除未下载完成文件，重新开始当前队列所有线程`);
                lastThreadLen = 0;//清空历史线程
                for (const threadInfo of threadsInfo) {
                    if (threadInfo.percent != 100) fs.rmSync(threadInfo.filePath);
                }
                nextPage = _nextPage;
                break;
            }
            threadsInfoStr = JSON.stringify(threadsInfo);
        }

    }

    log.info(`结束下载`);
}

/* function fileStream(fileName: string, threadId: number) {
    return fs.createWriteStream(`${_path}${config.downloadFiles}/${fileName}`).on('error', (e) => {
        log.error(e);
    }).on('finish', () => {
        const buffer = fs.readFileSync(`${_path}${config.downloadFiles}/${fileName}`);
        threadsInfo[threadId].verifyMD5 = crypto.createHash('md5').update(buffer).digest('hex');
        threadsInfo[threadId].verifyFinish = true;
    });
} */

function createThread(pid: number, sourceMD5: string, filePath: string) {

    return (threadsInfo.push({
        threadId: threadsInfo.length,
        pid,
        percent: 0,
        filePath,
        sourceMD5,
        verifyFinish: false,
        verifyMD5: null,
    }) - 1);

}

function getThreadStatus(activeId: number, anotherLen = 0) {

    const lineFill = Array.from(Array(lastThreadLen == 0 ? 0 : lastThreadLen + 1 + anotherLen), () => MOVE_UP);
    //if (lastThreadLen > 0)
    process.stdout.write(`${MOVE_LEFT}${CLEAR_LINE}${lineFill.join("")}\x1B[K${lineFill.length}==========下载线程列表==========\n`);

    for (const thread of threadsInfo) {
        process.stdout.write('\x1B[K');
        process.stdout.write(`(活动线程:${activeId})线程${thread.threadId}--图片id：${thread.pid}，进度：`);
        if (thread.err) {
            process.stdout.write(`\x1B[41;30m${thread.err}\x1B[m`);
        } else if (thread.percent == 100) {
            /* if (!thread.verifyFinish) {
                process.stdout.write(`\x1B[42;30m下载完成，正在校验\x1B[m`);
            } else {
                if (thread.sourceMD5 == thread.verifyMD5) process.stdout.write(`\x1B[42;30m下载完成，已成功校验文件\x1B[m`);
                else process.stdout.write(`\x1B[41m下载完成，校验文件失败，文件MD5不同\x1B[m`);
            } */
            process.stdout.write(`\x1B[42;30m下载完成，线程结束\x1B[m`);
        } else {
            process.stdout.write(`\x1B[43;30m${thread.percent.toFixed(2)}%\x1B[m`);
        }
        process.stdout.write(`\n`);
    }

    lastThreadLen = threadsInfo.length;
}

interface ThreadInfo {
    threadId: number;
    pid: number;
    filePath: string;
    percent: number;
    sourceMD5: string;
    verifyMD5: string | null;
    verifyFinish: boolean;
    err?: string;
}