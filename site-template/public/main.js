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
// once this feature exists, rendering nothing is the claim that nothing newer was found.

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

async function fetchManifest(manifestUrl) {
  const response = await fetch(manifestUrl, { cache: "no-cache" })
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
