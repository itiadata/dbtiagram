---
id: 39
title: Update the private extension from GitHub Releases
status: implemented
priority: high
created: 2026-09-07
owner: unassigned
depends_on: []
---

# Update the private extension from GitHub Releases

## Summary

As a developer using the privately distributed dbt Diagram extension, I want it
to check the designated latest release in the private `itiadata/dbtiagram`
GitHub repository whenever VS Code starts, offer to download and install a newer
VSIX through my authenticated GitHub CLI, and ask me to reload VS Code, so that
I can stay current without the extension being published publicly. I also want
the installed version displayed directly below the `dbt Diagram` heading.

## Background

The extension is private and is installed from a VSIX rather than from the VS
Code Marketplace. Every intended user has the `gh` CLI installed and
authenticated for the private repository. GitHub Desktop does not supply `gh`,
so `gh` remains an explicit prerequisite.

The repository is `https://github.com/itiadata/dbtiagram`. A release produced by
version `X.Y.Z` must contain the VSIX asset `dbtiagram-X.Y.Z.vsix` and should use
the tag `vX.Y.Z` (a tag without the leading `v` is also accepted).

## Scope

**In scope**

- One non-blocking update check on every extension activation caused by VS
  Code's existing `onStartupFinished` activation event.
- Querying GitHub's designated **Latest release** from the hard-coded private
  repository `itiadata/dbtiagram` through the authenticated `gh` CLI.
- Comparing stable semantic versions of the form `X.Y.Z`, accepting an optional
  leading `v` on the release tag.
- Prompting before downloading or installing anything.
- Downloading the release's exactly named `dbtiagram-X.Y.Z.vsix` asset into the
  extension's global storage and silently running the VS Code CLI equivalent of
  `code --install-extension <path> --force`.
- Prompting to reload the current VS Code window after successful installation.
- Clear error notifications for a missing/unusable `gh`, inaccessible repository, malformed
  release, missing expected VSIX asset, failed download, or failed installation.
- Showing the installed package version as `vX.Y.Z` directly below the
  `dbt Diagram` heading in every diagram panel.
- An explicit `Check for updates` button beside the displayed version that runs
  the same update workflow on demand without changing the once-per-activation
  automatic check.

**Out of scope**

- Publishing to or querying the VS Code Marketplace or Open VSX.
- A background timer, once-per-day cache, manual check command, settings toggle,
  automatic installation without the user's confirmation, or automatic reload.
- Choosing a release by list order, tag order, or prerelease policy. The feature
  uses exactly the release returned by `gh release view` with no tag, i.e.
  GitHub's designated Latest release.
- Supporting arbitrary release tag formats or VSIX asset names.
- Release creation, packaging, checksums, signing, or changing the package
  version as part of this feature.
- Installing `gh`, authenticating it, or falling back to unauthenticated HTTP.

## Scenarios

### A newer designated latest release is offered and installed

```
Given dbt Diagram v0.0.2 is installed
And GitHub designates release v0.0.3 as Latest
And that release contains dbtiagram-0.0.3.vsix
When VS Code finishes starting and the extension activates
Then the extension asks: dbt Diagram v0.0.3 is available (installed: v0.0.2).
And the choices are "Update" and "Later"
When the user chooses "Update"
Then the extension downloads only dbtiagram-0.0.3.vsix through gh
And silently installs it with the VS Code CLI and --force
And the extension asks: dbt Diagram v0.0.3 was installed. Reload VS Code to use it.
And the choices are "Reload Now" and "Later"
When the user chooses "Reload Now"
Then the current VS Code window reloads
```

### The update is postponed

```
Given a newer designated Latest release is available
When the update prompt is dismissed or the user chooses "Later"
Then no VSIX is downloaded or installed
And the extension may offer the release again after the next VS Code startup
```

### Reload is postponed

```
Given the newer VSIX was installed successfully
When the reload prompt is dismissed or the user chooses "Later"
Then the current VS Code window is not reloaded
And the newly installed version takes effect after a later manual restart or reload
```

### No update is available

```
Given dbt Diagram v0.0.3 is installed
And GitHub's designated Latest release is v0.0.3 or v0.0.2
When the startup update check completes
Then no notification is shown
And no VSIX is downloaded or installed
And every open diagram header shows "(Up to date)" beside its installed version
And that text uses the same subdued color as the installed version
```

### The designated release cannot be used

```
Given the startup update check cannot run gh, cannot access itiadata/dbtiagram,
  receives a tag other than vX.Y.Z or X.Y.Z, or finds no asset named
  dbtiagram-X.Y.Z.vsix
When the check completes
Then the extension shows an error notification beginning "dbt Diagram could not check for updates:"
And no VSIX is installed

### The latest-release check cannot be run

```
Given gh is not installed, is not authenticated for itiadata/dbtiagram, or
  cannot reach GitHub
When the startup update check completes
Then VS Code shows an error toast beginning
  "dbt Diagram could not check for updates:"
And no diagram header shows "Up to date"
```
```

### Download or installation fails

```
Given the user chose "Update" for v0.0.3
When the VSIX download or the VS Code CLI installation fails
Then the extension shows an error notification beginning "dbt Diagram could not install v0.0.3:"
And the current VS Code window is not reloaded
And when download succeeded, the warning ends with the downloaded VSIX path
```

### Test hosts do not perform external update checks

```
Given the extension is running with VS Code ExtensionMode.Test
When it activates
Then gh and the VS Code installation CLI are not invoked
And no update notification is shown
```

### The installed version is visible in the diagram

```
Given package.json contains version 0.0.2
When a dbt Diagram panel is open
Then its header shows "dbt Diagram"
And directly below that text it shows "v0.0.2"
```

### The user checks for updates from a diagram

```
Given a diagram panel is open
When the user clicks "Check for updates"
Then the button is disabled and reads "Checking..." while the check runs
And the extension runs the same GitHub release check, update prompt, install,
  and native reload prompt used by the activation check
And all open diagram panels reflect the in-progress state
And a second automatic or manual request cannot start a concurrent check
When the check finishes
Then the button is enabled and reads "Check for updates"
And a successful no-update result shows "(Up to date)"
And a failure shows the existing native VS Code error notification
```

## Implementation Plan

### Files

| Path | Action | Responsibility |
|------|--------|----------------|
| `src/shared/update.ts` | create | Pure release decoding, stable semantic-version comparison, expected asset selection, messages, and update workflow against a host port. |
| `src/vscode/updateCli.ts` | create | Execute `gh release view`, `gh release download`, and the platform-appropriate VS Code CLI installation command without opening a terminal. |
| `src/vscode/updateCheck.ts` | modify | Adapt extension metadata, global storage, VS Code prompts/reload, and the CLI wrapper to the pure update workflow; show check/install failures as visible error notifications; skip test extension hosts. |
| `src/extension.ts` | modify | Own one process-wide guarded update-check runner, invoke it once during activation, and register it for manual diagram requests. |
| `src/shared/protocol.ts` | modify | Add the manual-check request and update-check progress message. |
| `src/webview/panel.ts` | modify | Retain the installed version and process-wide update status/progress; dispatch manual requests to the registered runner and publish changes to all panels. |
| `webview-ui/hooks/useHostMessages.ts` | modify | Dispatch installed-version, result, and checking-state messages. |
| `webview-ui/ProductTitle.tsx` | modify | Render the product heading, installed version/status, and explicit check button with enabled/checking states. |
| `webview-ui/App.tsx` | modify | Hold update progress, post the manual-check request, and render `ProductTitle`. |
| `webview-ui/styles.css` | modify | Style the stacked product title, subdued version/status, and compact secondary check button. |
| `test/unit/shared/update.test.ts` | create | Unit-test release validation, version comparison, exact messages, and the complete update workflow with a fake host. |
| `test/unit/webview/ProductTitle.test.tsx` | create | Verify the exact static heading/version markup. |
| `specs/ARCHITECTURE.md` | modify | Document the three new modules and changed responsibilities/exports. |
| `specs/README.md` | modify | Add feature 39 to the feature index and track its lifecycle status. |

### Signatures

```ts
// src/shared/update.ts (shared — must not import `vscode`)

export const UPDATE_REPOSITORY = 'itiadata/dbtiagram';

export interface LatestRelease {
  tagName: string;
  version: string;
  url: string;
  assetName: string;
}

export interface UpdateHost {
  readonly installedVersion: string;
  fetchLatestRelease(): Promise<unknown>;
  promptUpdate(message: string): Promise<'Update' | 'Later' | undefined>;
  download(release: LatestRelease): Promise<string>;
  install(vsixPath: string): Promise<void>;
  promptReload(message: string): Promise<'Reload Now' | 'Later' | undefined>;
  reload(): Promise<void>;
  warn(message: string): void;
}

export type UpdateCheckOutcome = 'upToDate' | 'updateAvailable' | 'checkFailed';

/**
 * Validates the unknown JSON value returned by `gh release view`, accepts only
 * an optional `v` plus MAJOR.MINOR.PATCH tag, and selects the exactly named
 * `dbtiagram-MAJOR.MINOR.PATCH.vsix` asset.
 */
export function decodeLatestRelease(value: unknown): LatestRelease;

/** True only when candidate and installed are X.Y.Z and candidate is newer. */
export function isNewerVersion(candidate: string, installed: string): boolean;

export function updateAvailableMessage(candidate: string, installed: string): string;
export function updateInstalledMessage(version: string): string;

/** Check, prompt, download, install and optionally reload in that order. */
export function runUpdateCheck(host: UpdateHost): Promise<UpdateCheckOutcome>;
```

```ts
// src/vscode/updateCli.ts (vscode-facing; external-process I/O, no `vscode` import required)

/** `gh release view --repo itiadata/dbtiagram --json tagName,url,assets`. */
export function fetchLatestRelease(): Promise<unknown>;

/**
 * Creates destinationDir and downloads only release.assetName with
 * `gh release download release.tagName --repo itiadata/dbtiagram
 * --pattern release.assetName --dir destinationDir --clobber`.
 * Resolves to the absolute downloaded VSIX path.
 */
export function downloadRelease(
  release: LatestRelease,
  destinationDir: string,
): Promise<string>;

/**
 * Silently executes the platform-appropriate equivalent of
 * `code --install-extension vsixPath --force` and rejects on non-zero exit.
 */
export function installVsix(vsixPath: string): Promise<void>;
```

```ts
// src/vscode/updateCheck.ts (vscode-facing)

/** Reads and validates the extension's package.json version. */
export function installedExtensionVersion(context: vscode.ExtensionContext): string;

/**
 * Returns immediately in ExtensionMode.Test; otherwise runs one update check
 * using globalStorageUri/releases/<tag> as the download directory.
 */
export function checkForUpdates(context: vscode.ExtensionContext): Promise<UpdateCheckOutcome>;
```

```ts
// src/shared/protocol.ts (shared)

// added to MessageToWebview:
| { type: 'app:version'; version: string }
| { type: 'app:updateStatus'; upToDate: boolean }
| { type: 'app:updateChecking'; checking: boolean }

// added to MessageToExtension:
| { type: 'app:checkForUpdates' }
```

```ts
// src/webview/panel.ts (vscode-facing)

// Existing signature gains the final installedVersion argument:
public static async createOrShow(
  extensionUri: vscode.Uri,
  source: DiagramSource,
  workspaceState: vscode.Memento,
  installedVersion: string,
): Promise<void>;

/** Sends the status to all currently open panels and retains it for new panels. */
public static setUpdateStatus(upToDate: boolean): void;

/** Registers the activation-owned, concurrency-guarded manual check callback. */
public static setUpdateCheckHandler(handler: () => void): void;

/** Sends progress to all currently open panels and retains it for new panels. */
public static setUpdateChecking(checking: boolean): void;
```

```ts
// webview-ui/hooks/useHostMessages.ts (webview)

export interface HostMessageHandlers {
  // existing members unchanged
  onAppVersion: (version: string) => void;
  onAppUpdateStatus: (upToDate: boolean) => void;
  onAppUpdateChecking: (checking: boolean) => void;
}
```

```tsx
// webview-ui/ProductTitle.tsx (webview)

export interface ProductTitleProps {
  version: string | null;
  upToDate: boolean;
  checking: boolean;
  onCheckForUpdates: () => void;
}

export function ProductTitle(props: ProductTitleProps): JSX.Element;
```

### Behavior notes

1. **Exactly once per activation.** `activate` calls `checkForUpdates(context)`
   once without awaiting it, so startup and command registration are never
   blocked. There is no persisted last-check time. `ExtensionMode.Test` is the
   sole skip condition.
2. **Installed version source.** `installedExtensionVersion` narrows
   `context.extension.packageJSON` from `unknown` and accepts only an `X.Y.Z`
   string. That same value is passed to every newly created panel; it is not
   read from a duplicated constant or build-time environment variable.
3. **Designated Latest.** No tag is passed to `gh release view`. The command is
   invoked with the fixed repository and JSON fields `tagName,url,assets`; this
   is GitHub's designated Latest release, not the first item from a release
   list. `gh` supplies authentication to the private repository.
4. **Strict release contract.** A latest tag must be `X.Y.Z` or `vX.Y.Z`.
   `decodeLatestRelease` strips only the optional leading `v`, requires exactly
   one asset named `dbtiagram-X.Y.Z.vsix`, and rejects missing, duplicate, or
   differently named assets. Draft/prerelease flags are not independently
   inspected because GitHub's designated Latest result is authoritative.
5. **Version ordering and result.** Major, minor, and patch are compared numerically in
   that order. Equality and an older latest release are quiet no-ops. Invalid
   installed or release versions are errors; there is no lexical comparison. A
   successfully decoded release that is equal to or older than the installed
   version returns `upToDate`; a newer decoded release returns `updateAvailable`
   whether the user updates or postpones; a query/decode/version-comparison
   failure returns `checkFailed` after warning.
6. **Prompt text.** The first message is exactly
   `dbt Diagram v{candidate} is available (installed: v{installed}).`; only an
   exact `Update` response continues. The completion message is exactly
   `dbt Diagram v{candidate} was installed. Reload VS Code to use it.`; only an
   exact `Reload Now` response executes `workbench.action.reloadWindow`.
7. **Download and install.** Downloading happens only after confirmation. The
   destination is
   `<globalStorageUri.fsPath>/releases/<tagName>/dbtiagram-X.Y.Z.vsix` and may be
   overwritten with `--clobber`. No shell or terminal UI is shown. Commands use
   fixed executable/arguments; release-derived values are validated before use.
   On Windows, the `code.cmd` launcher is invoked through `cmd.exe` with separate
   fixed arguments; other platforms invoke `code` directly. stdout is ignored,
   stderr is captured for a concise failure reason, and non-zero exit rejects.
8. **Failures.** Check/metadata failures call `showErrorMessage` with
   `dbt Diagram could not check for updates: {reason}`. A failure after the user
   chooses Update uses `dbt Diagram could not install v{version}: {reason}`; if
   download completed, append ` Downloaded VSIX: {absolutePath}`. A failure
    never invokes reload. Failure notifications have no action buttons. Calling
    `showErrorMessage` is not deferred until a diagram is opened, so a failed
    activation check remains visible in VS Code's Notification Center even when
    the check finishes before the user opens a diagram.
9. **Panel version and status.** On `webview:ready`, the panel posts
   `app:version` and `app:updateStatus` with its other initial state. The UI
   renders the version as `v{version}` in subdued 11px text immediately below
   the heading. When, and only when, the release check returned `upToDate`, it
    renders `(Up to date)` beside that version, using the same subdued color and
    typography as the version rather than a green success color. Until the messages arrive, it
   renders the heading without an empty placeholder. A failed, pending, or
   update-available check never renders `Up to date`. The version is the
   currently running extension's version; installing an update does not change
   it until reload.
10. **Failure toast.** `showErrorMessage` is the requested VS Code error
    toast. The existing `gh release view` command is the reachability and
    authorization check: it fails when `gh` is absent, authentication is absent
    or lacks repository access, GitHub cannot be reached, or its output is not
    usable. The warning retains the command's concise reason after the literal
    `dbt Diagram could not check for updates:` prefix.
11. **No adjacent behavior changes.** Existing diagram title/tab text, update
    status text, settings, save controls, and model/layout behavior remain
    unchanged.
12. **Manual check and concurrency.** The automatic check still runs exactly
    once on activation; opening a diagram does not itself run a check. The
    explicit button posts `app:checkForUpdates`. `activate` owns a single
    in-flight promise shared by startup and every panel, ignores requests while
    it is present, and clears it in `finally`. The panel broadcasts checking
    state to every current panel and retains it for panels opened mid-check.
13. **Button behavior.** The compact secondary button appears beside the version
    only after the version arrives. It reads `Check for updates` normally and
    `Checking...` while disabled. Completion re-enables it regardless of result.
    Manual checks use the existing native update, error, installation, and
    `Reload Now` / `Later` notifications without adding webview toasts.

### Tests

| Test file | Test name | Input | Expected |
|-----------|-----------|-------|----------|
| `test/unit/shared/update.test.ts` | `decodes the designated latest release and exact VSIX` | `{tagName:'v0.0.3',url:'https://github.com/itiadata/dbtiagram/releases/tag/v0.0.3',assets:[{name:'dbtiagram-0.0.3.vsix'}]}` | `{tagName:'v0.0.3',version:'0.0.3',url:'https://github.com/itiadata/dbtiagram/releases/tag/v0.0.3',assetName:'dbtiagram-0.0.3.vsix'}` |
| `test/unit/shared/update.test.ts` | `accepts a release tag without v` | tag `0.0.3` with `dbtiagram-0.0.3.vsix` | decoded version is `'0.0.3'` |
| `test/unit/shared/update.test.ts` | `rejects malformed or unusable latest releases` | malformed object, tag `latest`, missing exact asset, duplicate exact asset | each throws an `Error` with a non-empty message |
| `test/unit/shared/update.test.ts` | `compares versions numerically` | candidates/current: `0.0.3/0.0.2`, `0.10.0/0.9.9`, `1.0.0/1.0.0`, `0.0.2/0.0.3` | `true`, `true`, `false`, `false` |
| `test/unit/shared/update.test.ts` | `uses the literal prompt messages` | `0.0.3`, `0.0.2` | `'dbt Diagram v0.0.3 is available (installed: v0.0.2).'` and `'dbt Diagram v0.0.3 was installed. Reload VS Code to use it.'` |
| `test/unit/shared/update.test.ts` | `downloads installs and reloads an accepted update` | installed `0.0.2`, decoded latest `v0.0.3`, prompt results `Update` and `Reload Now`, download returns `C:\\store\\dbtiagram-0.0.3.vsix` | calls in order: fetch, update prompt, download, install with returned path, reload prompt, reload; no warning |
| `test/unit/shared/update.test.ts` | `postpones the update` | newer release; update response `Later` and separately `undefined` | no download, install, reload prompt, reload, or warning |
| `test/unit/shared/update.test.ts` | `postpones reload after installation` | newer accepted release; reload response `Later` and separately `undefined` | download and install occur; reload does not |
| `test/unit/shared/update.test.ts` | `does nothing for the same or an older release` | installed `0.0.3`; latest `0.0.3` and separately `0.0.2` | no prompt, download, install, reload, or warning |
| `test/unit/shared/update.test.ts` | `returns upToDate for a successful same or older release` | installed `0.0.3`; latest `0.0.0` and separately `0.0.3` | result is `'upToDate'` |
| `test/unit/shared/update.test.ts` | `warns when checking fails` | fetch rejection `gh not found` | warning exactly `'dbt Diagram could not check for updates: gh not found'`; no prompt/install/reload |
| `test/unit/shared/update.test.ts` | `warns when download fails` | accepted `0.0.3`; download rejection `network error` | warning exactly `'dbt Diagram could not install v0.0.3: network error'`; no install/reload |
| `test/unit/shared/update.test.ts` | `reports the VSIX path when installation fails` | download returns `C:\\store\\dbtiagram-0.0.3.vsix`; install rejects `code not found` | warning exactly `'dbt Diagram could not install v0.0.3: code not found Downloaded VSIX: C:\\store\\dbtiagram-0.0.3.vsix'`; no reload |
| `test/unit/webview/ProductTitle.test.tsx` | `renders the version and parenthesized up-to-date text directly below the product name` | render `{version:'0.0.2',upToDate:true}` to static markup | markup contains one `.app__product` with `<h1>dbt Diagram</h1>` followed by `v0.0.2` and `(Up to date)`; status has no separate success-color class |
| `test/unit/webview/ProductTitle.test.tsx` | `omits the version until supplied by the host` | render `{version:null}` | markup contains `<h1>dbt Diagram</h1>` and no `.app__version` |
| `test/unit/webview/ProductTitle.test.tsx` | `renders the enabled manual check button` | render version `0.0.2`, `checking:false` | markup contains enabled `Check for updates` button |
| `test/unit/webview/ProductTitle.test.tsx` | `renders the disabled checking button` | render version `0.0.2`, `checking:true` | markup contains disabled `Checking...` button |

The `ExtensionMode.Test` scenario is covered by the existing integration suite:
activation continues to register/open diagrams while `checkForUpdates` returns
before any external process or prompt. The thin VS Code/child-process adapters
remain manual-verification boundaries; all ordering and decisions are covered by
the pure host-port tests above.

### Verification

- `npm run verify` — typecheck and all unit suites must be green.
- `npm test` — unit and real VS Code integration suites must be green; the test
  host must not invoke `gh` or display an update prompt.
- Manual: install version `0.0.2`, designate a private `v0.0.3` GitHub release
  containing `dbtiagram-0.0.3.vsix`, start VS Code with authenticated `gh`,
  accept Update, confirm installation is silent, accept Reload Now, and confirm
  the diagram displays `v0.0.3` below `dbt Diagram` after reload.
- Manual: start again at the designated latest version and confirm no prompt.
- Manual: run `gh auth logout`, reload the Extension Development Host, and
  confirm an error notification containing the `gh` authentication reason is
  present when the diagram is opened.
- Manual: authenticate `gh`, open two diagrams, click `Check for updates`, and
  confirm both buttons show `Checking...`, only one check/prompt occurs, and a
  successful installation offers the native `Reload Now` / `Later` prompt.

### Do not touch

- `src/dbt/`, `src/diagram/`, model/layout persistence, and diagram editing —
  updates are extension-lifecycle infrastructure only.
- Existing command IDs, editor-title contributions, panel tab titles, settings,
  and activation events in `package.json`.
- Release/package versions and fixture files; this feature consumes version
  metadata but does not bump or manufacture it.
- Marketplace configuration or new runtime dependencies.

## Acceptance Criteria

- [ ] Every non-test activation checks `itiadata/dbtiagram` through `gh` for
      GitHub's designated Latest release without blocking activation.
- [ ] Only a strictly newer `X.Y.Z` release with the exact expected VSIX asset
      produces the `Update` / `Later` prompt.
- [ ] Accepting Update downloads and silently installs the VSIX with `--force`.
- [ ] Successful installation offers `Reload Now` / `Later`, and reload occurs
      only when explicitly accepted.
- [ ] Check, download, and installation failures show the specified error notifications and
      never trigger reload.
- [ ] Test extension hosts never invoke external update commands or prompts.
- [ ] Every diagram shows the running extension version directly below the
      `dbt Diagram` heading.
- [ ] A successful no-update check shows `(Up to date)` in subdued text beside
      every diagram's installed version; check failures show a VS Code error
      toast instead.
- [ ] Every diagram exposes an explicit manual check button; all panels show its
      progress and startup/manual requests never overlap.
- [ ] `npm run verify`, `npm test`, and `npm run typecheck` are green.
