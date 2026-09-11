# Changelog
All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-09-12
### Added
- `site_root_url` input. Set it to the root of the documentation site when the site publishes one folder per release, so that `base_url` points at a release's own folder and this points at the root above it. The version manifest the superseded-version banner reads is resolved against it as `<site_root_url>versions.json`, and that absolute URL is baked into every built page. Left empty, no banner is baked.
- `home_url` input. An absolute URL baked into every page as a permanent link home. It is a link and never a fetch, so it keeps working from a page whose site has been retired. Left empty, no link is baked.
- A site template shipped with the action, published as `public/main.js` and `public/main.css`. The script reads the facts baked into the page and fetches the version manifest. A 404 is taken as the site publishing no manifest and passes quietly; any other failure is inconclusive and the page says the check did not run.
- The generated `docfx.json` is checked for validity before the build. Four steps insert into it by line number, and nothing else would catch an insert that landed wrong.

### Changed
- The page footer now carries the package version from `package.json`. This happens whether or not the new inputs are set.

## [1.1.0] - 2026-09-11
### Added
- `base_url` input. Set it to the public base URL of the built site when the site is deployed to a different repository than the one the workflow runs in, or when the running repository has no Pages configuration to read. It is used both in the generated `docfx.json` (`sitemap`, `xref`) and in the meta refresh written into the built `index.html`. Left empty, the URL is read from the running repository's Pages configuration as before.

## [1.0.0] - 2023-06-05
### This is the first release of *docfx-unitypackage*.
DocFX Unity package is a GitHub action for deploying a DocFX website for Unity packages to GitHub Pages.