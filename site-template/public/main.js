// The version banner.
//
// Whatever this file does is frozen into a page the moment that page is published. The manifest
// is the one mutable input, so everything the banner can be taught later has to be a fact the
// manifest states — not logic here. What lives here is the reading of it.
//
// A failed fetch is not evidence that anything moved. The reader may be offline or behind a
// proxy, and a page cannot tell that from a site that is genuinely gone, so the wording for
// that case claims nothing beyond the check not having run. It also does not fall silent:
// once there is a manifest to compare against, rendering nothing is the claim that nothing
// newer was found.
//
// A 404 is the exception, and the only failure the page can read anything into: the server
// answered, and what it said is that this site publishes no manifest. That is a site without
// the feature rather than a check that went wrong, so it stays quiet. Every other failure is
// inconclusive and says so.

const UNCHECKED_TEXT = "The check for a newer version of this documentation did not run."

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

  let readable = 0
  let newest = null
  for (const candidate of manifest.versions) {
    const parsed = parseVersion(candidate)
    if (!parsed) {
      continue
    }
    readable += 1
    if (!ownIsPrerelease && parsed.prerelease.length > 0) {
      continue
    }
    if (compareVersions(candidate, version) !== 1) {
      continue
    }
    if (newest === null || compareVersions(candidate, newest) === 1) {
      newest = candidate
    }
  }

  // A list that named releases none of which could be read is a manifest this page cannot
  // interpret, not a site with nothing newer on it.
  if (readable === 0 && manifest.versions.length > 0) {
    return unchecked
  }

  return newest === null ? null : { kind: "superseded", version: newest }
}

// Every version the manifest names that this page can read, newest first. The banner's
// picker offers these, so a reader can reach any release rather than only the newest.
export function orderedVersions(manifest) {
  if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.versions)) {
    return []
  }
  return manifest.versions
    .filter((candidate) => parseVersion(candidate) !== null)
    .sort((a, b) => compareVersions(b, a))
}

// --- where the banner points ------------------------------------------------

// Only ever an http(s) link. The manifest arrives over the network, and `javascript:` or
// `data:` in an href would execute in the documentation's own origin on a page that can never
// be corrected.
function safeUrl(value) {
  if (typeof value !== "string") {
    return null
  }
  return /^https?:\/\//i.test(value) ? value : null
}

export function newerVersionUrls(siteRoot, version, pagePath) {
  const root = `${siteRoot}${version}/`
  return { root, deep: pagePath ? `${root}${pagePath}` : root }
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

// A select rather than a list of links: every release ever published ends up in here, and the
// banner has to stay one line.
function addVersionPicker(banner, facts, versions) {
  if (versions.length < 2) {
    return
  }
  const picker = document.createElement("select")
  picker.className = "docs-banner-picker"
  picker.setAttribute("aria-label", "Choose a documentation version")

  for (const candidate of versions) {
    const option = document.createElement("option")
    option.value = candidate
    option.textContent = candidate === facts.version ? `${candidate} (this page)` : candidate
    option.selected = candidate === facts.version
    picker.append(option)
  }
  // The page's own version may have been unpublished from the manifest, in which case nothing
  // above is selected and the picker would silently show someone else's version as current.
  if (!versions.includes(facts.version)) {
    const option = document.createElement("option")
    option.value = facts.version
    option.textContent = `${facts.version} (this page)`
    option.selected = true
    picker.insertBefore(option, picker.firstChild)
  }

  picker.addEventListener("change", async () => {
    const target = picker.value
    if (target === facts.version) {
      return
    }
    window.location.href = await resolvableTarget(facts, target)
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
async function resolvableTarget(facts, version) {
  const urls = newerVersionUrls(
    facts.siteRoot,
    version,
    pagePathWithinRelease(facts.siteRoot, facts.version, window.location.href),
  )
  if (urls.deep === urls.root) {
    return urls.root
  }
  try {
    const response = await fetch(urls.deep, { method: "HEAD" })
    return response.ok ? urls.deep : urls.root
  } catch {
    return urls.root
  }
}

// The banner is shown pointing at the newer version's root, which always exists, and the link
// is then upgraded to the same page under that version if it is still there. Done this way
// round the reader never waits on the second request, and never sees a link that 404s.
async function preferTheSamePage(banner, facts, version) {
  const link = banner.querySelector("a")
  if (!link) {
    return
  }
  link.href = await resolvableTarget(facts, version)
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

  const banner = showBanner(
    "superseded",
    `This documents version ${facts.version}. Version ${decision.version} is newer.`,
    `${facts.siteRoot}${decision.version}/`,
    `Go to ${decision.version}`,
  )
  addVersionPicker(banner, facts, orderedVersions(manifest))
  await preferTheSamePage(banner, facts, decision.version)
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
