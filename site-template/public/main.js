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

const MANIFEST_SCHEMA = 1

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
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value.trim())
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

  const own = parseVersion(version)
  if (!own || !manifest || typeof manifest !== "object") {
    return unchecked
  }
  // A manifest written to a shape this page predates cannot be read, and a page that cannot
  // read it must not imply it is up to date.
  if (manifest.schemaVersion !== MANIFEST_SCHEMA || !Array.isArray(manifest.versions)) {
    return unchecked
  }

  // Docs moving is a positive statement the manifest made, rather than something inferred from
  // a failure, and it outranks being merely superseded.
  const notice = manifest.notice
  if (notice && typeof notice === "object" && typeof notice.text === "string" && notice.text) {
    return { kind: "notice", text: notice.text, url: typeof notice.url === "string" ? notice.url : null }
  }

  // What counts as newer depends on the reader's own version: a stable reader is told only
  // about a newer stable, because nudging them onto an alpha is worse than leaving them alone.
  // A reader already on a prerelease is told about anything newer.
  const ownIsPrerelease = own.prerelease.length > 0

  // Computed from `versions` rather than read from `latestStable`: this page can never be
  // corrected, so it does not depend on a summary field being right.
  let newest = null
  for (const candidate of manifest.versions) {
    const parsed = parseVersion(candidate)
    if (!parsed) {
      continue
    }
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

  return newest === null ? null : { kind: "superseded", version: newest }
}

// --- where the banner points ------------------------------------------------

export function newerVersionUrls(siteRoot, version, pagePath) {
  const root = `${siteRoot}${version}/`
  return { root, deep: pagePath ? `${root}${pagePath}` : root }
}

export function pagePathWithinRelease(siteRoot, version, href) {
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

function showBanner(variant, text, href) {
  const banner = document.createElement("div")
  banner.className = `docs-banner docs-banner-${variant}`
  banner.setAttribute("role", "status")
  banner.textContent = text
  if (href) {
    const link = document.createElement("a")
    link.href = href
    link.textContent = "Go to the current documentation"
    banner.append(" ", link)
  }
  document.body.insertBefore(banner, document.body.firstChild)
  return banner
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

// The banner is shown pointing at the newer version's root, which always exists, and the link
// is then upgraded to the same page under that version if it is still there. Done this way
// round the reader never waits on the second request, and never sees a link that 404s.
async function preferTheSamePage(banner, urls) {
  const link = banner.querySelector("a")
  if (!link) {
    return
  }
  try {
    const response = await fetch(urls.deep, { method: "HEAD" })
    if (response.ok) {
      link.href = urls.deep
    }
  } catch {
    // The fallback is already in place.
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

  const urls = newerVersionUrls(
    facts.siteRoot,
    decision.version,
    pagePathWithinRelease(facts.siteRoot, facts.version, window.location.href),
  )
  const banner = showBanner(
    "superseded",
    `This documents version ${facts.version}. Version ${decision.version} is newer.`,
    urls.root,
  )
  if (urls.deep !== urls.root) {
    await preferTheSamePage(banner, urls)
  }
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
