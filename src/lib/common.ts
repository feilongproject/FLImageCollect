import fs from "fs";
import crypto from "crypto";


export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function cryptoFile(path: string, algorithm: string) {
    return new Promise<string>((resolve, reject) => {
        var hash = crypto.createHash(algorithm);
        var rs = fs.createReadStream(path);
        rs.on('error', (err) => {
            reject(err);
        });
        rs.on('data', chunk => {
            hash.update(chunk);
        });
        rs.on('end', () => {
            resolve(hash.digest("hex"));
        });
    });
}