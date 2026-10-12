import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const React = require("react");
const warningModule = { exports: {} };
const warningCompiled = ts.transpileModule(fs.readFileSync("src/components/QualityWarnings.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
new Function("require", "module", "exports", warningCompiled)(require, warningModule, warningModule.exports);
const compiled = ts.transpileModule(fs.readFileSync("src/components/PlayerComparison.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    esModuleInterop: true, jsx: ts.JsxEmit.React },
}).outputText;

function player(props) {
  const state = [];
  let cursor = 0;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)(name => {
    if (name === "react") return { ...React, useRef: () => ({ current: null }), useState: initial => {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = value; }];
    } };
    if (name === "@/lib/utils") return { formatDuration: seconds => String(seconds) };
    if (name === "./QualityWarnings") return warningModule.exports;
    return require(name);
  }, module, module.exports);
  return () => { cursor = 0; return module.exports.default(props); };
}

function videoContainers(element) {
  const result = [];
  function visit(node, parent) {
    if (!React.isValidElement(node)) return;
    if (node.type === "video") result.push({ video: node, container: parent });
    React.Children.forEach(node.props.children, child => visit(child, node));
  }
  visit(element);
  return result;
}

for (const [resolution, ratio] of [["1080x1920", 9 / 16], ["1920x1080", 16 / 9], ["720x720", 1]]) {
  test(`desktop previews use ${resolution} delivery ratio before video metadata loads`, () => {
    const render = player({ taskId: "fixture", originalVideoUrl: "/original.mp4", finalVideoUrl: "/final.mp4",
      metadata: { resolution } });
    const element = render();
    const containers = videoContainers(element);
    assert.equal(containers.length, 2);
    for (const { container } of containers) assert.equal(container.props.style?.aspectRatio, ratio);
    assert.doesNotMatch(renderToStaticMarkup(element), /aspect-video/);
  });
}

test("both preview frames follow the actual loaded video dimensions", () => {
  const render = player({ taskId: "fixture", originalVideoUrl: "/original.mp4", finalVideoUrl: "/final.mp4" });
  let containers = videoContainers(render());
  for (const { video } of containers) {
    video.props.onLoadedMetadata({ currentTarget: { videoWidth: 1080, videoHeight: 1920 } });
  }
  containers = videoContainers(render());
  for (const { container } of containers) assert.equal(container.props.style.aspectRatio, 9 / 16);
  containers[1].video.props.onLoadedMetadata({ currentTarget: { videoWidth: 1920, videoHeight: 1080 } });
  containers = videoContainers(render());
  assert.equal(containers[0].container.props.style.aspectRatio, 9 / 16);
  assert.equal(containers[1].container.props.style.aspectRatio, 16 / 9);
});

test("quality findings remain visible alongside video playback and download", () => {
  const render = player({taskId: "fixture", finalVideoUrl: "/final.mp4",
    qualityWarnings: ["部分片段口型检测置信度不足", "成片存在约 80 毫秒音画偏移"]});
  const html = renderToStaticMarkup(render());
  assert.match(html, /成片检测提示/);
  assert.match(html, /部分片段口型检测置信度不足/);
  assert.match(html, /80 毫秒/);
  assert.match(html, /src="\/final.mp4"/);
  assert.match(html, /\/api\/tasks\/fixture\/download\/final.mp4/);
  assert.doesNotMatch(html, /高精度唇形对齐 完成/);
  const clean = renderToStaticMarkup(player({taskId: "clean", finalVideoUrl: "/final.mp4"})());
  assert.doesNotMatch(clean, /成片检测提示/);
});
