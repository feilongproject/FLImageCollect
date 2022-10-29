import { createClient } from "redis";
import { SocksProxyAgent } from "socks-proxy-agent";

export async function exit() {
    log.info(`进程正在退出`);

    log.info(`正在保存数据库`);

    if (global.redis && global.redis.isOpen) {
        await global.redis.save();
        await global.redis.disconnect();
    }

    if (global.picRedis && picRedis.isOpen) {
        await global.picRedis.save();
        await global.picRedis.disconnect();
    }

    log.info(`已退出！`);
    process.exit();

}

export async function changeSite(keywords: string[]) {
    const servers = (await import("../../config/opts.json")).default.site;

    const server = keywords[0];
    //log.debug(server);

    for (const _server of servers) {
        if (
            (server == _server.name)
            ||
            (server.length == 1 && server == _server.name[0])
        ) {
            selectDB = _server.name;
            log.info(`已切换到${_server.name}数据库(${_server.db}号)`);
            return changeLinkDB(_server.db).then(() => {
                return rlSetPrompt(_server.name);
            });

        }
    }
    log.error(`${server ? `错误的站点指定：${server}` : `未指定站点`}`);

}

export async function changeProxy(keywords: string[]) {

    const host = /^(\d*)$/.test(keywords[0]) ? `127.0.0.1` : keywords[0];
    const port = keywords[1] || keywords[0];
    if (port == "0") {
        socketAgent = undefined;
        return log.info("已取消代理");
    }

    if (!(host && port)) {
        return log.error(`未正确指定hosts与port`);
    }
    log.info(`已使用代理：${host}:${port}`);
    socketAgent = new SocksProxyAgent({
        hostname: host,
        port: port,
    });
}


export function rlPrompt() {
    rl.prompt();
    //rl.prompt();
}

export async function rlSetPrompt(serverType?: string) {

    global.rl.setPrompt(`(当前站点：${serverType ? serverType : `未选择`})等候指令中> `);
    rl.prompt();
}

async function changeLinkDB(id: number) {
    log.info(`初始化：正在连接redis图片数据库(${id}号)`);
    global.picRedis = createClient({
        socket: { host: "127.0.0.1", port: 6379, },
        database: id,
    });
    return global.picRedis.connect().then(() => {
        log.info(`redis图片数据库(${id}号)连接成功`);
    }).catch(err => {
        log.error(`redis图片数据库连接失败，正在退出程序\n${err}`);
        process.exit();
    });
}
