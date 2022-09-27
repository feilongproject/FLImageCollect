export async function exit() {
    log.info(`进程正在退出`);

    log.info(`正在保存数据库`);
    await redis.save();
    await redis.disconnect();
    await picRedis.save();
    await picRedis.disconnect();

    log.info(`已退出！`);
    process.exit();

}