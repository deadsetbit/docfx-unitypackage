# Changelog
All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [1.7.0] - 2026-09-27
### Changed
- The `current` banner reads "This is the latest version.", or "This is the latest stable version." when a newer prerelease exists, followed by the picker. It names the version in the text only when there is no picker to show it.
- The `superseded` banner reads "This is not the latest version." with a link reading "Go to latest version X".
- The picker no longer labels the page's own version "(this page)". Being the selected option already says so.
- The picker comes first in the banner, before the text. On a screen too narrow for both, the text moves under the picker as a whole instead of leaving its last word on a line of its own, and the link wraps as one piece.
- A banner that ends in a link ends in a full stop.

## [1.6.0] - 2026-09-19
### Changed
- Every banner variant is pinned to the bottom of the viewport, not only `superseded` and `notice`. Which version a page documents, and the picker for changing it, are worth a line of viewport wherever the reader is in the page, and a banner that pins or not depending on whether a network fetch succeeded is a layout that changes for reasons the reader cannot see.
- `current` has an opaque background. It was transparent, which read fine in flow and would not over a page scrolling underneath it. It takes the page's own background in either theme.

## [1.5.1] - 2026-09-19
### Fixed
- The canonical step no longer fails the build on Python older than 3.13. It passed `newline=""` to `Path.read_text` and `Path.write_text`, which only accept it from 3.13, so the step raised `TypeError` on the 3.12 that `ubuntu-latest` ships and took the build with it. It goes through `Path.open` now, which has always accepted it.

## [1.5.0] - 2026-09-19
### Added
- Every built page carries a `<link rel="canonical">` naming its own path under `<site_root_url>latest/`. A version folder is never rebuilt, so the only address it can name that still resolves after the next release is a moving one. Requires `site_root_url`; without it there are no version folders and nothing to alias.

### Changed
- The `superseded` and `notice` banners are pinned to the bottom of the viewport and stay there while the reader scrolls. Both were previously inserted at the top of the document, where a reader arriving on an anchored deep link never saw them at all: the browser jumps to the heading on first paint. `current` and `unchecked` are unchanged, because neither asks the reader to do anything.
- The banner and the picker recognise a page served from `<site_root_url>latest/`, not only one served from its own version folder. Both address the same build, and the alias is what a shared link uses, so a reader who arrived that way and then picks another version now gets the same page under it rather than that version's front door.
- Version numbers are bold in the banner. They are built as elements rather than markup, because one of the strings rendered this way is a `notice`'s text, which arrives over the network from the manifest.

## [1.4.0] - 2026-09-12
### Changed
- The banner renders on every page, not only where the documentation is superseded. A reader who is current sees a discreet line naming the version the page documents, and the version picker — previously reachable only from a page already out of date, though the newest page is where someone looking for an older release starts.
- A page that is the newest **stable** release while a newer prerelease exists says "the latest stable release" rather than "the latest release". It still does not link to the prerelease: which releases a reader is pointed at has not changed.
- A manifest whose `versions` is an empty list renders no banner and warns in the browser console instead. It names no releases while the page reading it is itself one, so nothing true can be said from it, and no reader can act on it. A `notice` is still shown from such a manifest — a frozen page must always be able to hear that the documentation moved.
- Silence now means one thing: the page has nothing it can truthfully say. A manifest that 404s, a version that is not semver, and a manifest naming no releases all render nothing. It no longer means the reader is up to date — that is said out loud.

## [1.3.0] - 2026-09-12
### Added
- The banner now reads the manifest and says when the documentation being read has been superseded. What counts as newer depends on the reader's own version: a page documenting a stable release names only a newer stable release, while a page documenting a prerelease names any newer release. The banner links to the same page under the newer version, falling back to that version's root when the page is not there.
- A manifest may carry a `notice` (`{"text": ..., "url": ...}`), shown in place of the superseded banner. It is how documentation that has genuinely moved or been retired says so — a statement the manifest makes, never inferred from a failed request.
- A compact version picker in the banner, listing every version the manifest names, so a reader can reach any release rather than only the newest.
- The manifest decides where each version lives, not just which versions exist. An entry may be `{"version": ..., "url": ...}`, and an optional top-level `siteRoot` replaces the root bare entries resolve against. A published page can only fetch the manifest from the address baked into its own HTML, so the old location must keep serving that one file — but everything it points at can move, and the banner and picker then route readers to wherever the documentation went.
- A manifest the page cannot read — no `versions` array, nothing readable in it, or a malformed `notice` — is reported as a check that did not run. Silence means "nothing newer exists", so it cannot also mean "this could not be read". Unknown keys are ignored, so the manifest can gain fields without silencing pages already published.
- A `notice` link is followed only when it is `http(s)`. The manifest arrives over the network, and a `javascript:` or `data:` href would execute in the documentation's own origin on a page that can never be corrected.
- A package whose version is not semver takes no part in the comparison and shows nothing, rather than warning on every page forever.
- `node --test` unit tests for the comparison rules, run in CI on every push. The rules are frozen into each page as it is published, so they are the part of the action that can never be corrected for documentation already out.

### Changed
- `main.js` exports its decision functions so they can be tested without a browser. The page still self-starts when a `document` exists.

## [1.2.0] - 2026-09-12
### Added
- `site_root_url` input. Set it to the root of the documentation site when the site publishes one folder per release, so that `base_url` points at a release's own folder and this points at the root above it. The version manifest the superseded-version banner reads is resolved against it as `<site_root_url>versions.json`, and that absolute URL is baked into every built page. Left empty, no banner is baked.
- `home_url` input. An absolute URL baked into every page as a permanent link home. It is a link and never a fetch, so it keeps working from a page whose site has been retired. Left empty, no link is baked.
- A site template shipped with the action, published as `public/main.js` and `public/main.css`. The script reads the facts baked into the page and fetches the version manifest. A 404 is taken as the site publishing no manifest and passes quietly; any other failure is inconclusive and the page says the check did not run.
- The generated `docfx.json` is checked before the build: it must parse, and each key the five line-numbered inserts add must sit in the object its step aimed at. Nothing else would catch an insert that landed wrong.

### Changed
- The page footer now carries the package version from `package.json`. This happens whether or not the new inputs are set.

## [1.1.0] - 2026-09-11
### Added
- `base_url` input. Set it to the public base URL of the built site when the site is deployed to a different repository than the one the workflow runs in, or when the running repository has no Pages configuration to read. It is used both in the generated `docfx.json` (`sitemap`, `xref`) and in the meta refresh written into the built `index.html`. Left empty, the URL is read from the running repository's Pages configuration as before.

## [1.0.0] - 2023-06-05
### This is the first release of *docfx-unitypackage*.
DocFX Unity package is a GitHub action for deploying a DocFX website for Unity packages to GitHub Pages.