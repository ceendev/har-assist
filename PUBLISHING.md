# Publishing Har Assist

The extension identity is `yeceen.har-assist`:

- Marketplace publisher ID: `yeceen`.
- Extension name: `har-assist`.
- Source repository: <https://github.com/ceendev/har-assist>.

This identity and its Marketplace presentation are independent from the upstream
project. The README retains the required license attribution and states the
non-affiliation prominently.

## One-time setup

Create a GitHub environment named `marketplace` under **Settings > Environments**.
If deployment restrictions are configured, allow the version tags used for
releases.

Har Assist uses Microsoft Entra ID with GitHub OIDC for long-term publishing; no
stored PAT is required.

1. Configure a user-assigned managed identity in Azure and record its client ID
   and tenant ID.
2. Configure its GitHub federated credential with:
   - Issuer: `https://token.actions.githubusercontent.com`
   - Subject: `repo:ceendev@325867239/har-assist@1359690326:environment:marketplace`
   - Audience: `api://AzureADTokenExchange`
3. Add the managed identity to the Azure DevOps organization connected to the
   Marketplace publisher, with **Stakeholder** access.
4. Add its Azure DevOps profile ID to publisher `yeceen` as a **Contributor**.
5. Set GitHub Actions variables `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` at the
   repository or `marketplace` environment level.

The numeric organization and repository IDs in the immutable OIDC subject stay
stable across a GitHub repository rename, but the repository name embedded in the
subject changes. Update the Azure federated credential to the exact subject above
after renaming the repository.

References: [Marketplace authentication](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace)
and [Azure Login with OIDC](https://github.com/Azure/login#login-with-openid-connect-oidc-recommended).

## Release a version

1. Update the version in `package.json` and synchronize `package-lock.json`.
2. Run `npm ci`, `npm run check`, `npm run package`, and `npm run check:package`.
3. Install and verify `har-assist.vsix` locally.
4. Commit and push to `ceen` or `main`.
5. The **Auto Release on Version Bump** workflow detects the version change,
   builds and checks the VSIX, creates its tag and GitHub Release, then publishes
   to Marketplace.

Pushes without a version change and pull requests build and verify only. Existing
release/tag and manual publishing workflows remain available for retries. A
published version cannot be reused; increment the version for every release.

## Package contents and checks

`.vscodeignore` is a runtime allowlist. JSONEditor's full `jsoneditor.min.js`
already embeds Ace and the other libraries needed by the viewer. Ship that
bundle, its CSS/icons, and the Codicons CSS/font, not the separate Ace builds or
the JSONEditor examples, source and alternate bundles. Keep dependency license,
notice and package metadata files for attribution. Do not replace the full bundle
with the minimalist build, which lacks the requested code view.

`npm run check:package` extracts the actual VSIX into a temporary directory and
runs the body-viewer tests using only its packaged runtime resources. It also
checks CSS image/font references, licenses, and size budgets (1 MiB compressed,
3 MiB installed). Both publishing workflows run this check before uploading.
The check requires `unzip`, available on the Ubuntu runners and macOS.

For local checks without leaving a VSIX in the source directory:

```bash
task_package_dir=$(mktemp -d)
npx --no-install vsce package --out "$task_package_dir/har-assist.vsix"
HAR_ASSIST_VSIX="$task_package_dir/har-assist.vsix" npm run check:package
```

To retry a release explicitly:

```bash
gh workflow run actions.yml --repo ceendev/har-assist --ref v0.1.0 \
  -f publish=true -f release_tag=v0.1.0
```

The Marketplace URL will be
<https://marketplace.visualstudio.com/items?itemName=yeceen.har-assist> after the
first approved publication.

Because the publisher was previously restricted by Marketplace enforcement,
contact `VSMarketplace@microsoft.com` and obtain confirmation that the publisher
is unlocked before attempting the first Har Assist release. A new extension ID
must not be used to bypass an unresolved Marketplace restriction.
