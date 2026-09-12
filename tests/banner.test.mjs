// The banner's decision rules, tested without a browser.
//
// These rules are frozen into every page the moment it is published, so they are the part of
// this file that can never be corrected for docs already out. They get tested directly.

import assert from "node:assert/strict"
import { test } from "node:test"

import { compareVersions, decideBanner, newerVersionUrls, versionEntries } from "../site-template/public/main.js"

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
  assert.equal(decideBanner("1.0.0", {}).kind, "unchecked")
  assert.equal(decideBanner("1.0.0", { versions: "nonsense" }).kind, "unchecked")
  assert.equal(decideBanner("1.0.0", null).kind, "unchecked")
  assert.equal(
    decideBanner("1.0.0", { versions: ["latest", "stable"] }).kind,
    "unchecked",
    "a list that names releases none of which parse was read and not understood",
  )
})

test("an empty version list is a readable manifest with nothing newer in it", () => {
  assert.equal(decideBanner("1.0.0", { versions: [] }), null)
})

test("a manifest shape this page predates still reports whatever it can read", () => {
  // Frozen pages have to degrade, not hard-fail, or a later format change silences every page
  // ever published. Unknown keys are ignored; the keys this page knows still work.
  const future = { schemaVersion: 7, channels: {}, versions: ["1.0.0", "2.0.0"] }
  assert.equal(decideBanner("1.0.0", future).version, "2.0.0")
})

test("a notice is read before anything else could rule it out", () => {
  // Docs moving is the one thing the manifest must always be able to say to a frozen page.
  const future = { schemaVersion: 7, notice: { text: "These docs have moved." } }
  assert.equal(decideBanner("1.0.0", future).kind, "notice")
  assert.equal(
    decideBanner("not-a-version", { notice: { text: "These docs have moved." } }).kind,
    "notice",
    "and it does not depend on the page's own version being readable",
  )
})

test("a notice the page cannot read is reported, not stepped over", () => {
  const superseding = ["1.0.0", "2.0.0"]
  assert.equal(decideBanner("1.0.0", { versions: superseding, notice: "moved" }).kind, "unchecked")
  assert.equal(decideBanner("1.0.0", { versions: superseding, notice: { url: "https://x.test" } }).kind, "unchecked")
  assert.equal(decideBanner("1.0.0", { versions: superseding, notice: { text: 123 } }).kind, "unchecked")
})

test("a notice link is only ever http(s)", () => {
  // The manifest arrives over the network; a javascript: or data: href would execute in the
  // documentation's own origin, on a page that can never be corrected.
  const withUrl = (url) => decideBanner("1.0.0", { notice: { text: "moved", url } })
  assert.equal(withUrl("javascript:alert(1)").url, null)
  assert.equal(withUrl("data:text/html,<script>alert(1)</script>").url, null)
  assert.equal(withUrl("https://gamingcouch.com").url, "https://gamingcouch.com")
  assert.equal(withUrl("javascript:alert(1)").text, "moved", "the notice itself still shows")
})

test("a version the manifest does not list still compares", () => {
  // A release can be unpublished from the manifest while its docs stay readable.
  assert.equal(decideBanner("1.0.0", manifest(["1.1.0"])).version, "1.1.0")
})

test("a package that does not use semver simply does not take part", () => {
  // The version is the package's own data. A package the action merely finds unusual is a site
  // without the feature, not a check that went wrong — the same reading as a 404 manifest.
  assert.equal(decideBanner("not-a-version", manifest(["1.0.0"])), null)
  assert.equal(decideBanner("1.2", manifest(["1.0.0"])), null)
})

test("versions that break semver's grammar are not releases", () => {
  // 01.2.0 compared equal to 1.2.0 under a looser pattern, so a real newer release could lose.
  assert.equal(compareVersions("01.0.0", "1.0.0"), null)
  assert.equal(compareVersions(" 1.0.0 ", "1.0.0"), null)
  assert.equal(compareVersions("1.0.0-alpha..1", "1.0.0-alpha.1"), null)
})

test("links to the same page under a version, with that version's root as fallback", () => {
  const urls = newerVersionUrls("https://example.test/docs/1.1.0/", "manual/getting-started.html")
  assert.equal(urls.deep, "https://example.test/docs/1.1.0/manual/getting-started.html")
  assert.equal(urls.root, "https://example.test/docs/1.1.0/")
})

test("the fallback is used when the page has no path of its own", () => {
  const urls = newerVersionUrls("https://example.test/docs/1.1.0/", "")
  assert.equal(urls.deep, urls.root)
})

const SITE = "https://old.test/docs/"

test("a bare version lives under the site root the page was built with", () => {
  assert.deepEqual(versionEntries({ versions: ["1.0.0"] }, SITE), [
    { version: "1.0.0", url: "https://old.test/docs/1.0.0/" },
  ])
})

test("an entry may name its own address, and that wins", () => {
  // The page's own site root is in its HTML and can never be changed, so this is the only way
  // a frozen page can be told the documentation now lives somewhere else.
  const manifest = { versions: [{ version: "2.0.0", url: "https://new.test/2.0.0/" }] }
  assert.deepEqual(versionEntries(manifest, SITE), [
    { version: "2.0.0", url: "https://new.test/2.0.0/" },
  ])
})

test("a whole site that has moved says so once", () => {
  const manifest = { siteRoot: "https://new.test/docs/", versions: ["1.0.0", "2.0.0"] }
  assert.deepEqual(versionEntries(manifest, SITE).map((e) => e.url), [
    "https://new.test/docs/2.0.0/",
    "https://new.test/docs/1.0.0/",
  ])
})

test("a named address without a trailing slash still joins correctly", () => {
  const manifest = { versions: [{ version: "2.0.0", url: "https://new.test/2.0.0" }] }
  assert.equal(versionEntries(manifest, SITE)[0].url, "https://new.test/2.0.0/")
})

test("addresses the manifest supplies are only ever http(s)", () => {
  const manifest = {
    siteRoot: "javascript:alert(1)",
    versions: [{ version: "2.0.0", url: "javascript:alert(1)" }, "1.0.0"],
  }
  // Both fall back to the root the page was built with rather than becoming a link.
  assert.deepEqual(versionEntries(manifest, SITE).map((e) => e.url), [
    "https://old.test/docs/2.0.0/",
    "https://old.test/docs/1.0.0/",
  ])
})

test("bare and named entries mix, and still order by precedence", () => {
  const manifest = { versions: ["1.0.0", { version: "2.0.0", url: "https://new.test/2.0.0/" }, "1.5.0"] }
  assert.deepEqual(versionEntries(manifest, SITE).map((e) => e.version), ["2.0.0", "1.5.0", "1.0.0"])
})

test("an entry that names no readable version is not a release", () => {
  const manifest = { versions: [{ url: "https://new.test/x/" }, { version: "latest" }, null, 7] }
  assert.deepEqual(versionEntries(manifest, SITE), [])
})

test("the comparison reads named entries too", () => {
  const manifest = { versions: ["1.0.0", { version: "2.0.0", url: "https://new.test/2.0.0/" }] }
  assert.equal(decideBanner("1.0.0", manifest).version, "2.0.0")
})
