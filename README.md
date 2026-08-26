# @achasoft/dsh-add-assets

An options plate on the composer's `+` for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web Client, and a Claude Code-style preview of what you have attached.

The harness's own `+` does exactly one thing: it opens the slash-command menu. This plugin makes that one entry among several — **add files**, **add folders**, **upload from this device**, **slash command** — each with a keyboard shortcut, and each reaching the same machinery the composer already uses.

**What makes the picker worth opening rather than typing `@`:** it keeps your selection across directories, searches, and scopes, so three files from three folders go in with one gesture. Folders are a first-class target rather than a step on the way to a file. And it reaches **outside the project** — the harness's own `@` completion cannot, by design.

A picked path lands in the draft as an inline chip — `📄 background.ts`, not `@src/background/background.ts` — while the full path rides along hidden and is what reaches the model. Pending images sit above it as cards with format, dimensions, and size, behind a full-size preview you can page through and remove from.

## Requirements

- A dsh installation with the Web Client (`@deepseek-ai/dsh-web-app`).
- For **Project** scope: a Host file-reference provider (`@deepseek-ai/dsh-file-reference-local` in the stock profiles). Without one, the picker opens in **This machine** scope alone.
- For **This machine** scope: nothing extra — this plugin's own Host endpoint serves it. Turn it off with `outsideWorkspace: false`.
- For the slash-command row: the trigger pipeline (`@deepseek-ai/dsh-client-ui-input-trigger`), which is what the resident `+` uses too. Without it, that row says so.

## Install

`dsh plugin` forwards to pnpm, so any pnpm source works:

```bash
dsh plugin --profile default add @achasoft/dsh-add-assets
```

<details>
<summary>Other install sources</summary>

```bash
dsh plugin --profile default add ./achasoft-dsh-add-assets-0.1.0.tgz   # from `pnpm pack`
dsh plugin --profile default add ./dsh-add-assets                       # a local checkout
dsh plugin --profile default add github:navid-kianfar/dsh-add-assets#<sha>   # from git
```

A git install fetches sources, not build output. This package ships a `prepare` script that builds them, but pnpm ≥10 will not run it until you allow it — add the key pnpm names to your profile's `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  '@achasoft/dsh-add-assets': true
```

That is permission to execute this package's code at install time. Prefer the npm or tarball forms, which need no such allowance.
</details>

The bundle appends itself to your profile automatically. Verify with `dsh --profile default --dump-config`, which should show a `# == @achasoft/dsh-add-assets` layer.

## What the plate does

| Row | What it adds | Default shortcut |
| --- | --- | --- |
| **Add files** | Browses for files and inserts the chosen paths as `@path` mentions in the draft — the same text the composer's `@` completion writes, so tools resolve them the same way. | `⌘U` / `Ctrl+U` |
| **Add folders** | The same picker, listing directories only and selecting them rather than descending. Inserts `@path/`. | `⇧⌘U` / `Ctrl+Shift+U` |
| **Upload from this device** | The browser's file chooser. Images become draft attachments, exactly as paste and drop produce. | — |
| **Slash command** | Opens the composer's own slash-command menu over the caret. This is what the resident `+` did. | `⌘/` / `Ctrl+/` |

### The two scopes

A switch at the top of the picker says which capability is answering, because they do not have the same reach:

- **Project** — the session's working directory, served by the Host's `@file` index. Typing fuzzy-searches the whole workspace at once; typing a path browses a level. Paths go into the draft workspace-relative.
- **This machine** — the Host filesystem, served by this plugin's endpoint. One level at a time from `Home`, filtered by name, with the full path in the breadcrumb. Paths go into the draft absolute.

Selection carries across the switch, so you can take two files from the project and one from `~/Downloads` in a single **Add**.

Keys: `↑`/`↓` move, `Enter` selects or descends, `→` opens a folder, `←` goes up a level, `⌘Enter` adds everything selected, `Esc` closes. The panel's height is fixed, so filtering never moves it under your pointer.

## Picked paths are chips, not paths

A pick becomes an inline reference occurrence: the draft carries a short label the composer renders as a glyph chip, and the full `@path` is the occurrence's hidden serialized form — the same mechanism the harness's own `@` completion uses. So a deeply nested file reads as `📄 background.ts` in the composer while the model still receives `@src/background/background.ts`.

Backspace deletes a chip whole, like any other atomic reference. Where no trigger pipeline is composed there is no codec to serialize an occurrence, so the picker falls back to writing the plain `@path` text a person could have typed — longer to read, identical in effect.

## The attachment preview

Each pending image is a card: a cropped square thumbnail, the file name, and a details line (`PNG · 1024×768 · 240KB`). Hover reveals a remove control; a click opens the full image over a dimmed page, where `←`/`→` page through the rest of the draft's attachments and the trash control removes the one you are looking at.

Dragging files anywhere over the page still shows the drop invitation and still attaches on drop — this plugin takes over that seat from the shipped attachment rail, so it owns the drop target too.

Prefer something quieter? Set `previewDensity: compact` for small round thumbnails with names only.

## Settings

Everything below is editable at **Settings → Plugins → Add assets**, and can be fixed by the deployment from your profile's own `cordis.patch.yml` (`$DSH_HOME/profiles/<name>/cordis.patch.yml`). A patch replaces a row's entire `config`, so restate every key.

```yaml
- patch:
    - id: add-assets
      config:
        replaceCommandButton: true
        deviceUpload: true
        outsideWorkspace: true
        browseMaxEntries: 500
        filesShortcut: mod+u
        foldersShortcut: mod+shift+u
        commandShortcut: mod+/
        pickerResultLimit: 20
        previewDensity: card
        previewDetails: true
```

| Field | Meaning |
| --- | --- |
| `replaceCommandButton` | Hide the composer's own `+` so this plugin's plate is the only one. See the note below. |
| `deviceUpload` | Offer the device file chooser under the files entry. Paste and drop work either way. |
| `outsideWorkspace` | Let the picker leave the project. See the note below. |
| `browseMaxEntries` | Entries the Host reports per browsed level, 1–5000. A home directory is well past this; the picker says it truncated and the search field is how you get past it. |
| `filesShortcut`, `foldersShortcut`, `commandShortcut` | Chords like `mod+u`, `mod+shift+u`, `mod+/`. `mod` is Command on macOS and Ctrl elsewhere. Blank disables one. A chord the browser could not match is refused at load, naming the field. |
| `pickerResultLimit` | Rows the picker renders per query, 1–200. The Host applies its own, lower cap (20 by default), so raising this alone does not widen results — raise the file-reference provider's `maxResults` with it. |
| `previewDensity` | `card` (thumbnail, name, details) or `compact` (small round thumbnail and name). |
| `previewDetails` | Whether the details line shows format, dimensions, and size. |

Shortcuts are deliberately modifier chords: the composer's textarea owns every bare key, and a plain-key shortcut would eat your typing.

### About `outsideWorkspace`

The harness's file-reference provider refuses every path outside the session's working directory — `resolveDisplayDirectory` rejects `..` and symlinks outright — and the Workspace directory browser returns directories only. So reaching a **file** outside the project needs an endpoint of this plugin's own, and that is what the `addAssets/browse` Remote is.

It reports entry **names**, kinds, and absolute paths for any directory the Host account can read. It never opens a file, and it never returns contents. What it does add over what the harness already exposes is the ability to enumerate the machine's tree from a browser session, including file names. Set it to `false` where that enumeration is itself the thing to withhold; the picker then opens in Project scope alone and the scope switch disappears rather than showing one choice.

### About `replaceCommandButton`

The harness draws its `+` inside its own InputBar and declares no slot for it, so no plugin can replace it in place. Leaving one `+` in the tool row therefore means hiding the resident one, which this plugin does by marking that single element — found by searching the composer card its own seat sits in, for the accessible signature (`aria-haspopup="listbox"`) unique to that button across the client. Nothing document-wide, no class names, and the mark is removed when the plugin unloads.

Set it to `false` if you would rather no plugin reached the harness's own chrome. Both buttons then show: the resident one still opens the slash-command menu, and this plugin's plate sits beside it.

## Model Experience

Indirectly, and only through text a person can see and edit. Picked paths become ordinary `@path` prompt text in the draft — the model's view of them is whatever `@deepseek-ai/dsh-file-reference-local` already provides for a typed mention — and uploaded images become the same draft attachments paste and drop produce. This plugin adds no prompt, no tool, and no session event of its own.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **The resident `+` is hidden, not replaced.** Until the harness declares a slot for that seat, the takeover depends on an accessible signature rather than a contract. It fails visibly (two buttons), never silently.
- **Machine scope does not search across directories.** The filter narrows the level you are in; the project index is the only thing that searches a tree, and it stops at the workspace root.
- **Picked paths always append.** A reference goes to the end of the draft rather than the caret, because the picker takes focus while it is open.
- **The picker's caret is the composer's, but its span is collapsed.** A slash command picked from the plate inserts at the caret and replaces nothing, even if text is selected.
- **Images only in the preview.** The composer accepts image attachments alone, so a card is always an image card; non-image file cards wait until the composer accepts non-image attachments.
- **No zoom or download in the full-size preview.** It renders the original at fit-to-viewport size, pages, and removes.
- **The preview does not trap focus.** It sets `aria-modal` and restores focus on close, but Tab can reach the page behind it — the same limitation the shipped lightbox has.

## Development

```bash
pnpm run typecheck
pnpm run test       # the Typert freshness check, then vitest
pnpm run build      # tsc emit → tsdown's two halves (lib/host.js, lib/client.js)
```

The `link:` devDependencies point at a sibling `deepseek-harness` checkout, which supplies the types and the built `lib/` this package compiles against. The build reproduces the two artifact formats the harness's own (unpublished) client preset emits; `tsdown.config.ts` documents why each one is shaped the way it is.

`generated/` holds the Typert RPC contract for the `addAssets` endpoint. Only the harness's generator can produce it, so it ships as committed source and `pnpm test` fails when it drifts from `src/host/`. After changing the endpoint or any type it names:

```bash
node scripts/regen-typert.mjs ../deepseek-harness
```

It refuses to run against a dirty harness checkout, takes several minutes, and restores everything it touched there in a `finally`. Two regens must never overlap.

## License

MIT
