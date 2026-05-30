import { test } from "node:test";
import assert from "node:assert/strict";

import { buildIssueLabels } from "../netlify/functions/feedback.ts";

// Unit coverage for the feedback → GitHub label mapping (issue #49).
// Run with: npx tsx --test website/tests/feedback.test.ts

test("bug feedback gets the bug label alongside the base labels", () => {
  assert.deepEqual(buildIssueLabels("bug"), ["feedback", "from-app", "bug"]);
});

test("feature feedback maps to the enhancement label", () => {
  assert.deepEqual(buildIssueLabels("feature"), ["feedback", "from-app", "enhancement"]);
});

test("question feedback gets the question label", () => {
  assert.deepEqual(buildIssueLabels("question"), ["feedback", "from-app", "question"]);
});

test("the base feedback/from-app labels are always present", () => {
  for (const category of ["bug", "feature", "question"] as const) {
    const labels = buildIssueLabels(category);
    assert.ok(labels.includes("feedback"), `${category} should include feedback`);
    assert.ok(labels.includes("from-app"), `${category} should include from-app`);
  }
});

test("an unmapped category falls back to the base labels without an undefined entry", () => {
  // Defensive guard: validatePayload already restricts categories, but if an
  // unmapped value reaches the builder it must not push `undefined` (GitHub
  // rejects that with a 422).
  const labels = buildIssueLabels("other" as unknown as "bug");
  assert.deepEqual(labels, ["feedback", "from-app"]);
  assert.ok(!labels.includes(undefined as unknown as string));
});
