# Comet Cookie Blocker

> A Manifest V3 privacy extension for **Perplexity Comet** (works in Chrome / Edge / Brave too).
> Built on the assumption that consent is theatre — and that the receipts prove it.

---.

## Five days of real browsing. Here's what it already caught.

In its first week on a single machine, Comet Cookie Blocker intercepted **181 tracking cookies**, silenced ad-tech domains, and killed consent banners before they finished loading:

| What got blocked | Who was doing it | What they wanted |
| --- | --- | --- |
| `NID` cookie, re-set on every page load | **Google** (`google.com`) | Your search + preference identity |
| `personalization_id` cookie | **X / Twitter** (`x.com`) | Cross-site ad targeting |
| `_fbp` cookie | **Meta** (`facebook.com`) | Facebook pixel fingerprint |
| `gpt.js` ad script | **Google Ad Manager** (`securepubads.g.doubleclick.net`) | Programmatic ads + tracking |
| `personalization_id_sync` pixel | **Twitter Analytics** (`analytics.twitter.com`) | Ad conversion sync |
| `rp.gif` beacon | **Reddit** (`alb.reddit.com`) | Event tracking (`PageVisit`, `UserSignupIntent`) |
| OneTrust CMP SDK (`otSDKStub.js`) | **OneTrust** (`cdn.cookielaw.org`) | The "consent" wall itself |
| OneTrust geo + consent-receipt endpoints | **OneTrust** (`onetrust.com`) | Consent telemetry |
| Cookie banner (`REJECT ALL` auto-clicked) | **PacSun** (`pacsun.com`) | Dark-pattern consent UI |

The two most stripped cookies — Google's `NID` and X's `personalization_id` — respawn within seconds of deletion. That's the whole point: these are **first-party cookies doing third-party work**, and sites will keep re-planting them as long as nothing pushes back.

---

## What it does

- **Auto-rejects** cookie consent banners (OneTrust, Cookiebot, Quantcast, Didomi, TrustArc, Osano, Sourcepoint, Google Funding Choices, Iubenda, Complianz, CookieYes, Usercentrics, Cookie Information, Borlabs, Pandectes, Termly, Axeptio, Klaro — plus generic text heuristics)
- **Blocks tracker requests** at the network level (`declarativeNetRequest`)
- **Strips tracking cookies** as they appear + a 15-minute purge sweep
- **Blocks CMP scripts** so the consent wall never even renders
- Saves a **local block history** so rules evolve from what you actually browse

## Install in Comet

1. Open `comet://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder
5. If upgrading: click **Reload** on the extension card

> If Comet/Chrome complains about a `_metadata` folder, delete it and reload — it's a
> regenerated artifact from packing and is git-ignored.

## Settings

| Control | Default | What it does |
| --- | --- | --- |
| Banner action | Auto-reject | Reject / hide / accept consent UI |
| Block trackers | On | Network-block known tracker domains |
| Strip tracking cookies | On | Delete tracker cookies as they appear + periodic purge |
| Block CMP scripts | On | Block OneTrust / Cookiebot / Quantcast / etc. |
| Pause here | — | Whitelist the current site |

## What gets saved (for evolution)

**Local only** (`chrome.storage.local`, last 250 events — deduplicated):

- hostname
- action type (`tracker`, `cookie`, `cmp-script`, `click`, `hide`, `banner`)
- provider / cookie name when known
- success flag + timestamp

Sync storage keeps settings + aggregate counters only. No history, no browsing data, nothing personal leaves the machine.

## Accessing logs (for agents)

The block history and cumulative breakdown live inside the browser's own storage,
which isn't directly readable. Use `export-logs.py` to pull them as clean JSON —
no dependencies, works while Comet is running:

```bash
python3 export-logs.py              # full JSON: stats + breakdown + history
python3 export-logs.py --summary    # aggregate counts only
python3 export-logs.py --out logs.json
python3 export-logs.py --ext-id <id> --comet-dir <path>   # override auto-detection
```

Output shape:

```json
{
  "generated_at": "…",
  "extension": { "id": "…", "name": "Comet Cookie Blocker" },
  "stats": { "trackers": 80, "cookies": 541, "banners": 2, "clicks": 2, "hides": 1 },
  "breakdown": { "hosts": { "google.com": 163 }, "providers": {}, "cookies": {}, "types": {} },
  "history_count": 249,
  "history": [ { "type": "cookie", "host": "google.com", "name": "NID", "ts": … } ]
}
```

- `stats` — cumulative counters since install.
- `breakdown` — per-host / per-provider / per-cookie-name counters that survive
  the 250-entry history roll-off (this is what the "rules evolve" loop should read).
- `history` — the recent window, newest first.

There is also a `getLogs` message inside the extension (`chrome.runtime.sendMessage({ type: "getLogs" })`)
that returns the same `{ stats, settings, breakdown, history }` shape for anything
running in-extension.

## Notes

- Use **Pause here** if a site breaks (login, checkout, embedded widgets).
- Tracker match logging via `onRuleMatchedDebug` is most reliable on unpacked/dev installs.
- This is not a full uBlock replacement — curated high-value trackers, tuned to grow from your history.
