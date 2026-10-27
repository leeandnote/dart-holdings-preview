import test from "node:test";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { readFileSync } from "node:fs";
import { renderYouTubeShort } from "./youtube_short.mjs";

test("social video keeps every card visible without black fades", (t) => {
  let commandArgs;
  t.mock.method(childProcess, "spawnSync", (_command, args) => {
    commandArgs = args;
    return { status: 0 };
  });
  syncBuiltinESMExports();
  try {
    const cards = ["holdings", "executives", "contracts", "major-events"].map(
      (name) => ({ file: `${name}.png` }),
    );
    assert.equal(renderYouTubeShort(cards, "daily.mp4"), "daily.mp4");
    const filter = commandArgs[commandArgs.indexOf("-filter_complex") + 1];
    assert.doesNotMatch(filter, /fade=/);
    assert.match(filter, /concat=n=4:v=1:a=0/);
    for (const card of cards) assert.ok(commandArgs.includes(card.file));
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});

test("Instagram explicitly selects a cover within the first card", () => {
  const source = readFileSync(new URL("./send_daily_social_cards.mjs", import.meta.url), "utf8");
  const reelFunction = source.slice(source.indexOf("async function postInstagramReel("), source.indexOf("async function withPublicSocialVideo("));
  assert.match(reelFunction, /thumb_offset:\s*"1000"/);
  assert.match(reelFunction, /share_to_feed:\s*"true"/);
});
