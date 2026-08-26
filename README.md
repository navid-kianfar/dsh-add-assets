# @achasoft/dsh-add-assets

An options plate on the composer's `+` for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web Client, and a Claude Code-style preview of what you have attached.

The harness's own `+` does exactly one thing: it opens the slash-command menu. This plugin makes that one entry among several — **add files**, **add folders**, **upload from this device**, **slash command** — each with a keyboard shortcut, and each reaching the same machinery the composer already uses.

**What makes the picker worth opening rather than typing `@`:** it keeps your selection across directories and searches, so three files from three folders go in with one gesture. Folders are a first-class target rather than a step on the way to a file. And the attachment row above the draft finally says what you attached — thumbnail, name, format, dimensions, size — with a full-size preview you can page through and remove from.

## Requirements

- A dsh installation with the Web Client (`@deepseek-ai/dsh-web-app`).
- For the two workspace rows: a Host file-reference provider (`@deepseek-ai/dsh-file-reference-local` in the stock profiles). Without one, both rows say so and the rest of the plate still works.
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
| **Add files** | Browses the session's working directory and inserts the chosen paths as `@path` mentions in the draft — the same text the composer's `@` completion writes, so tools resolve them the same way. | `⌘U` / `Ctrl+U` |
| **Add folders** | The same picker, listing directories only and selecting them rather than descending. Inserts `@path/`. | `⇧⌘U` / `Ctrl+Shift+U` |
| **Upload from this device** | The browser's file chooser. Images become draft attachments, exactly as paste and drop produce. | — |
| **Slash command** | Opens the composer's own slash-command menu over the caret. This is what the resident `+` did. | `⌘/` / `Ctrl+/` |

Inside the picker: type to search the whole workspace, or type a path to browse a level. `↑`/`↓` move, `Enter` selects or descends, `→` opens a folder, `←` goes up, `⌘Enter` adds everything selected, `Esc` closes.

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
| `filesShortcut`, `foldersShortcut`, `commandShortcut` | Chords like `mod+u`, `mod+shift+u`, `mod+/`. `mod` is Command on macOS and Ctrl elsewhere. Blank disables one. A chord the browser could not match is refused at load, naming the field. |
| `pickerResultLimit` | Rows the picker renders per query, 1–200. The Host applies its own, lower cap (20 by default), so raising this alone does not widen results — raise the file-reference provider's `maxResults` with it. |
| `previewDensity` | `card` (thumbnail, name, details) or `compact` (small round thumbnail and name). |
| `previewDetails` | Whether the details line shows format, dimensions, and size. |

Shortcuts are deliberately modifier chords: the composer's textarea owns every bare key, and a plain-key shortcut would eat your typing.

### About `replaceCommandButton`

The harness draws its `+` inside its own InputBar and declares no slot for it, so no plugin can replace it in place. Leaving one `+` in the tool row therefore means hiding the resident one, which this plugin does by marking that single element — found by searching the composer card its own seat sits in, for the accessible signature (`aria-haspopup="listbox"`) unique to that button across the client. Nothing document-wide, no class names, and the mark is removed when the plugin unloads.

Set it to `false` if you would rather no plugin reached the harness's own chrome. Both buttons then show: the resident one still opens the slash-command menu, and this plugin's plate sits beside it.

## Model Experience

Indirectly, and only through text a person can see and edit. Picked paths become ordinary `@path` prompt text in the draft — the model's view of them is whatever `@deepseek-ai/dsh-file-reference-local` already provides for a typed mention — and uploaded images become the same draft attachments paste and drop produce. This plugin adds no prompt, no tool, and no session event of its own.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **The resident `+` is hidden, not replaced.** Until the harness declares a slot for that seat, the takeover depends on an accessible signature rather than a contract. It fails visibly (two buttons), never silently.
- **The picker's caret is the composer's, but its span is collapsed.** A slash command picked from the plate inserts at the caret and replaces nothing, even if text is selected.
- **Images only in the preview.** The composer accepts image attachments alone, so a card is always an image card; non-image file cards wait until the composer accepts non-image attachments.
- **No zoom or download in the full-size preview.** It renders the original at fit-to-viewport size, pages, and removes.
- **The preview does not trap focus.** It sets `aria-modal` and restores focus on close, but Tab can reach the page behind it — the same limitation the shipped lightbox has.

## Development

```bash
pnpm install
pnpm run typecheck
pnpm run test
pnpm run build      # tsc emit → tsdown's two halves (lib/host.js, lib/client.js)
```

The `link:` devDependencies point at a sibling `deepseek-harness` checkout, which supplies the types and the built `lib/` this package compiles against. The build reproduces the two artifact formats the harness's own (unpublished) client preset emits; `tsdown.config.ts` documents why each one is shaped the way it is.

## License

MIT
