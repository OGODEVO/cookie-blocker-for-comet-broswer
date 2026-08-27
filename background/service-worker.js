import {
  DEFAULTS,
  HISTORY_LIMIT,
  TRACKER_COOKIE_DOMAINS,
  TRACKING_COOKIE_NAMES
} from "./constants.js";

// Respawning trackers (e.g. google.com "NID", x.com "personalization_id") get
// re-set by the site within seconds of deletion. Without a cooldown this turns
// into a delete/respawn loop that floods history and burns CPU. Track the last
// deletion per "host|name" and skip immediate re-deletes; the periodic purge
// alarm still catches stragglers.
const COOKIE_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
const recentCookieDeletes = new Map(); // "host|name" -> last-delete timestamp

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get(null);
  const next = {
    ...DEFAULTS,
    ...stored,
    stats: { ...DEFAULTS.stats, ...(stored.stats || {}) }
  };
  await chrome.storage.sync.set(next);
  await applyRuleSets(next);
  await chrome.alarms.create("purge-trackers", { periodInMinutes: 15 });
  updateBadge(next);
});

chrome.runtime.onStartup.addListener(async () => {
  const data = await chrome.storage.sync.get(DEFAULTS);
  await applyRuleSets(data);
  await chrome.alarms.create("purge-trackers", { periodInMinutes: 15 });
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "sync") return;
  const data = await chrome.storage.sync.get(DEFAULTS);
  const ruleKeys = ["enabled", "blockCmpScripts", "blockTrackers", "stripTrackingCookies"];
  if (ruleKeys.some((key) => key in changes)) {
    await applyRuleSets(data);
  }
  updateBadge(data);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "purge-trackers") return;
  const data = await chrome.storage.sync.get(DEFAULTS);
  if (data.enabled === false || data.stripTrackingCookies === false) return;
  const removed = await purgeTrackerCookies(data.whitelist || []);
  if (removed > 0) await bumpStats({ cookies: removed });
});

chrome.cookies.onChanged.addListener(async (changeInfo) => {
  if (changeInfo.removed) return;
  const data = await chrome.storage.sync.get(DEFAULTS);
  if (data.enabled === false || data.stripTrackingCookies === false) return;

  const cookie = changeInfo.cookie;
  const host = normalizeHost(cookie.domain);
  if (isWhitelisted(host, data.whitelist || [])) return;

  if (shouldDeleteCookie(cookie)) {
    const cacheKey = `${host}|${cookie.name}`;
    if (Date.now() - (recentCookieDeletes.get(cacheKey) || 0) < COOKIE_COOLDOWN_MS) {
      return; // respawn loop guard — let the periodic purge handle it later
    }
    const ok = await removeCookie(cookie);
    if (ok) {
      await bumpStats({ cookies: 1 });
      await appendHistory({
        type: "cookie",
        host,
        name: cookie.name,
        provider: guessCookieProvider(cookie),
        success: true,
        ts: Date.now()
      });
    }
  }
});

if (chrome.declarativeNetRequest?.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
    const data = await chrome.storage.sync.get(DEFAULTS);
    if (data.enabled === false) return;

    const ruleset = info.rule?.rulesetId || "";
    if (ruleset !== "tracker_block" && ruleset !== "cmp_block" && ruleset !== "cookie_strip") {
      return;
    }

    let host = "";
    try {
      host = new URL(info.request.url).hostname;
    } catch {
      host = "";
    }

    await bumpStats({ trackers: 1 });
    await appendHistory({
      type: ruleset === "cmp_block" ? "cmp-script" : ruleset === "cookie_strip" ? "cookie-strip" : "tracker",
      host,
      url: info.request.url.slice(0, 180),
      ruleId: info.rule?.ruleId,
      success: true,
      ts: Date.now()
    });
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "getSettings") {
    chrome.storage.sync.get(DEFAULTS).then((data) => {
      const host = message.host || "";
      sendResponse({
        ...data,
        siteAllowed: !isWhitelisted(host, data.whitelist || [])
      });
    });
    return true;
  }

  if (message?.type === "event") {
    handleBannerEvent(message).then((stats) => sendResponse({ ok: true, stats }));
    return true;
  }

  if (message?.type === "toggleSite") {
    chrome.storage.sync.get(DEFAULTS).then(async (data) => {
      const host = (message.host || "").toLowerCase();
      if (!host) {
        sendResponse({ ok: false });
        return;
      }
      const list = new Set(data.whitelist || []);
      if (list.has(host)) list.delete(host);
      else list.add(host);
      const whitelist = [...list];
      await chrome.storage.sync.set({ whitelist });
      sendResponse({ ok: true, whitelist, blocked: !list.has(host) });
    });
    return true;
  }

  if (message?.type === "getHistory") {
    chrome.storage.local.get({ history: [] }).then((data) => {
      sendResponse({ history: data.history || [] });
    });
    return true;
  }

  if (message?.type === "getLogs") {
    Promise.all([
      chrome.storage.local.get({ history: [], breakdown: null }),
      chrome.storage.sync.get(DEFAULTS)
    ]).then(([localData, syncData]) => {
      sendResponse({
        stats: syncData.stats || {},
        settings: {
          enabled: syncData.enabled,
          mode: syncData.mode,
          blockTrackers: syncData.blockTrackers,
          stripTrackingCookies: syncData.stripTrackingCookies,
          blockCmpScripts: syncData.blockCmpScripts,
          whitelist: syncData.whitelist || []
        },
        breakdown: localData.breakdown || {},
        history: localData.history || []
      });
    });
    return true;
  }

  if (message?.type === "clearHistory") {
    chrome.storage.local
      .set({ history: [], breakdown: null })
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === "purgeNow") {
    chrome.storage.sync.get(DEFAULTS).then(async (data) => {
      const removed = await purgeTrackerCookies(data.whitelist || []);
      if (removed > 0) await bumpStats({ cookies: removed });
      sendResponse({ ok: true, removed });
    });
    return true;
  }

  return false;
});

async function handleBannerEvent(message) {
  const data = await chrome.storage.sync.get(DEFAULTS);
  const stats = { ...DEFAULTS.stats, ...(data.stats || {}) };
  if (message.kind === "banner") stats.banners += 1;
  if (message.kind === "click") stats.clicks += 1;
  if (message.kind === "hide") stats.hides += 1;
  await chrome.storage.sync.set({ stats });
  updateBadge({ ...data, stats });

  await appendHistory({
    type: message.kind || "banner",
    host: message.host || "",
    provider: message.provider || "unknown",
    action: message.action || message.kind,
    selector: message.selector || "",
    success: message.success !== false,
    ts: Date.now()
  });

  return stats;
}

async function bumpStats(partial) {
  const data = await chrome.storage.sync.get(DEFAULTS);
  const stats = { ...DEFAULTS.stats, ...(data.stats || {}) };
  for (const [key, value] of Object.entries(partial)) {
    stats[key] = (stats[key] || 0) + value;
  }
  await chrome.storage.sync.set({ stats });
  updateBadge({ ...data, stats });
}

async function appendHistory(entry) {
  const data = await chrome.storage.local.get({ history: [], breakdown: null });
  const history = Array.isArray(data.history) ? data.history : [];
  const last = history[0];
  const sameEvent =
    last &&
    last.type === entry.type &&
    last.host === entry.host &&
    (last.name || "") === (entry.name || "") &&
    (last.url || "") === (entry.url || "");
  if (!sameEvent) history.unshift(entry);
  if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
  const breakdown = bumpBreakdown(data.breakdown, entry);
  await chrome.storage.local.set({ history, breakdown });
}

// Cumulative per-host / per-provider / per-cookie-name counters. The raw
// history rolls off at HISTORY_LIMIT (and Google's NID respawn floods it
// fast), so this breakdown is what actually survives for later analysis.
function bumpBreakdown(breakdown, entry) {
  const b = breakdown || {};
  const hosts = { ...(b.hosts || {}) };
  const providers = { ...(b.providers || {}) };
  const cookies = { ...(b.cookies || {}) };
  const types = { ...(b.types || {}) };

  types[entry.type] = (types[entry.type] || 0) + 1;
  if (entry.host) hosts[entry.host] = (hosts[entry.host] || 0) + 1;
  if (entry.provider && entry.provider !== "unknown") {
    providers[entry.provider] = (providers[entry.provider] || 0) + 1;
  }
  if (entry.name) cookies[entry.name] = (cookies[entry.name] || 0) + 1;

  return { hosts, providers, cookies, types };
}

async function applyRuleSets(data) {
  const enabled = data.enabled !== false;
  const enable = [];
  const disable = [];

  const cmp = enabled && data.blockCmpScripts !== false;
  const trackers = enabled && data.blockTrackers !== false;
  const cookies = enabled && data.stripTrackingCookies !== false;

  (cmp ? enable : disable).push("cmp_block");
  (trackers ? enable : disable).push("tracker_block");
  (cookies ? enable : disable).push("cookie_strip");

  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: enable,
      disableRulesetIds: disable
    });
  } catch (err) {
    console.warn("Failed to toggle rulesets", err);
  }
}

function isWhitelisted(host, whitelist) {
  if (!host) return false;
  const h = host.toLowerCase();
  return whitelist.some((entry) => h === entry || h.endsWith(`.${entry}`));
}

function normalizeHost(domain) {
  return String(domain || "").replace(/^\./, "").toLowerCase();
}

function shouldDeleteCookie(cookie) {
  const host = normalizeHost(cookie.domain);
  if (TRACKER_COOKIE_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) {
    return true;
  }
  const name = cookie.name || "";
  return TRACKING_COOKIE_NAMES.some((n) => {
    if (n.endsWith("_")) return name.startsWith(n);
    if (n.length <= 3) return name === n;
    return name === n || name.startsWith(`${n}_`) || name.startsWith(`${n}.`);
  });
}

function guessCookieProvider(cookie) {
  const host = normalizeHost(cookie.domain);
  const name = cookie.name || "";
  if (host.includes("facebook") || name.startsWith("_fb")) return "meta";
  if (host.includes("google") || name.startsWith("_ga") || name.startsWith("_gcl")) return "google";
  if (host.includes("hotjar") || name.startsWith("_hj")) return "hotjar";
  if (host.includes("clarity") || name.startsWith("_cl")) return "clarity";
  if (host.includes("segment") || name.startsWith("ajs_")) return "segment";
  return host || "cookie";
}

async function removeCookie(cookie) {
  const domain = normalizeHost(cookie.domain);
  const cacheKey = `${domain}|${cookie.name}`;
  const protocols = cookie.secure ? ["https:"] : ["https:", "http:"];
  for (const protocol of protocols) {
    const url = `${protocol}//${domain}${cookie.path || "/"}`;
    try {
      const ok = await chrome.cookies.remove({
        url,
        name: cookie.name,
        storeId: cookie.storeId
      });
      if (ok) {
        recentCookieDeletes.set(cacheKey, Date.now());
        return true;
      }
    } catch {
      /* try next */
    }
  }
  return false;
}

async function purgeTrackerCookies(whitelist) {
  let removed = 0;
  const all = await chrome.cookies.getAll({});
  for (const cookie of all) {
    const host = normalizeHost(cookie.domain);
    if (isWhitelisted(host, whitelist)) continue;
    if (!shouldDeleteCookie(cookie)) continue;
    if (await removeCookie(cookie)) removed += 1;
  }
  return removed;
}

function updateBadge(data) {
  const enabled = data.enabled !== false;
  const stats = data.stats || {};
  const total =
    (stats.trackers || 0) + (stats.cookies || 0) + (stats.clicks || 0) + (stats.hides || 0);
  const text = !enabled ? "off" : total > 999 ? "999+" : total > 0 ? String(total) : "";
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: enabled ? "#0F4C4A" : "#8A6A5A" });
}
