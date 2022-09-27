import log4js from "log4js";
import { RedisClientType } from "@redis/client";
import readline from "readline";


declare global {
    var _path: string;
    var redis: RedisClientType;
    var picRedis: RedisClientType;
    var log: log4js.Logger;
    var rl: readline.Interface;

}