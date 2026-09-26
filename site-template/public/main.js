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
// Once there is a readable manifest and a version to compare, the banner always renders. The
// picker it carries is the only route between releases, and the current page is where a reader
// looking for an older one starts.
//
// A 404 is the exception, and the only failure the page can read anything into: the server
// answered, and what it said is that this site publishes no manifest. That is a site without
// the feature rather than a check that went wrong, so it stays quiet. Every other failure is
// inconclusive and says so.

const UNCHECKED_TEXT = "The check for a newer version of this documentation did not run."

// --- what the banner says ---------------------------------------------------
//
// Segments rather than one string, because the version numbers are bold and a bold run inside
// text has to be built as an element. Not innerHTML: one of the strings rendered here is a
// notice's text, which arrives over the network from the manifest, and markup injected into a
// page that can never be rebuilt can never be taken out again.

const plain = (text) => ({ text, bold: false })
const strong = (text) => ({ text, bold: true })

// A stable reader is never pointed at a newer prerelease, so on that page only the narrower
// claim is true. The picker beside the text shows the page's own version as its selection, so
// the text names the version only when there is no picker to show it.
export function currentSegments(version, latestKind, namesVersion) {
  const label = latestKind === "stable" ? "This is the latest stable version" : "This is the latest version"
  return namesVersion ? [plain(`${label}, `), strong(version), plain(".")] : [plain(`${label}.`)]
}

// The newer version is named by the link that follows.
export function supersededSegments() {
  return [plain("This is not the latest version.")]
}

export function supersededLinkText(newer) {
  return `Go to latest version ${newer}`
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

  // A manifest naming no releases contradicts the page reading it, which is one. Nothing true
  // can be said from it, and no reader can fix it, so it goes to the console instead.
  if (manifest.versions.length === 0) {
    return { kind: "unusable" }
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
      // Not pointed at, but it is why this page cannot call itself the latest release.
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

// A page is served both from its own version folder and from the alias the site publishes
// beside them, and the alias is the address shared links use. Both address the same build, so
// either prefix answers the question the picker is asking: which page is the reader on.
export function pagePathWithinRelease(siteRoot, version, href) {
  for (const prefix of [`${siteRoot}${version}/`, `${siteRoot}latest/`]) {
    if (href.startsWith(prefix)) {
      return href.slice(prefix.length)
    }
  }
  return ""
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

function showBanner(variant, segments, href, linkText) {
  const banner = document.createElement("div")
  banner.className = `docs-banner docs-banner-${variant}`
  banner.setAttribute("role", "status")
  // One box for the text, so on a narrow screen it wraps under the picker as a whole rather
  // than leaving its last word on a line of its own.
  const text = document.createElement("span")
  text.className = "docs-banner-text"
  for (const segment of segments) {
    if (segment.bold) {
      const bold = document.createElement("strong")
      bold.textContent = segment.text
      text.append(bold)
    } else {
      text.append(segment.text)
    }
  }
  if (href) {
    const link = document.createElement("a")
    link.href = href
    link.textContent = linkText || "Go to the current documentation"
    text.append(" ", link, ".")
  }
  banner.append(text)
  // Last in the body, which is what lets the stylesheet pin it: sticky reserves its space
  // where the element sits, so from here it comes to rest under the footer at the end of the
  // page rather than covering it.
  document.body.append(banner)
  return banner
}

// Below two there is nothing to choose between, the reader's own version being one of them.
export function pickerEntries(entries) {
  const reachable = entries.filter((entry) => entry.url)
  return reachable.length < 2 ? [] : reachable
}

// A select rather than a list of links: every release ever published ends up in here, and the
// banner has to stay one line. It leads the banner, so it stays in one place whatever the text
// beside it says.
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
    option.textContent = entry.version
    option.selected = entry.version === facts.version
    picker.append(option)
  }
  // The page's own version may have been unpublished from the manifest, in which case nothing
  // above is selected and the picker would silently show someone else's version as current.
  if (!reachable.some((entry) => entry.version === facts.version)) {
    const option = document.createElement("option")
    option.value = facts.version
    option.textContent = facts.version
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
  banner.prepend(picker, " ")
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
    showBanner("unchecked", [plain(UNCHECKED_TEXT)])
    return
  }
  if (manifest === null) {
    return
  }

  const decision = decideBanner(facts.version, manifest)
  if (decision === null) {
    return
  }
  if (decision.kind === "unusable") {
    console.warn(
      `Version banner: the manifest at ${facts.manifestUrl} names no versions, so this page cannot say whether it is current.`,
    )
    return
  }
  if (decision.kind === "unchecked") {
    showBanner("unchecked", [plain(decision.text)])
    return
  }
  if (decision.kind === "notice") {
    showBanner("notice", [plain(decision.text)], decision.url)
    return
  }

  const entries = versionEntries(manifest, facts.siteRoot)

  if (decision.kind === "current") {
    const namesVersion = pickerEntries(entries).length === 0
    addVersionPicker(
      showBanner("current", currentSegments(facts.version, decision.latestKind, namesVersion)),
      facts,
      entries,
    )
    return
  }

  const target = entries.find((entry) => entry.version === decision.version)

  const banner = showBanner(
    "superseded",
    supersededSegments(),
    target ? target.url : null,
    supersededLinkText(decision.version),
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
