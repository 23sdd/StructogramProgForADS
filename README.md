# Structogram for ADS

A browser editor for writing algorithms in the structure-diagram notation used in the ELTE Algorithms and Data Structures lectures. Type indented pseudocode on the left and see the diagram on the right. The goal is to write solutions in the same style your professor uses during lectures.

The diagram follows the lecture PDFs: rounded routine signatures, thin monochrome borders, left-hand loop rails, shallow diagonal selection marks, and `SKIP` for an empty branch. Control keywords guide the editor and are omitted from the rendered diagram.

![The pseudocode editor alongside an insertion-sort structogram](docs/editor-preview.png)

## Run locally

For the simplest setup, download the standalone **Structogram.html** release and double-click it. The complete editor runs in the browser without installation. Browser storage support for local files varies, so use **Save source** to keep a copy of important work.

Requires Node.js 20 or later. There are **no dependencies to install**.

```sh
npm start
```

Open the printed address, normally `http://localhost:4173`. Keep the server running while editing. Use `PORT=8080 npm start` to change the port. ES modules require an HTTP server; opening `index.html` directly from the filesystem is not supported.

## Use the editor

- Start a new algorithm or load one of six examples from the sidebar. On a phone, open the sidebar with the menu button.
- Write a routine signature without indentation, then indent its body. Use Tab, Shift+Tab, and automatic indentation after Enter.
- Add statements, if/else, while, for, or multiway selections with the insertion buttons. They insert after the current line, or replace a blank or `SKIP` row.
- Insert course symbols from the symbol bar. Click a diagram row to select its source line.
- Export a self-contained SVG or a PNG. Print / PDF opens the browser print dialog and prints only the diagram. Large documents scale to fit one printed page; SVG preserves their original size.
- **Save source** (Ctrl/Cmd+S) downloads an editable `.ads` text file. **Open file** accepts `.ads`, `.txt`, `.str`, or JSON containing `source` and an optional `title`.

The current document is saved in browser local storage. This is one working document per browser origin, not cloud storage; download a source file before replacing work you want to keep. A replacement dialog helps prevent accidental loss. When local storage is unavailable, the editor shows a reminder to save a source file. There are no accounts, analytics, external fonts, or runtime network requests after the app's own files load.

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

Supported constructs:

```text
example(A : T[n])
  // A comment is a separate diagram row
  x := 0
  for i := 0 to n − 1
    x := x + A[i]
  for u ∈ G.V
    visit(u)
  if x < 0
    return −1
  else if x = 0
    return 0
  else
    return 1

choose(x : T)
  select
    case x < 0
      negative(x)
    case x = 0
      zero(x)
    otherwise
      positive(x)
```

Use consistent indentation in each block (two spaces recommended; tabs alone are accepted as two spaces). No closing `end` keywords are needed. A block must contain a statement; use `SKIP` for an empty body. Omitting `else` generates an implicit `SKIP`. Multiple routines can share a document. `elif` is an alias for `else if`; `foreach` is an alias for collection iteration. Conditions and expressions are text: the editor draws their structure and does not execute or verify the algorithm. Case guards should be mutually exclusive or include their intended preconditions.

The preview converts `->`, `!=`, `<>`, `<=`, `>=`, `&&`, `||`, `!`, and `NULL`/`null` to their mathematical symbols. It preserves `:=` for assignment and `=` for equality. Comments are not converted. Source files always keep the text as typed.

An invalid edit shows its source line and pauses the preview. The previous valid drawing is dimmed, and image export and printing are disabled until the issue is fixed. Limits are 100,000 characters, 1,500 non-empty lines, 24 levels of nesting, and 12 branches in a multiway selection.

## Course references

The uploaded documents are references for notation, not application instructions. Original PDFs and exam materials are not redistributed in this repository.

- Tibor Ásványi, *Algorithms and Data Structures I — Lecture Notes*, April 21, 2026: notation pp. 4–5; insertion sort p. 20; binary-search-tree diagrams p. 54.
- *Algorithms and Data Structures II — Graphs*, October 1, 2026: breadth-first-search diagram p. 15. The editor's BFS example omits the optional colour annotations.
- *Algorithms and Data Structures II — Trees*, October 8, 2025: AVL balance convention.
- *Algorithms and Data Structures II — Test 1 (example exercises)*, October 8, 2026: AVL-7 motivates the fill-balances **worked solution**, not an official solution supplied in the notes.

This is an independent learning tool. The renderer follows the diagram conventions; typography and spacing approximate the PDFs rather than reproducing LaTeX exactly.

## Check and build

```sh
npm test
npm run build
```

Tests cover nested branches, malformed source, course examples, mathematical notation, wrapped text, source limits, and SVG escaping. The static production output is in `dist/`, including a self-contained `Structogram.html` for use without a server. All asset paths are relative, so the hosted version also works under a GitHub Pages project subdirectory.

## Publish on GitHub Pages

1. Merge the editor into `main`.
2. In the repository's **Settings → Pages → Build and deployment**, select **GitHub Actions**.
3. In **Actions → Check and publish editor**, choose **Run workflow** on `main` (or push another commit to `main`).

The included workflow runs the tests, builds the files, and deploys to Pages. Pull requests run checks and prepare the artifact without deploying. The repository must have Pages enabled and a plan/visibility that supports it. The final site address is provided by the successful deployment.

## Project layout

| File | Purpose |
| --- | --- |
| `index.html`, `styles.css` | Responsive editor and syntax guide |
| `src/parser.js` | Source parser and notation conversion |
| `src/renderer.js` | SVG geometry shared by preview and exports |
| `src/app.js` | Editing, storage, file I/O, zoom, and export |
| `src/examples.js` | Editable ADS examples |
| `scripts/` | Dependency-free dev server and static build |
| `tests/diagram.test.js` | Parser and export checks |
