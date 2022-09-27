
import { init } from "./init";
import { findOpts } from "./lib/findOpts";



init().then(() => {

    rl.prompt();
    rl.on("line", async (input: string) => {
        //log.debug(input);
        while (input.includes("  ")) {
            input = input.replaceAll("  ", " ");
        }
        const opts = input.trim().split(" ");

        const opt = await findOpts(opts[0]);
        if (opt.path == "err") {
            if (input)
                log.error(`未找到指定命令，请重试！`);
        } else {
            if (opts.length < 2) opts.push("");
            try {
                const plugin = await import(`./plugins/${opt.path}.ts`);
                if (typeof plugin[opt.fnc] == "function") {
                    await (plugin[opt.fnc] as PluginFnc)(opts.slice(1)).catch(err => {
                        log.error(err);
                    });
                } else {
                    log.error(`not found function ${opt.fnc}() at "${global._path}/src/plugins/${opt.path}.ts"`);
                }
            } catch (err) {
                log.error(err);
            }
        }


        rl.prompt();
        rl.prompt();
    });

});

type PluginFnc = (msg: string[]) => Promise<any>