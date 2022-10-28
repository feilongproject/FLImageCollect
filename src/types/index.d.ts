import log4js from "log4js";
import readline from "readline";
import { RedisClientType } from "@redis/client";
import { SocksProxyAgent } from "socks-proxy-agent";

declare global {
    var _path: string;
    var redis: RedisClientType;
    var picRedis: RedisClientType;
    var log: log4js.Logger;
    var rl: readline.Interface;
    var socketAgent: SocksProxyAgent | undefined;
    var selectDB: string | null;
}