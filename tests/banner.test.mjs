// The banner's decision rules, tested without a browser.
//
// These rules are frozen into every page the moment it is published, so they are the part of
// this file that can never be corrected for docs already out. They get tested directly.

import assert from "node:assert/strict"
import { test } from "node:test"

import { compareVersions, decideBanner, newerVersionUrls } from "../site-template/public/main.js"

const manifest = (versions, extra = {}) => ({
  schemaVersion: 1,
  versions,
  latestStable: [...versions].filter((v) => !v.includes("-")).pop() ?? null,
  ...extra,
})

test("orders versions by semver precedence, not lexically", () => {
  assert.equal(compareVersions("0.10.0", "0.2.0"), 1)
  assert.equal(compareVersions("1.0.0", "1.0.0-rc.1"), 1, "a release outranks its prerelease")
  assert.equal(compareVersions("0.1.0-alpha.10", "0.1.0-alpha.2"), 1, "numeric identifiers compare numerically")
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0)
  assert.equal(compareVersions("1.0.0-alpha", "1.0.0-alpha.1"), -1, "fewer identifiers rank lower")
  assert.equal(compareVersions("1.0.0+build.9", "1.0.0"), 0, "build metadata is excluded from precedence")
})

test("a superseded stable version is told about the newer stable", () => {
  const decision = decideBanner("1.0.0", manifest(["1.0.0", "1.1.0"]))
  assert.equal(decision.kind, "superseded")
  assert.equal(decision.version, "1.1.0")
})

test("the current stable version is told nothing", () => {
  assert.equal(decideBanner("1.1.0", manifest(["1.0.0", "1.1.0"])), null)
})

test("a stable version ignores a newer prerelease", () => {
  // Nudging someone from stable onto an alpha is worse than leaving them alone.
  assert.equal(decideBanner("1.0.0", manifest(["1.0.0", "1.1.0-beta.1"])), null)
})

test("a prerelease is told about any newer release, stable or not", () => {
  assert.equal(decideBanner("0.1.0-alpha.7", manifest(["0.1.0-alpha.7", "0.1.0-alpha.8"])).version, "0.1.0-alpha.8")
  assert.equal(decideBanner("0.1.0-alpha.7", manifest(["0.1.0-alpha.7", "0.2.0"])).version, "0.2.0")
})

test("a prerelease newer than every published release is told nothing", () => {
  assert.equal(decideBanner("0.3.0-alpha.1", manifest(["0.1.0", "0.2.0"])), null)
})

test("the newest applicable version wins, whatever order the manifest lists", () => {
  const decision = decideBanner("1.0.0", manifest(["1.2.0", "1.0.0", "1.10.0", "1.3.0"]))
  assert.equal(decision.version, "1.10.0")
})

test("a relocation notice is shown, and its absence shows nothing", () => {
  const moved = manifest(["1.0.0"], { notice: { text: "These docs have moved.", url: "https://gamingcouch.com" } })
  const decision = decideBanner("1.0.0", moved)
  assert.equal(decision.kind, "notice")
  assert.equal(decision.text, "These docs have moved.")
  assert.equal(decision.url, "https://gamingcouch.com")

  assert.equal(decideBanner("1.0.0", manifest(["1.0.0"])), null)
})

test("a notice outranks a superseded-version banner", () => {
  // The docs moving is the more urgent thing to say, and it is a positive statement the
  // manifest made rather than something inferred.
  const moved = manifest(["1.0.0", "2.0.0"], { notice: { text: "Retired." } })
  assert.equal(decideBanner("1.0.0", moved).kind, "notice")
})

test("a manifest this page cannot interpret reports an unrun check, never silence", () => {
  // Silence already means "nothing newer exists", so it cannot also mean "I could not tell".
  assert.equal(decideBanner("1.0.0", { schemaVersion: 99, versions: ["2.0.0"] }).kind, "unchecked")
  assert.equal(decideBanner("1.0.0", {}).kind, "unchecked")
  assert.equal(decideBanner("1.0.0", { schemaVersion: 1, versions: "nonsense" }).kind, "unchecked")
})

test("a version the manifest does not list still compares", () => {
  // A release can be unpublished from the manifest while its docs stay readable.
  assert.equal(decideBanner("1.0.0", manifest(["1.1.0"])).version, "1.1.0")
})

test("an unreadable version string reports an unrun check rather than guessing", () => {
  assert.equal(decideBanner("not-a-version", manifest(["1.0.0"])).kind, "unchecked")
})

test("links to the same page under the newer version, with the version root as fallback", () => {
  const urls = newerVersionUrls("https://example.test/docs/", "1.1.0", "manual/getting-started.html")
  assert.equal(urls.deep, "https://example.test/docs/1.1.0/manual/getting-started.html")
  assert.equal(urls.root, "https://example.test/docs/1.1.0/")
})

test("the fallback is used when the page has no path of its own", () => {
  const urls = newerVersionUrls("https://example.test/docs/", "1.1.0", "")
  assert.equal(urls.deep, urls.root)
})
