import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../contracts/income_credibility_judge.py", import.meta.url), "utf8");

test("GenLayer v2 does not ask validators to rescore deterministic metrics", () => {
  assert.match(source, /POLICY_VERSION = "agent-income-v2"/);
  assert.match(source, /Do not recalculate, replace, or compare those scores/);
  assert.doesNotMatch(source, /SCORE_TOLERANCE/);
  assert.match(source, /leader_value\["verdict"\] == own_value\["verdict"\]/);
});

test("GenLayer v2 grounds public reasons in submitted evidence", () => {
  assert.match(source, /def _grounded_reasons/);
  assert.match(source, /def _grounded_wallets/);
  assert.match(source, /response_format="json"/);
  assert.match(source, /run_nondet_unsafe/);
});
