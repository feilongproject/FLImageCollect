import path from "path";
import crypto from "crypto";
import progressStream from "progress-stream";
import fs from "fs";
import { sleep } from "../lib/common";
import { kemonoDownloadImage, kemonoUserInfo } from "../lib/kemonoAPI";
import config from "../../config/config.json";

const serverURL = `https://kemono.party/`;
const MOVE_UP = Buffer.from('1b5b3141', 'hex').toString();
const CLEAR_LINE = Buffer.from('1b5b304b', 'hex').toString();
const MOVE_LEFT = Buffer.from('1b5b3130303044', 'hex').toString();
const options = {
    verify: false,
    limited: true,
    timesLimit: 1,
    logLevel: "full",
    rlBreak: false,
};
var threadsQueue: ThreadInfo[] = [];
var lastThreadLen = 0;
var nextPage = 0;
var nowPage = 0;
var nowChunk = 0;
var service = ``;
var uid = 0;

export async function downloadUser(keywords: string[]) {
    options.verify = false;
    options.rlBreak = false;
    options.limited = true;
    service = keywords[0];
    uid = Number(keywords[1]);
    if (!["fanbox",].includes(service))
        return log.error(`无法解析的service！`);
    else if (isNaN(uid))
        return log.error(`错误的用户id！`);
    //log.debug(typeof uid)

    for (let i = 2; i < keywords.length; i += 2) {
        const argvC = keywords[i];
        const argvD = keywords[i + 1];
        switch (argvC) {
            case "-t":
            case "--times":
                if (argvD == "-1") {
                    options.limited = false;
                    options.timesLimit = -1;
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
                nextPage = Number(argvD);
                if (isNaN(nextPage)) return log.error(`错误的续传id！`);
                log.info(`已设置续传id为：${nextPage}`);
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
            case "-v":
            case "--verify":
                i--;
                options.verify = true;
                break;
        }
    }

    if (!fs.existsSync(`${_path}/${config.downloadFile}/kemono/${service}/${uid}`)) {
        log.warn(`${_path}/${config.downloadFile}/kemono/${service}/${uid} 文件夹未存在，准备创建`);
        fs.mkdirSync(`${_path}/${config.downloadFile}/kemono/${service}/${uid}`, { recursive: true });
    }
    if (options.verify) return verifyAllData();
    log.info(`正在搜索services: \x1b[36m${service}\x1b[0m，用户id：\x1b[36m${uid}\x1b[0m，搜索次数：\x1b[36m${options.limited ? `${options.timesLimit}` : "无限制"}\x1b[0m`);
    log.info('开始获取资源并下载中，按任意键停止下载！');

    process.stdin.once("data", () => {
        //process.stdout.write('\x1B[0K');
        //process.stdout.write(data.toString());
        process.stdout.write(`\n\x1B[0K已停止\n`);
        options.rlBreak = true;
    });

    while (1) {
        const data = await kemonoUserInfo(service, uid, nextPage);

        if (!data) {
            log.error(`页面获取出错！`, data);
            return;
        } else if (data.length == 0) {
            log.info(`完成队列！`);
            return;
        } else {
            nowPage = nextPage;
            nextPage = data.length + nextPage;
        }

        for (const [chunk, postInfo] of data.entries()) {
            if (options.limited && !options.timesLimit--) return;
            if (options.rlBreak) return;
            if (!postInfo.file.path) continue;
            if (options.logLevel != "simple") log.info(`(${service})${uid}:${nowPage + chunk}`);
            nowChunk = chunk;
            threadsQueue = [];
            lastThreadLen = 0;//清空历史线程
            var threadsInfoStr = JSON.stringify(threadsQueue);
            const hFileUrl = serverURL + (postInfo.shared_file ? `/data/` : ``) + postInfo.file.path;
            const hFileName = `${postInfo.id}_p0${path.extname(postInfo.file.path)}`;
            const hFilePath = `${_path}/${config.downloadFile}/kemono/${service}/${uid}/${hFileName}`;
            const files: { fileUrl: string; fileName: string; filePath: string; hash: string; }[] = [{
                fileUrl: hFileUrl,
                fileName: hFileName,
                filePath: hFilePath,
                hash: (/[a-zA-Z0-9]{64}/.exec(hFileUrl) || ["null"])[0],
            }];//头图扔进files里
            //log.debug(hFileUrl, /[a-zA-Z0-9]{64}/.exec(hFileUrl));

            for (const [index, attachment] of postInfo.attachments.entries()) {
                const fileUrl = serverURL + attachment.path;
                const fileName = `${postInfo.id}_p${index + 1}${path.extname(attachment.path)}`;
                const filePath = `${_path}/${config.downloadFile}/kemono/${service}/${uid}/${fileName}`;
                files.push({
                    fileUrl: fileUrl,
                    fileName: fileName,
                    filePath: filePath,
                    hash: (/[a-zA-Z0-9]{64}/.exec(fileUrl) || ["null"])[0],
                });
            }//剩下图片也扔files里

            await picRedis.hSet(`pid:${postInfo.id}`, [
                ["id", postInfo.id],
                ["picNum", files.length],
                ["title", postInfo.title],
                ["user:id", postInfo.user],
                ["service", postInfo.service],
                ["content", postInfo.content],
                ["added", new Date(postInfo.added).getTime()],
                ["edited", new Date(postInfo.edited).getTime()],
                ["published", new Date(postInfo.published).getTime()],
            ]);//把主图扔进数据库
            //if (postInfo.shared_file) log.debug(postInfo);
            //continue;
            for (const [_fileId, _file] of files.entries()) {

                await picRedis.hSet(`fid:${postInfo.id}:${_fileId}`, [
                    ["id", postInfo.id],
                    ["fid", _fileId],
                    ["hash", _file.hash],
                    ["fileUrl", _file.fileUrl],
                    ["fileName", _file.fileName],
                    ["==>verify", (await picRedis.hGet(`fid:${postInfo.id}:${_fileId}`, "==>verify")) || "0"],
                ]);//把每一张图片信息扔进数据库
                if (fs.existsSync(_file.filePath)) {
                    //log.info(`id:${page.id}已下载`);
                    const threadId = createThreadId({
                        fid: _file.fileName,
                        percent: 100,
                        info: `文件已存在，跳过`,
                    });
                    getThreadStatus(threadId);
                    continue;
                }
                const threadId = createThreadId({
                    fid: _file.fileName,
                    percent: 0,
                    data: kemonoDownloadImage(_file.fileUrl).then(async (res) => {
                        if (!res) {
                            threadsQueue[threadId].percent = 100;
                            threadsQueue[threadId].err = `未获取到资源信息`;
                            return;
                        } else if (!res.ok) {
                            threadsQueue[threadId].percent = 100;
                            threadsQueue[threadId].err = `文件状态错误: ${res.status}:${res.statusText}`;
                            return;
                        }
                        var fsize = res.headers.get("Content-Length") || "";

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
                        return res.body.pipe(progress).pipe(fs.createWriteStream(_file.filePath));

                    }).catch(err => {
                        log.error(err);
                        lastThreadLen = 0;//清空历史线程
                    }),
                });
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
                    for (const threadInfo of threadsQueue) {
                        if ((threadInfo.percent != 100) && threadInfo.filePath) fs.rmSync(threadInfo.filePath);
                    }
                    lastThreadLen = 0;//清空历史线程
                    nextPage = nowPage;
                    break;
                }
                threadsInfoStr = JSON.stringify(threadsQueue);
            }

            //await sleep(1 * 1000);
        }
    }


}

function createThreadId(data: Partial<ThreadInfo>) {
    return (threadsQueue.push({
        threadId: threadsQueue.length,
        fid: data.fid || "-1",
        filePath: data.filePath || "",
        percent: data.percent || 0,
        data: data.data || null,
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
        //log.info(`(${service})${uid}:${nowPage + chunk}`);
        process.stdout.write(`${lineFill.length}(活动线程:${activeId})，当前进度：${(totalPercent / threadsQueue.length).toFixed(2)}%，(${service})${uid}:${nowPage + nowChunk}\n`);

    } else {

        process.stdout.write(`${MOVE_LEFT}${CLEAR_LINE}${lineFill.join("")}\x1B[K${lineFill.length}==========下载线程列表==========\n`);

        for (const [index, thread] of threadsQueue.entries()) {
            if (index + 6 >= process.stdout.rows) {
                etc++;
                process.stdout.write(`${MOVE_UP}${MOVE_LEFT}${CLEAR_LINE}省略${index - process.stdout.rows + 6}线程...\n`);
                continue;
            }
            process.stdout.write('\x1B[K');
            process.stdout.write(`(活动线程:${activeId})线程${thread.threadId}--图片id：${thread.fid}，进度：`);
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

async function verifyAllData() {
    const localFiles: {
        pid: string;
        chunk: number;
        filePath: string;
        fileName: string;
    }[] = [];
    const errorFiles: string[] = [];
    const _localFiles = fs.readdirSync(`${_path}/${config.downloadFile}/kemono/${service}/${uid}/`);
    var rlBreak = false;

    for (const _localFile of _localFiles) {
        const exp = /(.+)_p(\d+)/.exec(_localFile)!;
        const pid = exp[1];
        const chunk = Number(exp[2]);
        if (!pid || isNaN(chunk)) {
            log.error(`错误的文件名称:${_localFile}`);
            errorFiles.push(_localFile);
            continue;
        }
        localFiles.push({
            pid: pid,
            chunk: chunk,
            filePath: `${_path}/${config.downloadFile}/kemono/${service}/${uid}/${_localFile}`,
            fileName: _localFile,
        });
    }
    log.info(`本地一共有${_localFiles.length}个文件，其中有${errorFiles.length}个无法解析的文件，(${service})${uid}`);

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
        findQueue.push(picRedis.hGetAll(`fid:${localFile.pid}:${localFile.chunk}`).then((_data: any): any => {
            //if (status.error) return;//break test
            const pidRedisInfo: RedisFidInfo = _data;

            if (!pidRedisInfo.hash) {
                status.error++;
                return loog(localFile.pid, `未在数据库中找到`, "\n");
            } else if (pidRedisInfo.hash == "null") {
                status.error++;
                return loog(localFile.pid, `文件不存在hash`, "\n");
            } else if (pidRedisInfo["==>verify"] == "1") {
                status.skip++;
                return loog(localFile.pid, `\x1B[42;30m跳过\x1B[m`);
            }

            const buffer = fs.readFileSync(localFile.filePath);
            const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
            if (sha256 == pidRedisInfo.hash) {
                status.ok++;
                loog(localFile.pid, `\x1B[42;30m成功\x1B[m`);
                return picRedis.hSet(`fid:${localFile.pid}:${localFile.chunk}`, `==>verify`, `1`);
            } else {
                status.error++;
                loog(localFile.pid, `\x1B[41;30msha256错误，正在删除\x1B[m(${service}):${localFile.pid}:${localFile.chunk}`, "\n");
                //fs.rmSync(localFile.filePath);
            }


        }));
    }
    return Promise.all(findQueue).then(datas => {
        process.stdout.write(`\n\x1B[42;30m已完成校验！总计校验${findQueue.length}个，已跳过${status.skip}个，成功${status.ok}个，失败${status.error}个\x1B[m\n`);
    });
}


interface ThreadInfo {
    threadId: number;
    fid: string;
    filePath: string;
    percent: number;
    data: Promise<any> | null;
    err?: string;
    info?: string;
}

interface RedisPidInfo {
    id: string;
    picNum: number;
    title: string;
    "user:id": string;
    service: string;
    content: string;
    added: string;
    edited: string;
    published: string;
}

interface RedisFidInfo {
    id: string;
    fid: string;
    hash: string;
    fileUrl: string;
    fileName: string;
    "==>verify": string;
}