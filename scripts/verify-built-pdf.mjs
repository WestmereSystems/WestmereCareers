import { readFile } from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";
// Execute the actual production artifact: source-only tests cannot catch bundler rewrites.
for (const route of ["profile/cvs", "employers/assets"]) {
  const manifest = path.resolve(
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
  const data = new Uint8Array(
    await readFile(
      new URL("../tests/fixtures/synthetic-cv.pdf", import.meta.url),
    ),
  );
  await new Promise((resolve, reject) => {
    const worker = new Worker(path.resolve(path.dirname(manifest), relative), {
      workerData: data,
      resourceLimits: { maxOldGenerationSizeMb: 128, stackSizeMb: 4 },
    });
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      void worker.terminate();
      error ? reject(error) : resolve();
    };
    const timer = setTimeout(
      () => finish(new Error("Compiled PDF parsing exceeded its time limit.")),
      15000,
    );
    worker.once("message", (message) =>
      finish(
        typeof message.text === "string" &&
          message.text.includes("SYNTHETIC CV")
          ? null
          : new Error("The compiled PDF worker could not extract the test CV."),
      ),
    );
    worker.once("error", (error) => finish(error));
    worker.once("exit", () => {
      if (!finished)
        finish(new Error("The compiled PDF worker exited without a result."));
    });
  });
  console.log(`Compiled PDF upload worker verified: /api/${route}`);
}
