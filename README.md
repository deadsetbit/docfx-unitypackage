<!--
*** Thanks for checking out the Best-README-Template. If you have a suggestion
*** that would make this better, please fork the repo and create a pull request
*** or simply open an issue with the tag "enhancement".
*** Don't forget to give the project a star!
*** Thanks again! Now go create something AMAZING! :D
-->
<!--
*** I'm using markdown "reference style" links for readability.
*** Reference links are enclosed in brackets [ ] instead of parentheses ( ).
*** See the bottom of this document for the declaration of the reference variables
*** for contributors-url, forks-url, etc. This is an optional, concise syntax you may use.
*** https://www.markdownguide.org/basic-syntax/#reference-style-links
-->



<div align="center">
  <!-- PROJECT LOGO -->
  <h2>DocFX Unity package</h2>

  <a href="https://cubusky.github.io/com.cubusky.core/manual/AttributeSerialization/ReferenceDropdownAttribute.html">
    <img src="https://github.com/CaseyHofland/docfx-unitypackage/assets/27729987/bad8597b-2520-4bd8-9022-55553f004faf" alt="logo" target="_blank"/>
  </a>

  ***
  
  <p>
    GitHub Action for deploying a DocFX website for Unity packages to Github Pages.
    <br/>
    <a href="https://github.com/CaseyHofland/docfx-unitypackage/issues">Report Bug</a>
    ·
    <a href="https://github.com/CaseyHofland/docfx-unitypackage/issues">Request Feature</a>
  </p>
  
  
  
  <!-- PROJECT SHIELDS -->
  [![MIT License][license-shield]][license-url]
  [![Release][release-shield]][release-url]
  [![Release Date][release-date-shield]][release-date-url]
</div>



<!-- ABOUT THE PROJECT -->
### About DocFX Unity package

DocFX Unity package is a GitHub action for deploying a DocFX website for Unity packages to GitHub Pages. These days, Unity maintains a lot of [optional packages](https://docs.unity3d.com/Manual/pack-safe.html) containing [great documentation](https://docs.unity3d.com/Packages/com.unity.cinemachine@2.9/manual/). This action's goal is to allow you to easily build documentation for Unity packages published on GitHub. It aims to mimic [Unity's documentation workflow][workflow-url] while keeping the native benefits of [DocFX][docfx-url].



<!-- Installation -->
## Installation

1. In the GitHub of your Unity package, create a branch called "gh-pages".
2. Go to the Settings tab, select "Pages" in the table on the left, then select "Deploy from a Branch" and select "gh-pages" as the branch to deploy from.
3. Go to the Actions tab, select "set up a workflow yourself", then copy and paste the following code:
```yaml
name: docfx-unitypackage

on:
  workflow_dispatch:
  push:
    branches:
      - main

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          submodules: true

      - name: Build
        uses: CaseyHofland/docfx-unitypackage@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}

      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_branch: gh-pages
          publish_dir: _site
```

Every time you push to main, this action will run and your site will get automatically updated with any documentation or API changes.

### Prerequisites

Your repository should be a [Unity package](https://docs.unity3d.com/Manual/cus-layout.html).

Specifically, the root of your project should contain:
- `package.json`
- `CHANGELOG.md` [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
- either `LICENSE` or `LICENSE.md`
- either `README.md` or `Documentation~/index.md`



<!-- USAGE -->
## Usage

### Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `github_token` | no | | Token used to read the running repository's Pages configuration. |
| `base_url` | no | *(empty)* | Public base URL of the built site, with a trailing slash, for example `https://owner.github.io/repo/`. |
| `site_root_url` | no | *(empty)* | Root of the documentation site, with a trailing slash, for example `https://owner.github.io/repo/`. Only differs from `base_url` when the site publishes one folder per release. |
| `home_url` | no | *(empty)* | Absolute URL baked into every page as a permanent link home. |

`base_url` is what to set when the site is **deployed to a different repository than the one the workflow runs in**, or when the running repository has no Pages configuration to read — a private repository on a plan without Pages, for instance. It is used in both places the action needs the site's own address: the `sitemap`/`xref` entries of the generated `docfx.json`, and the meta refresh written into the built `index.html`.

Left empty, the URL is read from the running repository's Pages configuration exactly as before, so existing workflows need no change.

```yaml
      - name: Build
        uses: CaseyHofland/docfx-unitypackage@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          base_url: https://owner.github.io/other-repo/
```

### Version-pinned sites

A site that publishes one folder per release needs two addresses, not one. `base_url` is the
release's own folder — where this build is being deployed — and `site_root_url` is the root
above it, shared by every release.

Set `site_root_url` and each built page carries its own version and the absolute URL of a
version manifest, `<site_root_url>versions.json`, as static HTML in the footer. The shipped
`public/main.js` fetches that manifest on load and reports when it could not.

What the page *says* about a newer version is not part of this: publishing the manifest, and
comparing against it, belong to the site. The action's job is to bake in the version and the
address, because those are frozen into a page the moment it is published and everything else
can be served later.

Baking the absolute URL, rather than computing a relative one, is deliberate: an API
reference page sits three levels below the root and the index sits at it, so a relative path
would need a different number of `../` per page and would break silently on the pages nobody
opens.

The fetch can fail for entirely ordinary reasons — the reader is offline, a proxy blocks it,
the host hiccups — and a page cannot tell any of that from a site that is genuinely gone. So
a failed check says only that the check did not run, and claims nothing about the
documentation having moved.

A 404 is the exception, and the only failure worth reading anything into: the server
answered, and what it said is that this site publishes no manifest. That is a site without
the feature rather than a check that went wrong, so the page stays quiet — which is also what
lets a site adopt the banner before it starts publishing a manifest.

When the manifest does load, the page compares its own baked version against the versions it
lists. A page documenting a stable release names only a newer **stable** release; a page
documenting a prerelease names any newer release, stable or not. The banner links to the same
page under the newer version where it still exists, and to that version's root where it does
not. A manifest may also carry a `notice`, which is shown instead and is how documentation that
has moved or been retired says so.

When nothing newer applies the banner still renders, quietly. It names the version the page
documents and calls it the latest release — or the latest **stable** release, when a newer
prerelease exists that a stable reader is deliberately not being sent to. A page that showed
nothing here would be the one page carrying no way to reach another release's documentation.

The manifest is the only mutable input, so it is the only thing that can teach an
already-published page something new. Another repository writes it, so its shape is a contract:

```json
{
  "siteRoot": "https://example.com/docs/",
  "versions": [
    "1.3.0",
    "1.4.0",
    {"version": "1.5.0-rc.1", "url": "https://example.com/preview/1.5.0-rc.1/"}
  ],
  "latestStable": "1.4.0",
  "notice": {"text": "These docs have moved.", "url": "https://example.com/docs"}
}
```

- `versions` is required. An entry is either a bare semver version, which is also the name of
  the folder that release is published in, or an object with that `version` and the `url` it
  lives at. `v1.0.0` or `latest` are not versions and are ignored. A manifest whose `versions`
  is missing, is not an array, or names nothing readable makes the page report a check it could
  not run, rather than imply the reader is up to date.
- `siteRoot` is optional and replaces the root every bare entry is resolved against. **This is
  what makes the documentation relocatable.** A page can only ever fetch the manifest from the
  address baked into its own HTML, so the old location must keep serving this one file — but
  everything that file points at can move. Without it a manifest can only say the documentation
  moved; with it, the banner and the picker route every reader to where it went.
- `latestStable` is informational. Each page recomputes what is newest from `versions`, because
  a page that is already published can never be corrected if this is ever wrong.
- `notice` is optional. When present it must be an object with a non-empty `text`, and is shown
  instead of the superseded banner — it is how documentation that has moved or been retired
  says so. A `notice` that is present but malformed is reported as a check that did not run,
  never skipped silently.
- Every URL the manifest supplies — `siteRoot`, an entry's `url`, and the notice's `url` — is
  used only when it is `http(s)`, and anything else falls back to the page's own site root.
  The manifest arrives over the network and these become links.
- Unknown keys are ignored, so the manifest can gain fields without silencing pages already
  published. That is the whole reason a page tolerates rather than validates it.

The banner carries a compact version picker listing every version the manifest names, so a
reader can reach any release rather than only the newest — on the current release's pages as
much as on a superseded one's, that being where someone looking for older documentation starts.
Choosing one goes to the same page under that version where it exists, and to that version's
root where it does not. Below two reachable versions the picker is left off, there being nowhere
else to go.

`home_url` is the escape hatch that does not depend on any of this working. It is baked into
every page as a plain link, so it survives with the HTML and needs no fetch, no CORS and no
uptime from whatever it points at.

```yaml
      - name: Build
        uses: deadsetbit/docfx-unitypackage@v1.2.0
        with:
          base_url: https://owner.github.io/repo/1.4.0/
          site_root_url: https://owner.github.io/repo/
          home_url: https://example.com
```

DocFX Unity package has been specifically designed to mimic the affordances and limitations of the [Package Manager DocTools@2.1][workflow-url]. In theory, you should be able to use the documentation of the version 2.1 tools and everything should work exactly the same, except for the following differences:
- DocFX Unity package is forgiving to beginners. All that is required by the [Package Manager DocTools@2.1][workflow-url] is optional, though strongly recommended.
- To add a custom logo and favicon to the generated website, add a file called `logo` and `favicon` inside the `Documentation~/images/` folder. The recommended logo height is 50px.
- When you don't have a `TableOfContents.md` in your `Documentation~`, the manual will be created without a table of contents. This may be preferrable for single-page documentation.
- [Unity's per-package metadata](https://docs.unity3d.com/Packages/com.unity.package-manager-doctools@2.1/manual/package-metadata.html), the values you can override in `projectMetadata.json`, are different from [DocFX's per-package metadata](https://dotnet.github.io/docfx/docs/template.html?tabs=modern#template-metadata).
- Currently, `config.json` does nothing and preprocessor directives are not generated.

If there are any other changes not listed here, please [open an issue][issues-url] to propose it be added to the docs.



<!-- RESOURCES -->
## Resources

### Documentation Guides

- [Package documentation guides](https://docs.unity.cn/Packages/com.unity.services.wire@1.1//manual/)
- [Documenting your package](https://docs.unity3d.com/Manual/cus-document.html)
- [Unity Style Guide](https://docs-style-guide.unity.com/)
- [Microsoft Style Guide](https://learn.microsoft.com/en-us/style-guide/welcome/)

### Examples

- [Unity Clock](https://caseyhofland.github.io/com.caseyhofland.unityclock/manual/)


<!-- ROADMAP -->
## Roadmap

**High Priority:**
- [x] Support preprocessor directives
- [ ] Unity API references
- [ ] Dependencies API references
- [ ] Versioned Documentation

**Low Priority:**
- [ ] Customization options

See the [open issues][issues-url] for a full list of proposed features (and known issues).



<!-- CONTRIBUTING -->
## Contributing

Contributions are always appreciated. You may do so by forking the repo and creating a pull request, or by [opening an issue][issues-url].

1. Fork the Project
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a pull request



<!-- LICENSE -->
## License

Distributed under the MIT License. See `LICENSE` for more information.



<!-- CONTACT -->
## Contact

### Casey Hofland

**Formal:** hofland.casey@gmail.com

**Informal:** [@CaseyHofland](https://mastodon.gamedev.place/@CaseyHofland)



<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->
[license-shield]: https://img.shields.io/github/license/CaseyHofland/docfx-unitypackage.svg
[license-url]: https://github.com/CaseyHofland/docfx-unitypackage/blob/master/LICENSE
[release-shield]: https://img.shields.io/github/release/CaseyHofland/docfx-unitypackage.svg
[release-url]: https://github.com/CaseyHofland/docfx-unitypackage/blob/master/releases/latest
[release-date-shield]: https://img.shields.io/github/release-date/CaseyHofland/docfx-unitypackage.svg
[release-date-url]: https://github.com/CaseyHofland/docfx-unitypackage/releases
[workflow-url]: https://docs.unity3d.com/Packages/com.unity.package-manager-doctools@2.1/manual/developer-notes.html#pmdt
[docfx-url]: https://dotnet.github.io/docfx/
[issues-url]: https://github.com/CaseyHofland/docfx-unitypackage/issues
