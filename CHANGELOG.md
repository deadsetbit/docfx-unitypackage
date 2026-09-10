# Changelog
All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- `base_url` input. Set it to the public base URL of the built site when the site is deployed to a different repository than the one the workflow runs in, or when the running repository has no Pages configuration to read. It is used both in the generated `docfx.json` (`sitemap`, `xref`) and in the meta refresh written into the built `index.html`. Left empty, the URL is read from the running repository's Pages configuration as before.

## [1.0.0] - 2023-06-05
### This is the first release of *docfx-unitypackage*.
DocFX Unity package is a GitHub action for deploying a DocFX website for Unity packages to GitHub Pages.