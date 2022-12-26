import fs from "fs";
import path from "path";
import progressStream from "progress-stream";
import { cryptoFile, sleep } from "../lib/common";
import { kemonoDownloadImage, kemonoUserInfo } from "../lib/kemonoAPI";
import config from "../../config/config.json";

const serverURL = `https://kemono.party/`;
const MOVE_UP = Buffer.from('1b5b3141', 'hex').toString();
const CLEAR_LINE = Buffer.from('1b5b304b', 'hex').toString();
const MOVE_LEFT = Buffer.from('1b5b3130303044', 'hex').toString();
var options = { verify: false, limited: true, timesLimit: 0, logLevel: "full", rlBreak: false, force: false, renameMode: "" };
var nextPage = 0;
var nowPage = 0;
var service = ``;
var uid = 0;

export async function downloadUser(keywords: string[]) {
    options = { verify: false, limited: true, timesLimit: 0, logLevel: "full", rlBreak: false, force: false, renameMode: "" };
    nextPage = 0;
    nowPage = 0;
    service = keywords[0];
    uid = Number(keywords[1]);
    if (!["fanbox", "patreon", "fantia"].includes(service))
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
                if (argvD == "-1") { options.limited = false; options.timesLimit = -1; continue; }
                options.timesLimit = Number(argvD);
                break;
            case "-n":
            case "--next":
                nextPage = Number(argvD);
                if (isNaN(nextPage)) return log.error(`错误的续传id！`);
                log.info(`已设置续传id为: ${nextPage}`);
                break;
            case "-l":
            case "--log":
                if (/(simple|full)/.test(argvD)) {
                    options.logLevel = /(simple|full)/.exec(argvD)![1];
                    log.info(`已设置log等级为: ${options.logLevel}`);
                } else return log.error(`错误的日志等级！使用simple或者full进行日志输出！`);
                break;
            case "-v":
            case "--verify":
                i--;
                options.verify = true;
                break;
            case "-r":
            case "--rename":
                if (/(short|full)/.test(argvD)) {
                    options.renameMode = argvD;
                    log.info(`当前更改目标类型: ${options.logLevel}`);
                } else return log.error(`错误的更改目标类型！使用short或者full进行更改！`);
                break;
            case "-f":
            case "--force":
                i--;
                options.force = true;
                break;
        }
    }
    if (options.verify) return verifyAllData();
    if (options.renameMode) return renameAllData();
    if (options.timesLimit != -1 && options.timesLimit < 1) return log.error(`错误的请求上限！至少进行1次请求！`);
    if (!fs.existsSync(`${_path}/${config.downloadFile}/kemono/${service}/${uid}`)) {
        log.warn(`${_path}/${config.downloadFile}/kemono/${service}/${uid} 文件夹未存在，准备创建`);
        fs.mkdirSync(`${_path}/${config.downloadFile}/kemono/${service}/${uid}`, { recursive: true });
    }

    log.info(`正在搜索services: \x1b[36m${service}\x1b[0m，用户id：\x1b[36m${uid}\x1b[0m，搜索次数：\x1b[36m${options.limited ? `${options.timesLimit}` : "无限制"}\x1b[0m`);
    log.info('开始获取资源并下载中，按任意键停止下载！');

    process.stdin.once("data", (data: Buffer | string) => {
        if (Buffer.isBuffer(data)) process.stdout.write(`\n\x1B[0K已停止\n`);
        options.rlBreak = true;
    });

    while (1) {
        if (options.rlBreak) break;
        const data = await kemonoUserInfo(service, uid, nextPage);

        if (!data) {
            log.error(`页面获取出错！`, data);
            break;
        } else if (data.length == 0) {
            log.info(`完成队列！`);
            break;
        } else {
            nowPage = nextPage;
            nextPage = data.length + nextPage;
        }

        for (const [chunk, postInfo] of data.entries()) {
            const threadsQueue: ThreadInfo[] = [];

            if (options.limited && !options.timesLimit--) options.rlBreak = true;
            if (options.rlBreak) break;
            if (!postInfo.file.path) continue;
            if (options.logLevel != "simple") log.info(`(${service})${uid}:${nowPage + chunk}`);

            const files: {
                srcName: string;
                fileUrl: string;
                shortFileName: string;
                shortFilePath: string;
                fullFileName: string;
                fullFilePath: string;
                hash: string;
            }[] = [];
            postInfo.attachments.unshift({
                name: postInfo.file.name,
                path: postInfo.file.path,
            });

            for (const [index, atta] of postInfo.attachments.entries()) {
                const shortFileName = `${postInfo.id}_p${index}${path.extname(" " + atta.name)}`;
                const shortFilePath = `${_path}/${config.downloadFile}/kemono/${service}/${uid}/${shortFileName}`;
                const fullFileName = `${postInfo.id}_p${index}_${atta.name}`;
                const fullFilePath = `${_path}/${config.downloadFile}/kemono/${service}/${uid}/${fullFileName}`;
                files.push({
                    srcName: atta.name,
                    fileUrl: serverURL + atta.path,
                    shortFileName,
                    shortFilePath,
                    fullFileName,
                    fullFilePath,
                    hash: (/[a-zA-Z0-9]{64}/.exec(atta.path) || ["null"])[0],
                });
            }

            await picRedis.hSet(`pid:${postInfo.id}`, [
                ["id", postInfo.id],
                ["picNum", files.length],
                ["title", postInfo.title],
                ["userId", postInfo.user],
                ["service", postInfo.service],
                ["content", postInfo.content],
                ["added", new Date(postInfo.added).getTime()],
                ["edited", new Date(postInfo.edited).getTime()],
                ["published", new Date(postInfo.published).getTime()],
            ]);

            for (const [fid, file] of files.entries()) {
                await picRedis.hSet(`fid:${postInfo.id}:${fid}`, [
                    ["id", postInfo.id],
                    ["fid", fid],
                    ["hash", file.hash],
                    ["fileUrl", file.fileUrl],
                    ["shortFileName", file.shortFileName],
                    ["fullFileName", file.fullFileName],
                    ["srcName", file.srcName],
                    ["==>verify", (await picRedis.hGet(`fid:${postInfo.id}:${fid}`, "==>verify")) || "0"],
                ]);//把每一张图片信息扔进数据库

                if (fs.existsSync(file.shortFilePath) || fs.existsSync(file.fullFilePath)) {

                    threadsQueue.push({
                        threadId: threadsQueue.length,
                        fid: file.fullFileName,
                        percent: 100,
                        data: null,
                        info: `文件已存在，跳过`,
                    });
                    continue;
                }
                const { pathname } = new URL(file.fileUrl);
                const threadId =

                    (threadsQueue.push({
                        threadId: threadsQueue.length,
                        fid: file.fullFileName,
                        percent: 0,
                        data: kemonoDownloadImage(file.fileUrl).then(async (res) => {
                            if (!res) {
                                threadsQueue[threadId].percent = 100;
                                threadsQueue[threadId].err = `未获取到资源信息`;
                                return;
                            } else if (!res.ok) {
                                threadsQueue[threadId].percent = 100;
                                threadsQueue[threadId].err = `${pathname} 文件状态错误: ${res.status}:${res.statusText}`;
                                return;
                            }
                            var fsize = Number(res.headers.get("Content-Length"));
                            if (isNaN(fsize)) {
                                threadsQueue[threadId].percent = 100;
                                threadsQueue[threadId].err = `${pathname} 文件长度为NaN`;
                                return;
                            }

                            const progress = progressStream({ length: fsize, time: 1000, });
                            progress.on('progress', (progressData) => {
                                try {
                                    threadsQueue[threadId].percent = progressData.percentage;
                                } catch (error) {
                                    threadsQueue[threadId].percent = 100;
                                    threadsQueue[threadId].err = `${pathname} stream异常, err: ${error}`.replaceAll("\n", "\\n");
                                    return;
                                }
                            });
                            return res.body.pipe(progress).pipe(fs.createWriteStream(file.shortFilePath));
                        }).catch(err => {
                            threadsQueue[threadId].percent = 100;
                            threadsQueue[threadId].err = `${pathname} stream异常, err: ${err}`.replaceAll("\n", "\\n");
                        }),

                    }) - 1);
            }

            var startDate = new Date().getTime();
            var stat: number[] = [];
            await new Promise<void>((resolve, reject) => {
                process.stdout.write(`${threadsQueue.length}==========下载线程列表==========\n`);
                const intervalId = setInterval(() => {
                    if (options.rlBreak) resolve(clearInterval(intervalId));
                    getThreadStatus(threadsQueue);
                    var threadFinishLen = 0;
                    const _stat: number[] = [];
                    for (const threadInfo of threadsQueue) {
                        _stat.push(threadInfo.percent);
                        if (threadInfo.percent == 100) threadFinishLen++;
                    }
                    if (threadFinishLen == threadsQueue.length) {
                        process.stdout.write(Array(threadsQueue.length).fill("\n").join(""));
                        log.info(`已完成当前所有线程！\n`);
                        resolve(clearInterval(intervalId));
                    }
                    if (stat.join() == _stat.join()) {
                        if (new Date().getTime() - startDate > 30 * 1000) {
                            process.stdout.write(Array(threadsQueue.length).fill("\n").join(""));
                            log.info(`线程长时间未加载, 已终止`);
                            resolve(clearInterval(intervalId));
                        }
                    } else {
                        startDate = new Date().getTime();
                        stat = _stat;
                    }
                }, 500);
            });
        }
    }
    process.stdin.emit("data", "");

}

function getThreadStatus(threadsQueue: ThreadInfo[]) {
    const lineFill = Array(threadsQueue.length).fill(MOVE_UP);
    if (options.logLevel == "simple") {
        /* var totalPercent = 0;
        //process.stdout.write(`${lineFill.length ? MOVE_UP : ""}${MOVE_LEFT}${CLEAR_LINE}`);
        for (const thread of threadsQueue) {
            if (thread.err) process.stdout.write(`\x1B[41;30m${thread.err}\x1B[m\n`);
            else totalPercent += thread.percent;
        }
        process.stdout.write(`${lineFill.length}当前进度：${(totalPercent / threadsQueue.length).toFixed(2)}%，(${service})${uid}:${nowPage + nowChunk}\n`); */
    } else {
        //process.stdout.write(`${MOVE_LEFT}${CLEAR_LINE}\x1B[K`);     
        for (const [index, thread] of threadsQueue.entries()) {
            /* if (index + 6 >= process.stdout.rows) {
                //etc++;
                process.stdout.write(`${MOVE_UP}${MOVE_LEFT}${CLEAR_LINE}省略${index - process.stdout.rows + 6}线程...\n`);
                continue;
            } */
            process.stdout.write(CLEAR_LINE);
            process.stdout.write(`线程${thread.threadId}--图片名称: ${thread.fid}，进度：`);
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
        process.stdout.write(`${MOVE_LEFT}${lineFill.join("")}`);
    }
    //lastThreadLen = threadsQueue.length - etc;
}

async function renameAllData() {
    const { _localFiles, localFiles, errorFiles } = loadLocalData();
    log.info(`本地一共有${_localFiles.length}个文件，其中有${errorFiles.length}个无法解析的文件，(${service})${uid}`);

    const status = { ok: 0, error: 0 };
    for (const localFile of localFiles) {
        await picRedis.hGetAll(`fid:${localFile.pid}:${localFile.part}`).then(async (_data: any): Promise<any> => {
            status.ok++;
            const pidRedisInfo: RedisFidInfo = _data;
            fs.renameSync(localFile.localPath, `${_path}/${config.downloadFile}/kemono/${service}/${uid}/` + (options.renameMode == "short" ? pidRedisInfo.shortFileName : pidRedisInfo.fullFileName));
            process.stdout.write(`${MOVE_LEFT}${CLEAR_LINE}pid:${localFile.pid}|总计命名${status.ok}个`);
        });
    }
    return process.stdout.write(`\n\x1B[42;30m已完成重命名！总计重命名${status.ok + status.error}个，成功${status.ok}个，失败${status.error}个\x1B[m\n`);
}

async function verifyAllData() {
    const { _localFiles, localFiles, errorFiles } = loadLocalData();
    log.info(`本地一共有${_localFiles.length}个文件，其中有${errorFiles.length}个无法解析的文件，(${service})${uid}`);

    const findQueue: Promise<any>[] = [];
    const status = { ok: 0, error: 0, skip: 0 };
    const loog = (_pid: number, _s: string, _newLine?: string) => {
        process.stdout.write(
            `${_newLine || ""}` +
            `${MOVE_LEFT}${CLEAR_LINE}pid:${_pid}|校验状态：${_s}${options.force ? `(强制校验)` : ``}，总计校验${findQueue.length}个，已跳过${status.skip}个，成功${status.ok}个，失败${status.error}个` +
            `${_newLine || ""}`
        );
    }
    for (const localFile of localFiles) {
        await picRedis.hGetAll(`fid:${localFile.pid}:${localFile.part}`).then(async (_data: any): Promise<any> => {
            const pidRedisInfo: RedisFidInfo = _data;
            if (!pidRedisInfo.hash) {
                status.error++;
                return loog(localFile.pid, `未在数据库中找到`, "\n");
            } else if (pidRedisInfo.hash == "null") {
                status.error++;
                return loog(localFile.pid, `文件不存在hash`, "\n");
            } else if (!options.force && pidRedisInfo["==>verify"] == "1") {
                status.skip++;
                return loog(localFile.pid, `\x1B[42;30m跳过\x1B[m`);
            }

            const sha256 = await cryptoFile(localFile.localPath, "sha256");
            if (sha256 == pidRedisInfo.hash) {
                status.ok++;
                loog(localFile.pid, `\x1B[42;30m成功\x1B[m`);
                return picRedis.hSet(`fid:${localFile.pid}:${localFile.part}`, `==>verify`, `1`);
            } else {
                status.error++;
                loog(localFile.pid, `\x1B[41;30msha256错误，正在删除\x1B[m(${service}):${localFile.pid}:${localFile.part}`, "\n");
                fs.rmSync(localFile.localPath);
            }
        });
    }
    return process.stdout.write(`\n\x1B[42;30m已完成校验！总计校验${localFiles.length}个，已跳过${status.skip}个，成功${status.ok}个，失败${status.error}个\x1B[m\n`);
}

function loadLocalData() {
    const localFiles: {
        pid: number;
        part: number;
        localPath: string;
        localName: string;
    }[] = [];
    const errorFiles: string[] = [];
    const _localFiles = fs.readdirSync(`${_path}/${config.downloadFile}/kemono/${service}/${uid}/`);
    for (const _localFile of _localFiles) {
        const exp = /^(.+)_p(\d+)(_|\.)/.exec(_localFile) || [];
        const pid = Number(exp[1]);
        const part = Number(exp[2]);
        if (!pid || isNaN(part)) {
            log.error(`错误的文件名称:${_localFile}`);
            errorFiles.push(_localFile);
            continue;
        }
        localFiles.push({
            pid, part,
            localPath: `${_path}/${config.downloadFile}/kemono/${service}/${uid}/${_localFile}`,
            localName: _localFile,
        });
    }
    return { _localFiles, localFiles, errorFiles };
}

interface ThreadInfo {
    threadId: number;
    fid: string;
    percent: number;
    data: Promise<any> | null;
    err?: string;
    info?: string;
}

interface RedisPidInfo {
    id: string;
    picNum: number;
    title: string;
    userId: string;
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
    srcName: string;
    "==>verify": string;
    fullFileName: string;
    shortFileName: string;
}