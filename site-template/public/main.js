// The version banner.
//
// Whatever this file does is frozen into a page the moment that page is published. The manifest
// is the one mutable input, so everything the banner can be taught later has to be a fact the
// manifest states — not logic here. What lives here is the reading of it.
//
// A failed fetch is not evidence that anything moved. The reader may be offline or behind a
// proxy, and a page cannot tell that from a site that is genuinely gone, so the wording for
// that case claims nothing beyond the check not having run.
//
// Once there is a readable manifest and a version to compare it against, the banner always
// renders — quietly when the reader is already current, naming the version either way. Where
// there are other releases to reach, it carries the picker, which is the only route from one
// release's documentation to another's: a current page that rendered nothing would be the one
// page a reader cannot navigate out of, and it is the page they start on.
//
// A 404 is the exception, and the only failure the page can read anything into: the server
// answered, and what it said is that this site publishes no manifest. That is a site without
// the feature rather than a check that went wrong, so it stays quiet. Every other failure is
// inconclusive and says so.

const UNCHECKED_TEXT = "The check for a newer version of this documentation did not run."

// What "latest" may claim depends on what the comparison below was allowed to look at. A stable
// reader is never pointed at a newer prerelease, so on that page the newest release and the
// newest release *it was offered* are different things, and only the narrower claim is true.
export function currentText(version, latestKind) {
  return latestKind === "stable"
    ? `This documents version ${version}, the latest stable release.`
    : `This documents version ${version}, the latest release.`
}

// --- version precedence -----------------------------------------------------
//
// Semver precedence, which no built-in comparison gives: a release outranks its own
// prereleases, identifiers that are numbers compare as numbers, and build metadata is excluded
// entirely.

function parseVersion(value) {
  if (typeof value !== "string") {
    return null
  }
  // Semver's own grammar: no leading zeros, no empty identifiers, no surrounding space. A
  // looser pattern makes 01.2.0 and 1.2.0 compare equal, so a real newer release can lose.
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
      value,
    )
  if (!match) {
    return null
  }
  const prerelease = match[4]
    ? match[4].split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : part))
    : []
  return { parts: [Number(match[1]), Number(match[2]), Number(match[3])], prerelease }
}

function compareIdentifiers(a, b) {
  const aNumeric = typeof a === "number"
  const bNumeric = typeof b === "number"
  if (aNumeric && bNumeric) {
    return Math.sign(a - b)
  }
  // Numeric identifiers always rank lower than alphanumeric ones.
  if (aNumeric !== bNumeric) {
    return aNumeric ? -1 : 1
  }
  return a < b ? -1 : a > b ? 1 : 0
}

export function compareVersions(a, b) {
  const va = parseVersion(a)
  const vb = parseVersion(b)
  if (!va || !vb) {
    return null
  }
  for (let i = 0; i < 3; i += 1) {
    if (va.parts[i] !== vb.parts[i]) {
      return Math.sign(va.parts[i] - vb.parts[i])
    }
  }
  if (va.prerelease.length === 0 || vb.prerelease.length === 0) {
    if (va.prerelease.length === vb.prerelease.length) {
      return 0
    }
    return va.prerelease.length === 0 ? 1 : -1
  }
  const shared = Math.min(va.prerelease.length, vb.prerelease.length)
  for (let i = 0; i < shared; i += 1) {
    const result = compareIdentifiers(va.prerelease[i], vb.prerelease[i])
    if (result !== 0) {
      return result
    }
  }
  return Math.sign(va.prerelease.length - vb.prerelease.length)
}

// --- the decision -----------------------------------------------------------

export function decideBanner(version, manifest) {
  const unchecked = { kind: "unchecked", text: UNCHECKED_TEXT }

  if (!manifest || typeof manifest !== "object") {
    return unchecked
  }

  // Read before anything else can rule it out. Docs moving is the one thing the manifest must
  // always be able to say to a page that is already frozen, so no other check may silence it.
  if (manifest.notice !== undefined && manifest.notice !== null) {
    const notice = manifest.notice
    if (typeof notice !== "object" || typeof notice.text !== "string" || !notice.text) {
      // The manifest spoke and this page could not read it. Saying nothing would be the claim
      // that there is nothing to say.
      return unchecked
    }
    return { kind: "notice", text: notice.text, url: safeUrl(notice.url) }
  }

  // The version is the package's own data. A package that does not use semver simply cannot
  // take part in this comparison, which is a site without the feature rather than a check that
  // went wrong — the same reading as a manifest that 404s.
  const own = parseVersion(version)
  if (!own) {
    return null
  }

  if (!Array.isArray(manifest.versions)) {
    return unchecked
  }

  // What counts as newer depends on the reader's own version: a stable reader is told only
  // about a newer stable, because nudging them onto an alpha is worse than leaving them alone.
  // A reader already on a prerelease is told about anything newer.
  const ownIsPrerelease = own.prerelease.length > 0

  const entries = versionEntries(manifest, null)
  const readable = entries.length

  let newest = null
  let skippedPrerelease = false
  for (const entry of entries) {
    if (compareVersions(entry.version, version) !== 1) {
      continue
    }
    if (!ownIsPrerelease && parseVersion(entry.version).prerelease.length > 0) {
      // Not pointed at, but not forgotten either: it is why this page may not call itself the
      // latest release outright.
      skippedPrerelease = true
      continue
    }
    if (newest === null || compareVersions(entry.version, newest) === 1) {
      newest = entry.version
    }
  }

  // A list that named releases none of which could be read is a manifest this page cannot
  // interpret, not a site with nothing newer on it.
  if (readable === 0 && manifest.versions.length > 0) {
    return unchecked
  }

  if (newest !== null) {
    return { kind: "superseded", version: newest }
  }

  return { kind: "current", latestKind: skippedPrerelease ? "stable" : "release" }
}

// One reading of the versions list, used by both the decision and the picker.
//
// An entry is either a bare version, which lives under the site root, or an object that names
// its own URL. That is the difference between a manifest that can only say the documentation
// moved and one that can still route every reader to it: the page has no other way to learn a
// new address, because the one it was built with is in its HTML and cannot be changed.
export function versionEntries(manifest, siteRoot) {
  if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.versions)) {
    return []
  }
  // A whole site that has moved says so once here, rather than on every entry.
  const root = withTrailingSlash(safeUrl(manifest.siteRoot)) || siteRoot

  const entries = []
  for (const candidate of manifest.versions) {
    const version = typeof candidate === "string" ? candidate : candidate && candidate.version
    if (parseVersion(version) === null) {
      continue
    }
    const named = typeof candidate === "object" && candidate !== null ? withTrailingSlash(safeUrl(candidate.url)) : null
    entries.push({ version, url: named || (root ? `${root}${version}/` : null) })
  }
  return entries.sort((a, b) => compareVersions(b.version, a.version))
}

// Kept for the picker's labels, which need nothing but the names.
export function orderedVersions(manifest, siteRoot) {
  return versionEntries(manifest, siteRoot).map((entry) => entry.version)
}

// --- where the banner points ------------------------------------------------

// Only ever an http(s) link. The manifest arrives over the network, and `javascript:` or
// `data:` in an href would execute in the documentation's own origin on a page that can never
// be corrected.
function withTrailingSlash(url) {
  if (!url) {
    return null
  }
  return url.endsWith("/") ? url : `${url}/`
}

function safeUrl(value) {
  if (typeof value !== "string") {
    return null
  }
  return /^https?:\/\//i.test(value) ? value : null
}

export function newerVersionUrls(base, pagePath) {
  return { root: base, deep: pagePath ? `${base}${pagePath}` : base }
}

function pagePathWithinRelease(siteRoot, version, href) {
  const prefix = `${siteRoot}${version}/`
  return href.startsWith(prefix) ? href.slice(prefix.length) : ""
}

// --- the page ---------------------------------------------------------------

function readBakedFacts() {
  const source = document.querySelector("[data-docs-version][data-docs-manifest]")
  if (!source) {
    return null
  }
  const version = source.getAttribute("data-docs-version")
  const manifestUrl = source.getAttribute("data-docs-manifest")
  if (!version || !manifestUrl) {
    return null
  }
  return { version, manifestUrl, siteRoot: manifestUrl.replace(/versions\.json$/, "") }
}

function showBanner(variant, text, href, linkText) {
  const banner = document.createElement("div")
  banner.className = `docs-banner docs-banner-${variant}`
  banner.setAttribute("role", "status")
  banner.textContent = text
  if (href) {
    const link = document.createElement("a")
    link.href = href
    link.textContent = linkText || "Go to the current documentation"
    banner.append(" ", link)
  }
  document.body.insertBefore(banner, document.body.firstChild)
  return banner
}

// Which versions the picker may offer. Below two there is nothing to choose between — the
// reader's own version is one of them — so the banner goes out without a picker rather than
// with a control that leads nowhere.
export function pickerEntries(entries) {
  const reachable = entries.filter((entry) => entry.url)
  return reachable.length < 2 ? [] : reachable
}

// A select rather than a list of links: every release ever published ends up in here, and the
// banner has to stay one line.
function addVersionPicker(banner, facts, entries) {
  const reachable = pickerEntries(entries)
  if (reachable.length === 0) {
    return
  }
  const picker = document.createElement("select")
  picker.className = "docs-banner-picker"
  picker.setAttribute("aria-label", "Choose a documentation version")

  for (const entry of reachable) {
    const option = document.createElement("option")
    option.value = entry.version
    option.textContent = entry.version === facts.version ? `${entry.version} (this page)` : entry.version
    option.selected = entry.version === facts.version
    picker.append(option)
  }
  // The page's own version may have been unpublished from the manifest, in which case nothing
  // above is selected and the picker would silently show someone else's version as current.
  if (!reachable.some((entry) => entry.version === facts.version)) {
    const option = document.createElement("option")
    option.value = facts.version
    option.textContent = `${facts.version} (this page)`
    option.selected = true
    picker.insertBefore(option, picker.firstChild)
  }

  picker.addEventListener("change", async () => {
    const chosen = reachable.find((entry) => entry.version === picker.value)
    if (!chosen || chosen.version === facts.version) {
      return
    }
    const target = await resolvableTarget(facts, chosen)
    if (target) {
      window.location.href = target
    }
  })
  banner.append(" ", picker)
}

async function fetchManifest(manifestUrl) {
  const response = await fetch(manifestUrl, { cache: "no-cache" })
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error(`manifest request failed with ${response.status}`)
  }
  return response.json()
}

// The same page under another version where it still exists, and that version's root where it
// does not. Resolved by asking, because only the server knows which pages a release has.
async function resolvableTarget(facts, entry) {
  if (!entry || !entry.url) {
    return null
  }
  const urls = newerVersionUrls(
    entry.url,
    pagePathWithinRelease(facts.siteRoot, facts.version, window.location.href),
  )
  if (urls.deep === urls.root) {
    return urls.root
  }
  try {
    const response = await fetch(urls.deep, { method: "HEAD" })
    return response.ok ? urls.deep : urls.root
  } catch {
    // Another host may refuse the probe outright; the version's own root still resolves.
    return urls.root
  }
}

// The banner is shown pointing at the newer version's root, which always exists, and the link
// is then upgraded to the same page under that version if it is still there. Done this way
// round the reader never waits on the second request, and never sees a link that 404s.
async function preferTheSamePage(banner, facts, entry) {
  const link = banner.querySelector("a")
  if (!link) {
    return
  }
  const target = await resolvableTarget(facts, entry)
  if (target) {
    link.href = target
  }
}

async function checkForNewerVersion() {
  const facts = readBakedFacts()
  if (!facts) {
    return
  }

  let manifest
  try {
    manifest = await fetchManifest(facts.manifestUrl)
  } catch {
    showBanner("unchecked", UNCHECKED_TEXT)
    return
  }
  if (manifest === null) {
    return
  }

  const decision = decideBanner(facts.version, manifest)
  if (decision === null) {
    return
  }
  if (decision.kind === "unchecked") {
    showBanner("unchecked", decision.text)
    return
  }
  if (decision.kind === "notice") {
    showBanner("notice", decision.text, decision.url)
    return
  }

  const entries = versionEntries(manifest, facts.siteRoot)

  if (decision.kind === "current") {
    addVersionPicker(showBanner("current", currentText(facts.version, decision.latestKind)), facts, entries)
    return
  }

  const target = entries.find((entry) => entry.version === decision.version)

  const banner = showBanner(
    "superseded",
    `This documents version ${facts.version}. Version ${decision.version} is newer.`,
    target ? target.url : null,
    `Go to ${decision.version}`,
  )
  addVersionPicker(banner, facts, entries)
  await preferTheSamePage(banner, facts, target)
}

function whenReady(run) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true })
  } else {
    run()
  }
}

// Guarded so the decision rules above can be imported and tested without a browser.
if (typeof document !== "undefined") {
  whenReady(checkForNewerVersion)
}

export default {}
