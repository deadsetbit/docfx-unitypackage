// The version picker, against a DOM small enough to read.
//
// The picker is how a reader reaches a release that is neither the one they are on nor the
// newest, so which options it offers — and which one it shows as current — is behaviour worth
// pinning rather than eyeballing once.

import assert from "node:assert/strict"
import { test } from "node:test"

import { orderedVersions, pickerEntries } from "../site-template/public/main.js"

test("offers every readable version, newest first", () => {
  const manifest = { versions: ["0.2.0", "1.0.0-rc.1", "0.10.0", "1.0.0"] }
  assert.deepEqual(orderedVersions(manifest), ["1.0.0", "1.0.0-rc.1", "0.10.0", "0.2.0"])
})

test("leaves out names that are not releases", () => {
  assert.deepEqual(orderedVersions({ versions: ["latest", "1.0.0", "assets", "01.0.0"] }), ["1.0.0"])
})

test("a manifest with nothing readable offers nothing", () => {
  for (const manifest of [null, {}, { versions: "nope" }, { versions: [] }]) {
    assert.deepEqual(orderedVersions(manifest), [])
  }
})

const at = (version) => ({ version, url: `https://docs.test/${version}/` })

test("a lone reachable version is below the floor, so no picker is offered", () => {
  // The banner still renders on a site with one release. The picker is what is left off, the
  // only version it could list being the one the reader is already on.
  assert.deepEqual(pickerEntries([at("1.0.0")]), [])
  assert.deepEqual(pickerEntries([]), [])
})

test("two reachable versions are enough to choose between", () => {
  const entries = [at("1.1.0"), at("1.0.0")]
  assert.deepEqual(pickerEntries(entries), entries)
})

test("a version the manifest gives no address for is never offered", () => {
  // Its option would be a dead end, and a picker of one is no picker at all.
  assert.deepEqual(pickerEntries([at("1.1.0"), { version: "1.0.0", url: null }]), [])
})
