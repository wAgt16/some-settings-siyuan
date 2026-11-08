[中文](README.zh-CN.md)

# Some Settings

> A batch of **independently toggleable** SiYuan enhancements — every setting item can be enabled, disabled or hidden on its own.

* Minimum SiYuan version: `3.8.6-alpha.4`
* Environments: desktop, mobile, desktop window, browser; any backend
* The plugin is disabled in read-only / publish mode

## Getting started

Open **Settings → Marketplace → Downloaded → Some Settings → Settings**. That is the only entry point — the plugin
adds no top bar button, no status bar item and no dock item.

Every item in the panel starts with a switch and is **off by default**; turn on the ones you want.
Click **Save** when you are done, or **Cancel** to discard everything — closing with unsaved changes asks first.
Switching a feature off unmounts it **completely** (styles, listeners and injected nodes are all released) with no
plugin reload, and a feature that only works on one frontend never appears in the panel on the other one.

## Features

### Functionality

| Setting                                                 | Applies to | What it does                                                                                                                                                                  |
| ------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Never remember the code language                        | both       | New code blocks always start with an empty language instead of reusing the last one picked                                                                                    |
| Create the daily note directly                          | both       | Creates the daily note in the chosen notebook without asking; creation still runs through SiYuan's own code                                                                   |
| Fixed first document icon                               | both       | Uses a configured emoji the first time a document gets an icon instead of a random one                                                                                        |
| Confirm before opening a web link                       | both       | Asks before opening an http/https link and shows the full original URL                                                                                                        |
| Reconnect button on the disconnect panel (experimental) | both       | Adds a _Reconnect now_ button to the kernel-disconnected panel                                                                                                                |
| Automatic reconnect after a disconnect (experimental)   | both       | Probes the kernel on its own schedule while disconnected and reloads as soon as it answers (2 × 500ms by default)                                                             |
| DeepSeek balance in the agent panel                     | both       | Shows the account balance centred below the agent panel composer while the official api.deepseek.com DeepSeek model is in use                                                 |
| Send the agent message with Enter                       | both       | Sends with Enter in the agent panel composer and moves the line break to Ctrl+Enter or Shift+Enter (Cmd+Enter on macOS)                                                       |
| Aliyun OSS bucket usage                                 | both       | Adds a usage button to the S3 storage settings that reads the bucket's storage size and object count with the credentials saved there; hidden when the endpoint is not Aliyun |
| File size and metadata in the asset menu                | both       | File size, image dimensions, type and modified time for a workspace asset, in the menu of an image (long-press on mobile) or of an audio/video/iframe block                   |
| Create a file in assets from the slash menu             | both       | Creates an empty file with any extension under assets/ from a slash command, appends a note ID to the name and inserts a link at the caret                                    |
| Jump to the last position when a bookmark opens a note  | both       | Opens a whole-document bookmark through the document tree's own path, restoring the last reading position rather than the start of the note                                   |
| A floating window instead of the recording notice       | both       | Replaces the recording notice with a small floating window showing the elapsed time, with a stop button (SiYuan's recorder has no pause)                                      |
| Ask before quitting                                     | both       | Asks before SiYuan quits (the main menu's Quit and close-to-quit); a tray quit does not ask (disabled / desktop / mobile / both)                                              |
| F12 toggles the developer tools                         | desktop    | Opens or closes the developer tools with F12, the same entry as the one in the status bar context menu                                                                        |
| Custom marketplace icons                                | both       | Replaces the icon of an installed marketplace package; the image is stored under `icons/` in the plugin directory, and saving one turns the feature on                        |

### Interface

| Setting                                                    | Applies to | What it does                                                                                                                                        |
| ---------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blur behind modals                                         | both       | Backdrop blur behind dialogs, so the editor underneath softens while the dialog stays sharp                                                         |
| Accent for the opened note                                 | both       | Flush accent bar on the left edge of the opened note in the document tree, with a configurable colour and width                                     |
| Inline Markdown in document tree titles                    | both       | Renders inline Markdown in notebook and document titles of the document tree with SiYuan's own inline styles                                        |
| Heading level in the title icon                            | both       | Uses SiYuan's own H1-H6 icons in the reference list and the search panel, so a heading block shows its level                                        |
| Copy button for inline code                                | both       | Copy button for inline code wherever it is rendered: off, on hover (recommended), or always                                                         |
| Syntax highlighting for snippets                           | both       | Colours the snippet editor using SiYuan's own highlight.js and current code theme                                                                   |
| Slimmer desktop command panel                              | desktop    | Shrinks the command panel to a share of SiYuan's native width (50% by default)                                                                      |
| Blur behind the mobile dock bar                            | mobile     | Backdrop blur behind the floating mobile dock bar                                                                                                   |
| Mobile document tree title size back to 3.8.9              | mobile     | Scales the title text back to the 3.8.9 proportion and keeps following SiYuan's own font size setting                                               |
| Smoother mobile bars                                       | mobile     | Smooth transition for the top bar, breadcrumb and dock bar show/hide; the dock bar only shows or hides as a whole                                   |
| Taller mobile candidate panel                              | mobile     | Taller mobile candidate panel (including reference search), scaled to the viewport and never past the visible area                                  |
| Always show Sync on mobile                                 | mobile     | Keeps Sync visible in the top-right corner; the click stays SiYuan's own sync guide                                                                 |
| Native SiYuan style for mobile dropdowns                   | mobile     | Dropdowns use SiYuan's own menu instead of the WebView picker                                                                                       |
| Labels in the mobile long-press menu                       | mobile     | Adds text to the icon-only buttons in the mobile long-press menu (the back button stays an icon)                                                    |
| Keep the block icon visible on mobile                      | mobile     | Keeps the operated block's icon visible instead of letting it flicker                                                                               |
| Hide the mobile Quit button                                | mobile     | Hides the icon-only Quit button in the mobile side panel                                                                                            |
| Hide the agent's suggested prompts                         | both       | Hides the example prompts on the agent panel's new-session screen, so an accidental click cannot start a conversation                               |
| Pin the agent thinking header                              | both       | Pins the "Thought for N s" header of an expanded thinking card to the top of the panel, so a long thought can be collapsed at any time              |
| Details for the agent's tool calls                         | both       | Lists the agent's tool calls one per row in a thinking card, each with the arguments it ran with, and the full arguments and result on hover        |
| Do not focus the first control when a settings panel opens | both       | Keeps a settings panel from focusing its first control when it opens: this plugin's panel and SiYuan's own settings dialog                          |
| Inline Markdown in tab titles                              | both       | Renders inline Markdown in tab titles: the desktop tab bar with its dropdown list, and the mobile tab overview (disabled / desktop / mobile / both) |
| Guide to the Ref Crumbs plugin                             | both       | A pointer to Ref Crumbs, another plugin by the same author, with a button that opens its settings panel or its marketplace page                     |

### About

| Setting                                       | Applies to | What it does                                                                                                         |
| --------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| Console log viewer                            | mobile     | Collects console output from the moment the plugin loads and shows the full log, with copy-all and clear             |
| Clear this plugin's configuration             | both       | Wipes every configuration file in the plugin's storage directory, then reloads the frontend, back to a fresh install |
| About this plugin                             | both       | A read-only notice: what the plugin is, the current version and the GitHub repository                                |
| Import and export this plugin's configuration | both       | Exports every configuration file in the storage directory as one JSON document, and writes it back                   |

## Notes

* There is no per-item reset: to restore one item, export the configuration, edit it and import it again, or clear
  everything with _Clear this plugin's configuration_.
* Both reconnect features reload the whole frontend once the kernel answers, because SiYuan gives plugins no way to
  rebuild the main WebSocket. Note content lives in the kernel and is written as you go, so a reload loses nothing.
* The console log viewer only collects while its switch is on; logs from plugin startup or from before you flipped it
  are not recorded. Turn it on and reproduce the problem.
* On mobile the inline-code copy button follows the **caret** (there is no hover) and does not steal focus from the
  editor. It copies the **visible text**: zero-width markers are stripped and non-breaking spaces become plain ones.
* Jump-to-last-position only takes over whole-document bookmarks opened with a plain left click; modified clicks and
  bookmarks on a block keep SiYuan's own behaviour.
* The recording window only replaces the UI: permission handling, MP3 encoding, upload and inserting the audio block
  stay SiYuan's own code, and its recorder has no pause, so the window offers stop only.
* Asset rows land directly in the context menu rather than inside the **Plugin** submenu, and only workspace assets
  (`assets/…`) have a file size and a modified time.
* Syntax highlighting for snippets depends on SiYuan's own highlight.js; if it never loads, the plugin tears the
  highlight layer down rather than leaving an unreadable input.
* Import/export and clear work on **every configuration file** in the plugin's storage directory
  (`data/storage/petal/some-settings-siyuan`).
* Custom marketplace icons live under `icons/` in the plugin storage directory (`author__package.ext`), change this
  client's display only and sync with SiYuan; saving one turns the feature on, and clearing the configuration leaves
  them in place — use _Restore default_ in the icon manager to undo one.
* _Details for the agent's tool calls_ reads **only responses the panel has already received** — the running turn's
  event stream and the two archive responses the panel requests itself — and sends no request of its own. A call
  neither source can match is left without details rather than shown with wrong arguments.
* _Send the agent message with Enter_ turns Enter into send and moves the line break to Ctrl+Enter / Shift+Enter
  (Cmd+Enter on macOS), deliberately **shadowing the default Agent Send shortcut**.

## Bazaar Stats Graph

![Bazaar stats graph](https://siyuan-bazaar-stats-graph.sr1.cc.cd/api/chart/wmy2981/some-settings-siyuan?metrics=downloads,rating,ratings&range=all&area=true&lang=en)

## License

[MIT](./LICENSE)
