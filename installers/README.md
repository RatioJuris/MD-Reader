# MD Reader installers

Each platform installer has the same contract so an agent or CI job can drive it without prompts.

## Packages

Build output from `scripts/package.sh` or the repository workflow:

| Artifact | Contents |
| --- | --- |
| `md-reader-<version>.zip` | Unpacked Chromium extension |
| `md-reader-<version>-windows.zip` | `install.ps1` + `payload/` |
| `md-reader-<version>-macos.tar.gz` | `install.sh` + `payload/` |
| `md-reader-<version>-linux.tar.gz` | `install.sh` + `payload/` |

The scripts also run directly from this repository, using the repository root as the payload.

## Common interface

| Flag | Meaning |
| --- | --- |
| `--prefix PATH` / `-Prefix PATH` | Installation root |
| `--browser chrome\|edge\|chromium\|firefox` | Target browser, default `chrome` |
| `--source PATH` / `-Source PATH` | Explicit payload directory |
| `--no-associate` / `-NoAssociate` | Skip `.md` registration |
| `--dry-run` / `-DryRun` | Report intended changes only |
| `--verify` / `-Verify` | Check installed files against recorded hashes |
| `--uninstall` / `-Uninstall` | Remove files and registrations |
| `--json` / `-Json` | Emit one JSON object on stdout |
| `--log PATH` / `-Log PATH` | Append human-readable messages |
| `--open-browser` / `-OpenBrowser` | Open the browser extension page |

Windows uses PowerShell parameters (`-Prefix`, `-Json`). macOS and Linux use GNU-style flags (`--prefix`, `--json`).

## JSON result

```json
{
  "status": "ok",
  "action": "install",
  "platform": "linux",
  "browser": "chrome",
  "prefix": "/home/user/.local/share/md-reader",
  "extension_dir": "/home/user/.local/share/md-reader/extension",
  "dry_run": false,
  "verified_files": 0,
  "exit_code": 0,
  "changes": ["Staged 16 extension files"],
  "warnings": [],
  "manual_steps": ["Open chrome://extensions, enable Developer mode, choose Load unpacked..."]
}
```

`status` is `ok` or `error`. `manual_steps` reports browser actions that cannot be automated in branded Chrome/Edge.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success, possibly with manual steps |
| 1 | General error |
| 2 | Usage error (shell installers) |
| 4 | Verification failed |

## Typical agent sequence

```sh
install.sh --json --prefix /opt/md-reader --browser chrome
install.sh --json --prefix /opt/md-reader --verify
install.sh --json --prefix /opt/md-reader --uninstall
```

An agent should treat `manual_steps` as information to relay to the user, not as a failed installation.

## Browser limitation

Branded Chrome and Edge no longer accept `--load-extension` (Chrome 137+), and Windows/macOS block external installs from local CRX paths. The installers therefore stage the extension, register `.md` where the OS permits, and report the one remaining **Load unpacked** step. They do not pretend it was automated.
