# Tauri Code Signing & Auto-Update — Setup Notes

The current `tauri-release.yml` workflow builds **unsigned** macOS .dmg files
and publishes them to GitHub Releases on every `v*` tag push. Unsigned builds
work but trigger macOS Gatekeeper on first launch — users have to right-click
→ Open the first time. That's fine for a small private beta but not for
public distribution.

This doc describes how to enable two things later, in priority order:

1. **Code signing + notarization** — removes the Gatekeeper warning so users
   can double-click the .dmg and run normally.
2. **Tauri auto-updater** — the desktop app polls a JSON manifest and
   self-updates instead of requiring a manual redownload per release.

Both require an Apple Developer account ($99/year) and one-time key
generation. Both are independent — you can enable signing without the
updater, or vice versa, but the cleanest setup is signing + updater
together.

---

## 1. Code signing + notarization

### Prereqs
- Apple Developer Program membership ($99/year)
- A Developer ID Application certificate exported as `.p12` from Keychain Access
- An app-specific password from appleid.apple.com (Sign-In and Security → App-Specific Passwords)

### GitHub Secrets to add (repo Settings → Secrets and variables → Actions)

| Secret | Value |
| --- | --- |
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` file: `base64 -i cert.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | The password you set when exporting the .p12 |
| `APPLE_SIGNING_IDENTITY` | "Developer ID Application: Your Name (TEAM_ID)" |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_PASSWORD` | The app-specific password |
| `APPLE_TEAM_ID` | Your team ID from developer.apple.com/account |

### Workflow change

Add this `env` block to the "Build Tauri app" step in `tauri-release.yml`:

```yaml
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

`tauri-action` reads these env vars automatically and uses them for codesign
+ `xcrun notarytool submit`. No other config needed.

---

## 2. Tauri auto-updater

### Generate the signing key (one-time, on your local machine)

```sh
npm run tauri signer generate -- -w ~/.tauri/resonance.key
```

This creates a private/public key pair. The **public** key goes in
`tauri.conf.json`; the **private** key + its password go in GitHub Secrets.

### Add to `tauri.conf.json`

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/kbarnoski/melody-memo/releases/latest/download/latest.json"
      ],
      "pubkey": "PASTE THE CONTENTS OF ~/.tauri/resonance.key.pub HERE"
    }
  }
}
```

### Install the updater plugin

```sh
cd src-tauri && cargo add tauri-plugin-updater
npm install @tauri-apps/plugin-updater
```

Then register it in `src-tauri/src/lib.rs`:

```rust
.plugin(tauri_plugin_updater::Builder::new().build())
```

### GitHub Secrets

| Secret | Value |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of `~/.tauri/resonance.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The password you set during generation |

### Workflow change

Add to the env block:

```yaml
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
```

`tauri-action` will then generate the `latest.json` manifest alongside the
.dmg files and upload it to the release. The desktop app reads that
manifest on launch and self-installs new versions in the background.

---

## Tagging a release

Once setup is complete, ship a release with:

```sh
git tag v0.1.1
git push --tags
```

The workflow runs automatically. Track progress at
https://github.com/kbarnoski/melody-memo/actions
