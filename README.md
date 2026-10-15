# Structogram ADS

A desktop editor for the structure diagrams used in the ELTE Algorithms and Data Structures lectures. Edit one algorithm in two linked modes:

- **Blocks:** drag Statement, If, While, For, and Selection blocks into an Algorithm block. Write operators and conditions directly in their fields. Nest blocks by connecting them inside a body or branch.
- **Text:** write indented pseudocode. Switching to Blocks preserves the algorithm; changing a visual block updates both the text and the lecture-style diagram.

The diagram follows the uploaded course PDFs: rounded routine signatures, loop rails, thin monochrome borders, diagonal selection marks, and `SKIP` for an empty branch. Pseudocode is treated as text and structure; it is never executed.

![Visual blocks and the lecture-style diagram](docs/editor-preview.png)

## Download, install, and launch

The supported installation method is **one ZIP containing `Installation.command`**. No DMG, browser file, Node.js installation, Homebrew, or administrator password is required.

1. In [Releases](https://github.com/23sdd/StructogramProgForADS/releases), download **Structogram-Installer-1.2.0.zip** from the chosen version.
2. Extract the ZIP and open the **Structogram Installer** folder.
3. Double-click **Installation.command**, or open Terminal in that folder and run:

```sh
bash ./Installation.command
```

The script detects Intel or Apple Silicon (including Terminal running under Rosetta), downloads only the matching application, checks its embedded SHA-256, verifies the app's ad-hoc signature, installs into **~/Applications/Structogram ADS.app**, and opens it. It does not execute downloaded source code or install development tools. Initial installation needs internet and downloads the Electron runtime as part of the app.

Run the same script again to open the installed copy without downloading. The installer is pinned to a particular release and never silently switches to newer code. To update, quit the app and run the installer from the new release. Working documents are stored separately from the installed app.

Keep `Installation.command` executable when copying it; the distributed ZIP preserves this permission. Running it with `bash` also works if another download tool removes that bit. The personal build is ad-hoc signed, not Apple-notarized: macOS may show a first-launch prompt in **System Settings → Privacy & Security**. The script does not disable Gatekeeper or remove quarantine attributes.

**Code → Download ZIP** downloads development sources, not the ready-to-run installer. The architecture ZIP assets in each release are application payloads used by the script; the installer ZIP is the only supported end-user download.

## Use the two editing modes

**Blocks** opens by default. Select a category on the left, drag out a block, and click a text field to edit it. The Algorithm block holds the routine signature and body. Statement blocks accept assignments, declarations, procedure calls, `return`, comments, and `SKIP`. If blocks have editable conditions plus then/else bodies. While and For blocks have editable conditions or iteration ranges.

Selections accept connected Case blocks. Add at least two, write their guards, and use `otherwise` for an optional final default branch. Case blocks connect only inside a Selection; ordinary statements connect inside routine, branch, or loop bodies. Empty bodies generate `SKIP` automatically. Loose blocks must be connected or removed before exporting or switching to Text, so statements are not silently dropped.

The **Text** tab exposes the same pseudocode. It supports Tab/Shift+Tab, automatic indentation, mathematical symbols, and multiple routines. Fix malformed text before returning to Blocks; the editor keeps the text and error visible. Changing modes alone does not rewrite your original formatting. A subsequent block edit generates consistently indented text and explicit `SKIP` branches.

Use the visual Undo/Redo buttons or Mac **⌘Z / ⇧⌘Z**. Click a diagram row to find its matching block or text line. Save `.ads` source files with **⌘S**, open them with **⌘O**, and print or save PDF with **⌘P**. SVG and PNG exports use the same renderer as the preview.

The current document, selected mode, and visual layout are saved locally. Separate `.ads` files contain editable pseudocode; reopening them reconstructs their blocks. No accounts, analytics, external fonts, CDN, automatic updates, or runtime network requests are required by the editor. The browser edition is only a development/QA surface.

## Source notation

```text
search(t : Node*; k : T) : Node*
  while t ≠ ∅ ∧ t→key ≠ k
    if k < t→key
      t := t→left
    else
      t := t→right
  return t
```

Use consistent indentation within each block (two spaces recommended). No closing `end` keywords are needed. Empty bodies require `SKIP` in Text mode; an omitted `else` becomes an implicit `SKIP`. Conditions are not evaluated and the algorithm's mathematical correctness is not checked.

The preview converts `->`, `!=`, `<>`, `<=`, `>=`, `&&`, `||`, `!`, and `NULL`/`null` into the course's mathematical symbols. It preserves `:=` for assignment and `=` for equality. Source files retain the text as typed until a visual edit regenerates the document. Comments beginning with `//` remain literal text.

Malformed input pauses the preview, dims the previous diagram, and disables export/printing. Limits are 100,000 source characters, 1,500 non-empty lines, 24 nested levels, and 12 branches in a selection.

## Open-source components and project licensing

Blockly is Apache-2.0, Electron and Node.js use MIT licenses with upstream notices, and Chromium has BSD-style and third-party notices. All runtime assets are bundled locally. No JavaScript/Python execution generator is used for the algorithm blocks.

**No license has been added to this project's own code**, as requested by the owner. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for component attribution and bundled licenses. Neither a license nor a checksum establishes that code is harmless; review the source and the pinned release you choose to install.

## Development and checks

Developers need Node.js 22 or later:

```sh
npm ci
npm run build
npm test
npm start
```

`npm start` opens the desktop application. `npm run start:web` serves the same local editor for browser QA. Edit the small modules in `src/`, rebuild, and commit the updated `app.bundle.js` with source changes. The build copies Blockly, its media, English messages, and its license into `dist/vendor/blockly/` without a CDN.

The tests cover actual Blockly round trips for every course example, preserved nested branches, field editing, malformed text, SVG escaping, installer architecture selection, checksum failure without replacing an installed app, cached launches, paths containing spaces, and metadata validation.

On macOS, `npm run package:mac` creates separate application ZIPs for Intel and Apple Silicon. The GitHub workflow then creates a small installer ZIP with the exact release URLs and SHA-256 values embedded, installs through that script into a temporary folder, and launches the installed app to verify text editing, Blockly editing, and the live diagram before publishing the release assets. Same-repository pull requests create preview releases; fork pull requests cannot publish releases with this workflow. Build archives and scripts contain the runtime's upstream license notices.

The installer also supports `--verify-only` for install/integrity checks without opening a window. `STRUCTOGRAM_PAYLOAD_CACHE` can point to a folder containing the exact payload ZIPs for offline setup; checksums are still verified. `STRUCTOGRAM_INSTALL_ROOT` selects a different user-writable installation folder. CI uses both options to test the actual script without requiring administrator rights.

## Course references

The uploaded documents are notation references, not application instructions. Original PDFs and exam materials are not redistributed:

- Tibor Ásványi, *Algorithms and Data Structures I — Lecture Notes*, April 21, 2026: notation pp. 4–5; insertion sort p. 20; BST diagrams p. 54.
- *Algorithms and Data Structures II — Graphs*, October 1, 2026: BFS p. 15, with optional colour annotations omitted in the example.
- *Algorithms and Data Structures II — Trees*, October 8, 2025: AVL balance convention.
- *Algorithms and Data Structures II — Test 1 (example exercises)*, October 8, 2026: AVL-7 motivates the fill-balances worked solution; it is not an official supplied solution.

This is an independent learning tool. Its geometry follows the lecture diagrams, with approximate typography and spacing.

## Files

| File | Purpose |
| --- | --- |
| `src/blocks.js` | Blockly definitions, toolbox, workspace and undo |
| `src/block-model.js` | Bidirectional block/text conversion without execution |
| `src/parser.js`, `src/renderer.js` | Course parser and SVG geometry |
| `src/app.js` | Mode synchronization, persistence, native file actions and export |
| `desktop/` | Electron window, Mac menus and restricted native bridge |
| `installer/Installation.command` | Source template for the one-script installer |
| `scripts/create-installer.mjs` | Embeds the exact release and archive checksums |
| `.github/workflows/desktop.yml` | Build, script installation test and release assets |
