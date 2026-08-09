# Comet Cookie Blocker

Chromium Manifest V3 extension for **Perplexity Comet** (also works in Chrome / Edge / Brave).

Aggressive privacy mode:
- Auto-**rejects** cookie consent banners
- **Blocks tracker** network requests (ads, analytics, pixels)
- **Strips tracking cookies** (`_ga`, `_fbp`, ad IDs, tracker domains)
- Saves a **local block history** so rules can evolve from real browsing

## Install in Comet

1. Open `comet://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder
5. If upgrading: click **Reload** on the extension card

## Settings

| Control | Default | What it does |
| --- | --- | --- |
| Banner action | Auto-reject | Reject / hide / accept consent UI |
| Block trackers | On | Network-block known tracker domains |
| Strip tracking cookies | On | Delete tracker cookies as they appear + periodic purge |
| Block CMP scripts | On | Block OneTrust / Cookiebot / Quantcast / etc. |
| Pause here | — | Whitelist current site |

## What gets saved (for evolution)

Local only (`chrome.storage.local`, last 250 events):

- hostname
- action type (`tracker`, `cookie`, `click`, `hide`, `cmp-script`…)
- provider / cookie name when known
- success flag + timestamp

Sync storage keeps settings + aggregate counters only.

## Notes

- Use **Pause here** if a site breaks (login, checkout, embedded widgets).
- Tracker match logging via `onRuleMatchedDebug` is most reliable on unpacked/dev installs.
- This is not a full uBlock replacement — curated high-value trackers, tuned to grow from your history.
