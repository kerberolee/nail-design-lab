import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the DIY nail studio", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>甲作实验室 · DIY 美甲工作台<\/title>/i);
  assert.match(html, /NAILFORM/);
  assert.match(html, /先找到适合你的/);
  assert.match(html, /实时材质预览/);
  assert.match(html, /编辑中指/);
  assert.match(html, /完成这套设计/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/);
});

test("keeps the nail studio self-contained and removes the starter preview", async () => {
  const [studio, css, page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(studio, /localStorage/);
  assert.match(studio, /applyAll/);
  assert.match(studio, /NailShape/);
  assert.match(studio, /猫眼/);
  assert.match(studio, /水晶/);
  assert.match(css, /\.hand-stage/);
  assert.match(css, /\.finish-猫眼/);
  assert.match(css, /@media \(max-width: 780px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(page, /<NailStudio \/>/);
  assert.match(layout, /lang="zh-CN"/);
  assert.match(packageJson, /"name": "nail-design-lab"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("app/_sites-preview/SkeletonPreview.tsx", templateRoot)));
});
