// The version banner.
//
// Whatever this file does is frozen into a page the moment that page is published, so it
// holds only the parts that can never be served afterwards: finding the facts the build
// baked into the page, fetching the manifest, and saying so when that fetch does not
// succeed. The manifest is the one mutable input.
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
  return { version, manifestUrl }
}

function showBanner(variant, text) {
  const banner = document.createElement("div")
  banner.className = `docs-banner docs-banner-${variant}`
  banner.setAttribute("role", "status")
  banner.textContent = text
  document.body.insertBefore(banner, document.body.firstChild)
}

const NO_MANIFEST_PUBLISHED = Symbol("no manifest published")

async function fetchManifest(manifestUrl) {
  const response = await fetch(manifestUrl, { cache: "no-cache" })
  if (response.status === 404) {
    return NO_MANIFEST_PUBLISHED
  }
  if (!response.ok) {
    throw new Error(`manifest request failed with ${response.status}`)
  }
  return response.json()
}

async function checkForNewerVersion() {
  const facts = readBakedFacts()
  if (!facts) {
    return
  }
  try {
    await fetchManifest(facts.manifestUrl)
  } catch {
    showBanner("unchecked", "The check for a newer version of this documentation did not run.")
  }
}

function whenReady(run) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true })
  } else {
    run()
  }
}

whenReady(checkForNewerVersion)

export default {}
