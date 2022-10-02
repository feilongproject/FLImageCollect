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
const options = {
    timesLimit: 1,
    unlimited: false,
    verify: false,
    logLevel: "full",
};

var threadsQueue: ThreadInfo[] = [];
var lastThreadLen = 0;
var nowPage = ``;
var nowSearch = ``;

export async function downloadTags(keywords: string[]) {
    options.verify = false;
    options.unlimited = false;
    nowSearch = keywords[0];
    var nextPage = ``;
    var rlBreak = false;

    if (!nowSearch) {
        log.error(`未找到关键词，请重试！`);
        return;
    }

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

            case "-v":
            case "--verify":
                i--;
                options.verify = true;
                break;

            case "-l":
            case "--log":
                if (/(simple|full)/.test(argvD)) {
                    options.logLevel = /(simple|full)/.exec(argvD)![1];
                    log.info(`已设置log等级为：${options.logLevel}`);
                } else {
                    log.error(`错误的日志等级！使用simple或者full进行日志输出！`);
                    return;
                }
                break;

        }
    }

    if (options.verify) return verifyAllData(nowSearch);

    log.info(`正在搜索关键词：\x1b[36m${nowSearch}\x1b[0m，搜索次数：\x1b[36m${options.unlimited ? "无限制" : `${options.timesLimit}`}\x1b[0m`);
    log.info('开始获取资源并下载中，按任意键停止下载！');

    process.stdin.once("data", () => {
        //process.stdout.write('\x1B[0K');
        //process.stdout.write(data.toString());
        process.stdout.write(`\n\x1B[0K已停止\n`);
        rlBreak = true;
    });

    while (options.timesLimit-- || options.unlimited) {
        if (rlBreak) return;
        threadsQueue = [];
        lastThreadLen = 0;//清空历史线程

        var threadsInfoStr = JSON.stringify(threadsQueue);
        const data = await sankakuSearch(nowSearch, nextPage);

        if (options.logLevel != "simple") log.info(`G(${nowSearch}):${nextPage}`);

        if (!data || !data.data) {
            log.error(`页面获取出错！`, data);
            return;
        }
        if (!data.meta.next) {
            nowPage = nextPage;
            nextPage = `end`;
        } else {
            nowPage = nextPage;
            nextPage = data.meta.next;
        }

        await redis.hSet("turnIndex", (nowPage || "index"), nextPage);
        await redis.hSet("backIndex", nextPage, (nowPage || "index"));

        for (const page of data.data) {
            if (rlBreak) return;

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
                    lastThreadLen = 0;//清空历史线程
                });
            }

            if (!page.file_url) {
                const threadId = createThreadId({
                    pid: page.id,
                    percent: 100,
                    sourceMD5: page.md5,
                    err: `未找到文件url`,
                });
                getThreadStatus(threadId);
                continue;
            }//如果未找到则push错误信息，并继续循环

            const fileName = `${page.id}${path.extname(page.file_url.match(/.*(?=\?)/)![0])}`;//取得文件名称（id+后缀）
            const filePath = `${_path}/${config.downloadFile}/${nowSearch}/${fileName}`;//取得文件绝对路径（路径+文件名称）

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
                ["tags", tags.join("|")],
                ["create_date", new Date(page.created_at.s * 1000).getTime()],
                ["total_score", page.total_score],
                ["vote_count", page.vote_count],
                ["fav_count", page.fav_count],
                ["==>father", nowPage],
                ["==>fileName", fileName],
                ["==>filePath", filePath],
                ["==>verify", (await picRedis.hGet(`pid:${page.id}`, "==>verify")) || "0"]
            ]);//扔进数据库

            if (fs.existsSync(filePath)) {
                //log.info(`id:${page.id}已下载`);
                const threadId = createThreadId({
                    pid: page.id,
                    percent: 100,
                    sourceMD5: page.md5,
                    info: `文件已存在，跳过`,
                });
                getThreadStatus(threadId);
                continue;
            }//如果已有文件，则push文件存在信息，并继续循环


            const threadId = createThreadId({
                pid: page.id,
                percent: 0,
                sourceMD5: page.md5,
                data: sankakuDownloadImage(page.file_url).then(async (res) => {
                    if (!res) {
                        threadsQueue[threadId].percent = 100;
                        threadsQueue[threadId].err = `未获取到资源信息`;
                        return;
                    }

                    var type = res.headers.get("Content-Type") || "";
                    var fsize = res.headers.get("Content-Length") || "";
                    if (type != page.file_type) {
                        /* if (page.source.includes("i.pximg.net")) {
                            res = await pixivDownloadImage(page.source);
                            log.warn(`(活动线程：${threadId})pid:${page.id}，\n`);
                        } else {
                            log.error(`(活动线程：${threadId})pid:${page.id}，未知的源文件：${page.source}，G(${nowSearch}):${nowPage}\n`);
                            threadsQueue[threadId].err = "文件未找到，源文件未找到";
                            return;
                        }
                        if (!res) return; */
                        threadsQueue[threadId].err = `文件未找到，源站文件：${page.source}`;

                        return;
                    }
                    //threadsQueue[threadId].err = type;


                    const progress = progressStream({ length: Number(fsize), time: 500, });

                    progress.on('progress', (progressData) => {
                        //log.info(`正加载线程id：${threadId}`);
                        try {
                            threadsQueue[threadId].percent = progressData.percentage;
                            getThreadStatus(threadId);
                        } catch (error) {
                            log.error(progressData);
                            log.error(error);
                            log.error(`threadId`, threadId);
                            log.error(`threadsInfo`, threadsQueue);
                            lastThreadLen = 0;//清空历史线程
                            return;
                        }
                    });
                    //res.body.pipe(progress).pipe(fileStream(fileName, threadId));
                    return res.body.pipe(progress).pipe(fs.createWriteStream(filePath));

                }).catch(err => {
                    log.error(err);
                    lastThreadLen = 0;//清空历史线程
                }),
            });
            //break;//break test
        }

        while (threadsQueue.length) {
            var threadFinishLen = 0;
            for (const threadInfo of threadsQueue) {
                if ((threadInfo.percent == 100) || threadInfo.err) threadFinishLen++;
            }
            if (threadFinishLen == threadsQueue.length) {
                if (options.logLevel != "simple") log.info(`已完成当前所有线程！`);
                break;
            }
            getThreadStatus(-1);
            process.stdout.write(`${MOVE_LEFT}${CLEAR_LINE}至多有${threadsQueue.length - threadFinishLen}个线程未完成`);
            await sleep(10 * 1000);
            getThreadStatus(-1);

            if (threadsInfoStr == JSON.stringify(threadsQueue)) {
                log.error(`有${threadsQueue.length - threadFinishLen}个线程长时间未响应，删除未下载完成文件，重新开始当前队列所有线程`);
                lastThreadLen = 0;//清空历史线程
                for (const threadInfo of threadsQueue) {
                    if ((threadInfo.percent != 100) && threadInfo.filePath) fs.rmSync(threadInfo.filePath);
                }
                nextPage = nowPage;
                break;
            }
            threadsInfoStr = JSON.stringify(threadsQueue);
        }

        if (nextPage == "end") {
            log.info(`所有tag下载完毕！`);
            break;
        }
    }

    log.info(`按任意键结束下载`);
}

async function verifyAllData(tag: string) {
    const localFiles: {
        pid: string;
        filePath: string;
        fileName: string;
    }[] = [];
    const errorFiles: string[] = [];
    const _localFiles = fs.readdirSync(`${_path}/${config.downloadFile}/${tag}/`);
    var rlBreak = false;

    //const redisIds =await picRedis.keys(`pid:*`);
    for (const _localFile of _localFiles) {
        const fileId = /(\d*)/.exec(_localFile)![1];
        if (!fileId) {
            log.error(`错误的文件名称:${_localFile}`);
            errorFiles.push(_localFile);
            continue;
        }
        localFiles.push({
            pid: fileId,
            filePath: `${_path}/${config.downloadFile}/${tag}/${_localFile}`,
            fileName: _localFile,
        });
    }
    log.info(`本地一共有${_localFiles.length}个文件，其中有${errorFiles.length}个无法解析的文件，G(${tag})`);

    const findQueue: Promise<any>[] = [];
    const status = { ok: 0, error: 0, skip: 0 };
    const loog = (_pid: string, _s: string, _newLine?: string) => {
        process.stdout.write(
            `${_newLine || ""}` +
            `${MOVE_LEFT}${CLEAR_LINE}pid:${_pid}|校验状态：${_s}，总计校验${findQueue.length}个，已跳过${status.skip}个，成功${status.ok}个，失败${status.error}个` +
            `${_newLine || ""}`
        );
    }
    for (const localFile of localFiles) {
        if (rlBreak) break;

        findQueue.push(picRedis.hGetAll(`pid:${localFile.pid}`).then((_data: any): any => {
            const pidRedisInfo: PidRedisInfo = _data;

            if (!pidRedisInfo) {
                status.error++;
                return loog(localFile.pid, `未在数据库中找到`, "\n");
            }
            if (pidRedisInfo["==>verify"] == "1") {
                status.skip++;
                return loog(localFile.pid, `\x1B[42;30m跳过\x1B[m`);
            }

            const buffer = fs.readFileSync(localFile.filePath);
            const verifyMD5 = crypto.createHash('md5').update(buffer).digest('hex');
            if (verifyMD5 == pidRedisInfo.md5) {
                status.ok++;
                loog(localFile.pid, `\x1B[42;30m成功\x1B[m`);
                return picRedis.hSet(`pid:${localFile.pid}`, `==>verify`, `1`);
            } else {
                status.error++;
                loog(localFile.pid, `\x1B[41;30mmd5错误，正在删除\x1B[m（${pidRedisInfo["==>father"]}）`, "\n");
                fs.rmSync(localFile.filePath);
            }


        }));
    }
    return Promise.all(findQueue).then(datas => {
        process.stdout.write(`\n\x1B[42;30m已完成校验！总计校验${findQueue.length}个，已跳过${status.skip}个，成功${status.ok}个，失败${status.error}个\x1B[m\n`);
    });
}

function createThreadId(data: Partial<ThreadInfo>) {
    return (threadsQueue.push({
        threadId: threadsQueue.length,
        pid: data.pid || -1,
        filePath: data.filePath || "",
        percent: data.percent || 0,
        data: data.data || null,
        sourceMD5: data.sourceMD5 || "",
        verifyMD5: data.verifyMD5 || null,
        verifyFinish: data.verifyFinish || false,
        info: data.info,
    }) - 1);
}

function getThreadStatus(activeId: number) {

    var etc = 0;
    const lineFill = Array.from(Array(lastThreadLen == 0 ? 0 : lastThreadLen + 1), () => MOVE_UP);
    if (options.logLevel == "simple") {
        var totalPercent = 0;
        process.stdout.write(`${lineFill.length ? MOVE_UP : ""}${MOVE_LEFT}${CLEAR_LINE}`);

        for (const thread of threadsQueue) {
            if (thread.err) process.stdout.write(`\x1B[41;30m${thread.err}\x1B[m\n`);
            else totalPercent += thread.percent;

        }
        process.stdout.write(`${lineFill.length}(活动线程:${activeId})，当前进度：${(totalPercent / threadsQueue.length).toFixed(2)}%，G(${nowSearch}):${nowPage}\n`);

    } else {

        process.stdout.write(`${MOVE_LEFT}${CLEAR_LINE}${lineFill.join("")}\x1B[K${lineFill.length}==========下载线程列表==========\n`);

        for (const [index, thread] of threadsQueue.entries()) {
            if (index + 6 >= process.stdout.rows) {
                etc++;
                process.stdout.write(`${MOVE_UP}${MOVE_LEFT}${CLEAR_LINE}省略${index - process.stdout.rows + 6}线程...\n`);
                continue;
            }
            process.stdout.write('\x1B[K');
            process.stdout.write(`(活动线程:${activeId})线程${thread.threadId}--图片id：${thread.pid}，进度：`);
            if (thread.err) {
                process.stdout.write(`\x1B[41;30m${thread.err}\x1B[m`);
            } else if (thread.info) {
                process.stdout.write(`\x1B[42;30m${thread.info}\x1B[m`);
            } else if (thread.percent == -1) {
                process.stdout.write(`\x1B[41;30m文件无效，当前总线程重启后重试\x1B[m`);
            } else if (thread.percent == 100) {
                process.stdout.write(`\x1B[42;30m下载完成，线程结束\x1B[m`);
            } else {
                process.stdout.write(`\x1B[43;30m${thread.percent.toFixed(2)}%\x1B[m`);
            }
            process.stdout.write(`\n`);
        }
    }
    lastThreadLen = threadsQueue.length - etc;
}

interface ThreadInfo {
    threadId: number;
    pid: number;
    filePath: string;
    percent: number;
    data: Promise<any> | null;
    sourceMD5: string;
    verifyMD5: string | null;
    verifyFinish: boolean;
    err?: string;
    info?: string;
}

interface PidRedisInfo {
    id: string;
    md5: string;
    rat: string;
    "user:id": string;
    "user:name": string;
    tags: string;
    create_date: string;
    total_score: string;
    vote_count: string;
    fav_count: string;
    "==>father": string;
    "==>fileName": string;
    "==>filePath": string;
    "==>verify"?: string;
}