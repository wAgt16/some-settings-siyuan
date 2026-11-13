[中文](README.zh-CN.md)

# Some Settings

> A batch of **independently toggleable** SiYuan enhancements — every setting item can be enabled or disabled on its own.

## Features

Categories follow the native SiYuan feature each setting affects, and match the tabs of the settings panel.

### AI

* DeepSeek balance in the agent panel
* Send the agent message with Enter
* Hide the agent's suggested prompts
* Pin the agent thinking header
* Details for the agent's tool calls

### Editor

* Never remember the code language
* Create the daily note directly
* Create new documents at a fixed location
* Confirm before opening a web link
* File size and metadata in the asset menu
* Create a file in assets from the slash menu
* A floating window instead of the recording notice
* Heading level in the title icon
* Copy button for inline code
* Guide to the Ref Crumbs plugin

### Document tree and tabs

* Fixed first document icon
* Jump to the last position when a bookmark opens a note
* Accent for the opened note
* Inline Markdown in document tree titles
* Inline Markdown in tab titles
* Mobile document tree title size back to 3.8.9

### Interface and appearance

* Blur behind modals
* Slimmer desktop command panel
* Blur behind the mobile dock bar
* Smoother mobile bars
* Taller mobile candidate panel
* Always show Sync on mobile
* Native SiYuan style for mobile dropdowns
* Labels in the mobile long-press menu
* Keep the block icon visible on mobile
* Hide the mobile Quit button
* Ask before quitting
* F12 toggles the developer tools

### Connection and kernel

* Reconnect button on the disconnect panel
* Automatic reconnect after a disconnect

### Settings and marketplace

* Aliyun OSS bucket usage
* Custom marketplace icons
* Hide downloaded donation buttons
* Syntax highlighting for snippets
* Console log viewer

### This plugin

* Detailed log output
* Clear this plugin's configuration
* About this plugin
* Import and export this plugin's configuration

## Installation

1. **SiYuan marketplace** — open **Settings → Marketplace**, find _Some Settings_ and install it; later updates
   arrive the same way.
2. **Release download** — download `package.zip` from the
   [releases](https://github.com/wmy2981/some-settings-siyuan/releases) and unzip it into
   `<workspace>/data/plugins/some-settings-siyuan/`, so `plugin.json` sits directly in that folder; then restart
   SiYuan.
3. **Build from source** — clone the repository, run `npm install` and then `npm run build` (Node 24 or newer); the
   build writes `package.zip` and a flat `dist/`, unzip either into the same folder.

Then open **Settings → Marketplace → Downloaded → Some Settings → Settings**. That is the only entry point — the
plugin adds no top bar button, no status bar item and no dock item.

## Notes

* Every change is written to that feature's own configuration file straight away: the panel has no Save button, and
  closing it loses nothing.
* The panel remembers the tab that was open when it closed and restores it next time, scrolling the tab bar to
  that tab; if that tab is no longer available, it falls back to the first tab.
* No per-item reset: to restore one item, export the configuration, edit it and import it again, or clear it all.
* Both reconnect features reload the whole frontend; note content lives in the kernel, so a reload loses nothing.
* Detailed logging is off by default: the console shows a single load hint until you turn it on under
  **This plugin**, and then every event is logged as one INFO / WARN / ERROR line tagged with the feature id.
* The console log viewer only collects from the moment its switch is on, so logs from plugin startup are never recorded.
* On mobile the inline-code copy button follows the caret and copies the visible text only.
* Jump-to-last-position only takes over whole-document bookmarks opened with a plain left click.
* The recording window only replaces the UI: SiYuan's recorder has no pause, so it offers stop only.
* Asset metadata sits directly in the context menu and only for workspace assets (`assets/…`).
* Snippet highlighting needs SiYuan's own highlight.js and falls back to plain text without it.
* Import, export and clear cover every configuration file under `data/storage/petal/some-settings-siyuan`.
* Custom marketplace icons change this client only, sync with SiYuan, and survive a configuration clear.
* _Details for the agent's tool calls_ reads only responses the panel already received, so unmatched calls show none.
* _Send the agent message with Enter_ shadows the default Agent Send shortcut.

## Bazaar Stats Graph

![Bazaar stats graph](https://siyuan-bazaar-stats-graph.sr1.cc.cd/api/chart/wmy2981/some-settings-siyuan?metrics=downloads,rating,ratings&range=all&area=true&lang=en)

## License

[MIT](./LICENSE)
