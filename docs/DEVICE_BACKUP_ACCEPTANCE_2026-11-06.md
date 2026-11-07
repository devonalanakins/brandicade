# Brandicade — real-device backup acceptance checklist

**Purpose:** confirm that Brandi's actual game progress is independently recoverable before changing `brandicade.anevum.com`. This is a **human/device acceptance gate**, not a script to access, upload, import, or overwrite private saved games.

**Current deployment status (November 6, 2026):** the original protected production Worker remains live and its existing export controls can be used on Brandi's iPhone. The newer read-only backup-check buttons are **live in private staging** at `prism.anevum.com`, but NOT live at `brandicade.anevum.com`. Nothing below is evidence of completion until performed and confirmed by the actual player.

## On Brandi's actual iPhone (existing production origin)

1. Open [brandicade.anevum.com](https://brandicade.anevum.com/) in **the same Safari browser/profile or installed PWA that currently holds her game progress**. Sign in through the existing Cloudflare Access flow. Do not change privacy settings, clear website data, reinstall the PWA, or switch to the separate Prism preview for this backup.
2. In Brandicade's **Profile** choose **Export save file**, or open **Settings → Export backup**. In the iOS share/save interface choose **Save to Files** and keep the `BRANDICADE-Brandi-backup-YYYY-MM-DD.json` file in a private folder. This is the Glimmer Pop file only. If the game displays an unreadable-save warning, use **Download original save** and retain the unverified `.txt` separately; do not reset or import over the damaged original.
3. Launch **Prism Garden from the same Brandicade production origin**. In Prism Garden **Settings → Protect your garden → Download backup**, use **Save to Files**, retaining the separate `prism-garden-backup-YYYY-MM-DD.json`. The Prism file is not a backup of Glimmer Pop, and neither file migrates Brandle's independent origin.
4. In the iPhone Files app, check that **both distinct files** are visible, nonzero in size, and remain available after closing/reopening Files. Keep an independent owner-controlled copy encrypted or in private storage. Never send backups, identity tokens, screenshots of personal records, or private recovery keys into a public GitHub issue or source repository.
5. Leave game data untouched. **Do not test restoration by importing into the original iPhone save.** An isolated disposable device/profile is required to demonstrate actual restore behavior without replacing the only copy.

## On the currently deployed private v11 staging frontend

The new Settings **Check backup file** control for Glimmer Pop accepts its existing JSON export and verifies **format and lossless compatibility only**. The legacy file has **no signed checksum**: a readable file may still have been edited or be stale. The Prism Garden Settings **Check a backup file without restoring** control validates its embedded SHA-256 integrity digest and replayable puzzle state, and fails on damaged or lossy content. Its digest is **not a signature** and does not prove file authorship. Both checks are file-local and must **never write browser storage**.

These controls are available in the currently deployed **private v11** staging version. Both restore and export now reject files/records that would silently lose unsupported details. If strict backup generation is impossible, use the raw unverified original download instead; an unverified raw export is **not** a valid restorable backup without further recovery work. In an authenticated staging session, select **copies** of the saved files and record success or failure, never their contents. The dedicated Prism preview may have an independent storage origin; do **not** restore production save files to it merely to certify the new controls.

## Minimal completion evidence — no private values

- [ ] Real original player session and production URL verified on the same device
- [ ] Glimmer file saved to private Files location; exists and is not empty
- [ ] Prism Garden file saved to private Files location; exists and is not empty (or documented no saved progress)
- [ ] Independent private second copy held by the owner
- [ ] Read-only Glimmer format check completed in a separately verified staging release
- [ ] Read-only Prism checksum/replay check completed in a separately verified staging release
- [ ] Restore rehearsal performed **only in an isolated disposable environment**, original progress unchanged
- [ ] iPhone portrait/landscape and installed PWA verified; physical Bluetooth Xbox controller tested
- [ ] Cloudflare Access signed-in player and denied-user paths verified
- [ ] Release provenance, rollback, and owner sign-off completed

**Release decision:** These must remain unchecked until real evidence exists. Passing synthetic CI or Cloudflare D1 metadata checks does not satisfy the physical-device or independent-copy requirements. Keep the current production Worker, Access policies, D1, original browser origins, and `prism.anevum.com` staging unchanged until all release requirements are cleared.
