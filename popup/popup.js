const enabledEl = document.getElementById("enabled");
const modeEl = document.getElementById("mode");
const blockTrackersEl = document.getElementById("blockTrackers");
const stripCookiesEl = document.getElementById("stripTrackingCookies");
const blockCmpEl = document.getElementById("blockCmpScripts");
const siteHostEl = document.getElementById("siteHost");
const siteStatusEl = document.getElementById("siteStatus");
const toggleSiteBtn = document.getElementById("toggleSite");
const siteSection = document.querySelector(".site");
const historyList = document.getElementById("historyList");
const clearHistoryBtn = document.getElementById("clearHistory");
const purgeNowBtn = document.getElementById("purgeNow");

const statTrackers = document.getElementById("statTrackers");
const statCookies = document.getElementById("statCookies");
const statBanners = document.getElementById("statBanners");

let currentHost = "";

init();

async function init() {
  const data = await chrome.storage.sync.get({
    enabled: true,
    mode: "reject",
    blockTrackers: true,
    stripTrackingCookies: true,
    blockCmpScripts: true,
    whitelist: [],
    stats: { banners: 0, clicks: 0, hides: 0, trackers: 0, cookies: 0 }
  });

  enabledEl.checked = data.enabled !== false;
  modeEl.value = data.mode || "reject";
  blockTrackersEl.checked = data.blockTrackers !== false;
  stripCookiesEl.checked = data.stripTrackingCookies !== false;
  blockCmpEl.checked = data.blockCmpScripts !== false;
  renderStats(data.stats || {});

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentHost = hostFromUrl(tab?.url);
  siteHostEl.textContent = currentHost || "No active site";
  renderSiteState(data.whitelist || []);
  await refreshHistory();

  enabledEl.addEventListener("change", () => save({ enabled: enabledEl.checked }));
  modeEl.addEventListener("change", () => save({ mode: modeEl.value }));
  blockTrackersEl.addEventListener("change", () => save({ blockTrackers: blockTrackersEl.checked }));
  stripCookiesEl.addEventListener("change", () => save({ stripTrackingCookies: stripCookiesEl.checked }));
  blockCmpEl.addEventListener("change", () => save({ blockCmpScripts: blockCmpEl.checked }));

  toggleSiteBtn.addEventListener("click", async () => {
    if (!currentHost) return;
    const res = await chrome.runtime.sendMessage({ type: "toggleSite", host: currentHost });
    if (res?.ok) renderSiteState(res.whitelist || []);
  });

  clearHistoryBtn.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "clearHistory" });
    await refreshHistory();
  });

  purgeNowBtn.addEventListener("click", async () => {
    purgeNowBtn.disabled = true;
    purgeNowBtn.textContent = "Purging…";
    const res = await chrome.runtime.sendMessage({ type: "purgeNow" });
    purgeNowBtn.textContent = res?.removed ? `Removed ${res.removed}` : "Nothing to purge";
    setTimeout(() => {
      purgeNowBtn.disabled = false;
      purgeNowBtn.textContent = "Purge cookies";
    }, 1200);
    await refreshHistory();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") {
      if (changes.stats) renderStats(changes.stats.newValue || {});
      if (changes.whitelist) renderSiteState(changes.whitelist.newValue || []);
    }
    if (area === "local" && changes.history) {
      renderHistory(changes.history.newValue || []);
    }
  });
}

function renderStats(stats) {
  statTrackers.textContent = String(stats.trackers || 0);
  statCookies.textContent = String(stats.cookies || 0);
  const banners = (stats.banners || 0) + (stats.clicks || 0) + (stats.hides || 0);
  statBanners.textContent = String(banners);
}

function renderSiteState(whitelist) {
  if (!currentHost) {
    siteStatusEl.textContent = "Open a webpage to manage site rules";
    toggleSiteBtn.disabled = true;
    return;
  }
  const paused = whitelist.includes(currentHost);
  siteSection.classList.toggle("paused", paused);
  siteStatusEl.textContent = paused ? "Paused on this site" : "Blocking on this site";
  toggleSiteBtn.textContent = paused ? "Resume" : "Pause here";
  toggleSiteBtn.disabled = false;
}

async function refreshHistory() {
  const res = await chrome.runtime.sendMessage({ type: "getHistory" });
  renderHistory(res?.history || []);
}

function renderHistory(history) {
  if (!history.length) {
    historyList.innerHTML = `<li class="empty">Nothing blocked yet — browse a bit.</li>`;
    return;
  }

  historyList.innerHTML = history
    .slice(0, 12)
    .map((item) => {
      const title = escapeHtml(item.host || item.provider || item.type || "block");
      const detail = escapeHtml(detailFor(item));
      const when = relativeTime(item.ts);
      return `<li><div><strong>${title}</strong><span>${detail}</span></div><time>${when}</time></li>`;
    })
    .join("");
}

function detailFor(item) {
  if (item.type === "tracker" || item.type === "cmp-script" || item.type === "cookie-strip") {
    return item.type.replace("-", " ");
  }
  if (item.type === "cookie") return `cookie ${item.name || ""}`.trim();
  if (item.type === "click") return `${item.action || "click"} · ${item.provider || ""}`.trim();
  if (item.type === "hide") return `hide · ${item.provider || ""}`.trim();
  if (item.type === "banner") return `banner · ${item.provider || ""}`.trim();
  return item.type || "event";
}

function relativeTime(ts) {
  if (!ts) return "";
  const delta = Math.max(0, Date.now() - ts);
  if (delta < 60_000) return "now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
  return `${Math.floor(delta / 86_400_000)}d`;
}

function hostFromUrl(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return "";
    return u.hostname;
  } catch {
    return "";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function save(partial) {
  await chrome.storage.sync.set(partial);
}
