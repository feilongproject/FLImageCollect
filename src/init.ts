import fs from 'fs';
import readline from 'readline';
import { createClient } from 'redis';
import _log from './lib/logger';
import { rlPrompt, rlSetPrompt } from './plugins/admin';

export async function init() {
    console.log(`FLImageCollect(FLIC)准备运行，正在初始化`);

    global.socketAgent = undefined;
    global.selectDB = null;
    global._path = process.cwd();
    global.log = _log;

    log.info(`初始化：正在连接redis数据库(10号)`);
    global.redis = createClient({
        socket: { host: "127.0.0.1", port: 6379, },
        database: 10,
    });
    await global.redis.connect().catch(err => {
        log.error(`初始化：redis数据库连接失败，正在退出程序\n${err}`);
        process.exit();
    });
    log.info(`初始化：redis数据库(10号)连接成功`);

    log.info(`初始化：正在创建插件的热加载监听`);
    fs.watch(`${global._path}/src/plugins/`, (event, filename) => {
        //log.debug(event, filename);
        if (event != "change") return;
        if (require.cache[`${global._path}/src/plugins/${filename}`]) {
            log.mark(`文件${global._path}/src/plugins/${filename}已修改，正在执行热更新`);
            delete require.cache[`${global._path}/src/plugins/${filename}`];
            rlPrompt();
        }
    });

    log.info(`初始化：正在创建指令配置文件的热加载监听`);
    const optFile = `${global._path}/config/opts.json`;
    fs.watchFile(optFile, () => {
        if (require.cache[optFile]) {
            log.mark(`指令配置文件正在进行热更新`);
            delete require.cache[optFile];
            rlPrompt();
        }
    });


    log.info(`初始化：正在创建CLI交互界面`);
    global.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rlSetPrompt();

}