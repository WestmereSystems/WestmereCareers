import {
  readFile,
  mkdtemp,
  mkdir,
  copyFile,
  lstat,
  realpath,
  symlink,
  writeFile,
  rm,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile),
  root = fileURLToPath(new URL("../", import.meta.url));
// Copy exactly the files in each function's deployment trace, then execute the
// compiled worker there. The complete checkout must not hide missing deployment files.
for (const route of ["profile/cvs", "employers/assets"]) {
  const manifest = path.join(
    root,
    `.next/server/app/api/${route}/route.js.nft.json`,
  );
  const files = JSON.parse(await readFile(manifest, "utf8")).files;
  const relative = files.find(
    (file) =>
      file.includes("[worker thread]-src_lib_server_pdf-text-worker_mjs_") &&
      file.endsWith(".js"),
  );
  if (!relative)
    throw new Error(`The compiled PDF worker is missing from ${route}.`);
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "westmere-pdf-trace-"));
  try {
    const entries = [];
    for (const file of files) {
      const source = path.resolve(path.dirname(manifest), file),
        local = path.relative(root, source);
      if (
        local.startsWith(".." + path.sep) ||
        path.isAbsolute(local) ||
        /(^|\/)\.env(?:\.|$)/.test(local)
      )
        throw new Error("Unexpected file outside the deployment source.");
      entries.push({ source, local, info: await lstat(source) });
    }
    // Preserve Next's external-package aliases without pointing back into the checkout.
    for (const entry of entries.filter((e) => e.info.isSymbolicLink())) {
      const target = await realpath(entry.source),
        localTarget = path.relative(root, target);
      if (
        localTarget.startsWith(".." + path.sep) ||
        path.isAbsolute(localTarget)
      )
        throw new Error("Unexpected external-package target.");
      const destination = path.join(sandbox, entry.local);
      await mkdir(path.dirname(destination), { recursive: true });
      await symlink(
        path.relative(
          path.dirname(destination),
          path.join(sandbox, localTarget),
        ),
        destination,
      );
    }
    for (const entry of entries.filter((e) => !e.info.isSymbolicLink())) {
      const destination = path.join(sandbox, entry.local);
      if (entry.info.isDirectory())
        await mkdir(destination, { recursive: true });
      else {
        await mkdir(path.dirname(destination), { recursive: true });
        await copyFile(entry.source, destination);
      }
    }
    const runner = path.join(sandbox, "verify-worker.mjs");
    await writeFile(
      runner,
      `import {Worker} from 'node:worker_threads';import {readFileSync} from 'node:fs';
  const worker=new Worker(process.argv[2],{workerData:{bytes:new Uint8Array(readFileSync(process.argv[3]))},resourceLimits:{maxOldGenerationSizeMb:128,stackSizeMb:4}});
  const timer=setTimeout(()=>{worker.terminate();process.exit(1)},15000);
  worker.once('message',m=>{clearTimeout(timer);worker.terminate();if(typeof m.text!=='string'||!m.text.includes('SYNTHETIC CV')){console.error(m.error||'No PDF result');process.exitCode=1;}});
  worker.once('error',e=>{clearTimeout(timer);console.error(e.name,e.code||'',e.message);process.exitCode=1;});`,
    );
    const worker = path.join(
      sandbox,
      path.relative(root, path.resolve(path.dirname(manifest), relative)),
    );
    await run(
      process.execPath,
      [runner, worker, path.join(root, "tests/fixtures/synthetic-cv.pdf")],
      {
        cwd: sandbox,
        env: { PATH: process.env.PATH, NODE_ENV: "production" },
        timeout: 20000,
        maxBuffer: 100000,
      },
    );
    console.log(`Deployment-traced PDF upload worker verified: /api/${route}`);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
}
