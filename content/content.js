(() => {
  const KNOWN_PROVIDERS = [
    {
      name: "onetrust",
      containers: ["#onetrust-banner-sdk", "#onetrust-consent-sdk", "#onetrust-pc-sdk", ".onetrust-pc-dark-filter"],
      reject: ["#onetrust-reject-all-handler", ".ot-pc-refuse-all-handler", "button#reject-all", "#onetrust-pc-sdk .reject-all"],
      accept: ["#onetrust-accept-btn-handler", "#accept-recommended-btn-handler", "#onetrust-pc-sdk .save-preference-btn-handler"]
    },
    {
      name: "cookiebot",
      containers: ["#CybotCookiebotDialog", "#CybotCookiebotDialogBodyUnderlay"],
      reject: ["#CybotCookiebotDialogBodyButtonDecline", "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowallSelection", "#CybotCookiebotDialogBodyButtonDecline"],
      accept: ["#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll", "#CybotCookiebotDialogBodyButtonAccept"]
    },
    {
      name: "quantcast",
      containers: [".qc-cmp2-container", "#qc-cmp2-container", ".qc-cmp-showing"],
      reject: [".qc-cmp2-summary-buttons button[mode='secondary']", "button.qc-cmp2-btn[mode='reject']", ".qc-cmp2-toggle-off"],
      accept: [".qc-cmp2-summary-buttons button[mode='primary']", "button.qc-cmp2-btn[mode='accept']"]
    },
    {
      name: "didomi",
      containers: ["#didomi-host", "#didomi-popup", ".didomi-popup-container"],
      reject: ["#didomi-notice-disagree-button", "button.didomi-continue-without-agreeing", ".didomi-components-button--type-secondary"],
      accept: ["#didomi-notice-agree-button", ".didomi-continue-without-agreeing + button"]
    },
    {
      name: "trustarc",
      containers: ["#truste-consent-track", ".truste_overlay", ".truste_box_overlay", "#consent-banner"],
      reject: [".truste-button-2", "a.call", "#truste-consent-required"],
      accept: [".truste-button-1", "#truste-consent-button"]
    },
    {
      name: "osano",
      containers: [".osano-cm-window", ".osano-cm-dialog", ".cc-window", ".cc-banner"],
      reject: [".osano-cm-denyAll", ".osano-cm-button--type_deny", ".cc-deny", ".cc-reject"],
      accept: [".osano-cm-accept-all", ".cc-allow", ".cc-dismiss", ".cc-btn.cc-allow"]
    },
    {
      name: "sourcepoint",
      containers: [".sp-message-open", "[id^='sp_message_container']", "[id^='sp_message_']"],
      reject: ["button[title*='Reject' i]", "button[aria-label*='Reject' i]", ".sp_choice_type_REJECT_ALL"],
      accept: ["button[title*='Accept' i]", ".sp_choice_type_11", ".sp_choice_type_ACCEPT_ALL"]
    },
    {
      name: "googlefc",
      containers: [".fc-consent-root", ".fc-dialog-overlay", "#google-funding-choices"],
      reject: [".fc-cta-do-not-consent", "button.fc-button.fc-cta-manage-options", ".fc-reject-all"],
      accept: [".fc-cta-consent", ".fc-button.fc-cta-consent"]
    },
    {
      name: "iubenda",
      containers: ["#iubenda-cs-banner", ".iubenda-cs-container"],
      reject: [".iubenda-cs-reject-btn", "button.iubenda-cs-btn-reject"],
      accept: [".iubenda-cs-accept-btn", "button.iubenda-cs-btn-primary"]
    },
    {
      name: "complianz",
      containers: ["#cmplz-cookiebanner-container", ".cmplz-cookiebanner"],
      reject: [".cmplz-btn.cmplz-deny", ".cmplz-deny"],
      accept: [".cmplz-btn.cmplz-accept", ".cmplz-accept"]
    }
  ];

  const BANNER_SELECTORS = [
    "#onetrust-banner-sdk",
    "#onetrust-consent-sdk",
    "#CybotCookiebotDialog",
    "#CybotCookiebotDialogBodyUnderlay",
    ".qc-cmp2-container",
    "#didomi-host",
    "#didomi-popup",
    ".truste_overlay",
    ".truste_box_overlay",
    "#truste-consent-track",
    ".osano-cm-window",
    ".osano-cm-dialog",
    ".cc-window",
    ".cc-banner",
    ".fc-consent-root",
    ".fc-dialog-overlay",
    "#iubenda-cs-banner",
    "#cmplz-cookiebanner-container",
    "[id*='cookie'][id*='banner' i]",
    "[id*='cookie'][id*='consent' i]",
    "[id*='cookie'][id*='notice' i]",
    "[class*='cookie'][class*='banner' i]",
    "[class*='cookie'][class*='consent' i]",
    "[class*='cookie'][class*='notice' i]",
    "[class*='consent'][class*='banner' i]",
    "[class*='consent'][class*='modal' i]",
    "[aria-label*='cookie' i]",
    "[aria-label*='consent' i]",
    "[role='dialog'][aria-modal='true']"
  ];

  const REJECT_TEXT = [
    /reject\s*all/i,
    /decline\s*all/i,
    /deny\s*all/i,
    /refuse\s*all/i,
    /disagree/i,
    /essential\s*only/i,
    /necessary\s*only/i,
    /only\s*necessary/i,
    /only\s*essential/i,
    /required\s*only/i,
    /reject/i,
    /decline/i,
    /deny/i,
    /refuse/i,
    /no[\s,]*thanks/i,
    /do\s*not\s*sell/i,
    /opt[\s-]*out/i,
    /ablehnen/i,
    /alles\s*ablehnen/i,
    /refuser/i,
    /tout\s*refuser/i,
    /rechazar/i,
    /rechazar\s*todo/i,
    /rifiuta/i,
    /afvise/i,
    /avvisa/i,
    /alle\s*ablehnen/i
  ];

  const ACCEPT_TEXT = [
    /accept\s*all/i,
    /allow\s*all/i,
    /agree\s*to\s*all/i,
    /i\s*agree/i,
    /got\s*it/i,
    /accept/i,
    /allow/i,
    /agree/i,
    /continue/i,
    /ok(ay)?$/i,
    /akzeptieren/i,
    /alles\s*akzeptieren/i,
    /accepter/i,
    /tout\s*accepter/i,
    /aceptar/i,
    /accetta/i
  ];

  const state = {
    settings: null,
    handled: new WeakSet(),
    lastActionAt: 0,
    observer: null,
    scans: 0
  };

  init();

  async function init() {
    state.settings = await fetchSettings();
    if (!shouldRun()) return;

    const run = () => {
      try {
        processPage();
      } catch (err) {
        console.debug("[comet-cookie-blocker]", err);
      }
    };

    run();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    }

    state.observer = new MutationObserver(() => {
      if (Date.now() - state.lastActionAt < 250) return;
      run();
    });
    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden"]
    });

    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      run();
      if (attempts >= 20) clearInterval(timer);
    }, 500);

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      fetchSettings().then((settings) => {
        state.settings = settings;
        if (shouldRun()) run();
      });
    });
  }

  function fetchSettings() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          { type: "getSettings", host: location.hostname },
          (response) => {
            if (chrome.runtime.lastError || !response) {
              resolve({
                enabled: true,
                mode: "reject",
                siteAllowed: true
              });
              return;
            }
            resolve(response);
          }
        );
      } catch {
        resolve({ enabled: true, mode: "reject", siteAllowed: true });
      }
    });
  }

  function shouldRun() {
    const s = state.settings;
    return !!(s && s.enabled !== false && s.siteAllowed !== false);
  }

  function processPage() {
    if (!shouldRun() || state.scans > 200) return;
    state.scans += 1;

    const mode = state.settings.mode || "reject";
    let acted = false;

    for (const provider of KNOWN_PROVIDERS) {
      const container = findFirst(provider.containers);
      if (!container || state.handled.has(container)) continue;

      notify("banner", { provider: provider.name });
      if (mode === "hide") {
        hideNode(container);
        unlockScroll();
        state.handled.add(container);
        notify("hide", { provider: provider.name, action: "hide", success: true });
        acted = true;
        continue;
      }

      const preferReject = mode !== "accept";
      const primary = preferReject ? provider.reject : provider.accept;
      const secondary = preferReject ? provider.accept : provider.reject;
      let btn = findFirst(primary, container) || findFirst(primary);
      if (!btn && preferReject) btn = findTextButton(container, REJECT_TEXT);
      if (!btn && !preferReject) btn = findTextButton(container, ACCEPT_TEXT);
      if (!btn) btn = findFirst(secondary, container) || findTextButton(container, preferReject ? ACCEPT_TEXT : REJECT_TEXT);

      if (btn) {
        const label = (btn.innerText || btn.value || btn.getAttribute("aria-label") || "").trim().slice(0, 60);
        click(btn);
        state.handled.add(container);
        notify("click", {
          provider: provider.name,
          action: preferReject ? "reject" : "accept",
          selector: label,
          success: true
        });
        setTimeout(() => {
          if (isVisible(container)) {
            hideNode(container);
            notify("hide", { provider: provider.name, action: "hide-fallback", success: true });
          }
          unlockScroll();
        }, 400);
        acted = true;
      } else {
        hideNode(container);
        unlockScroll();
        state.handled.add(container);
        notify("hide", { provider: provider.name, action: "hide", success: true });
        acted = true;
      }
    }

    if (!acted) {
      const banners = queryAll(BANNER_SELECTORS).filter((el) => looksLikeBanner(el) && !state.handled.has(el));
      for (const banner of banners.slice(0, 3)) {
        notify("banner", { provider: "generic" });
        if (mode === "hide") {
          hideNode(banner);
          unlockScroll();
          state.handled.add(banner);
          notify("hide", { provider: "generic", action: "hide", success: true });
          continue;
        }

        const preferReject = mode !== "accept";
        let btn = findTextButton(banner, preferReject ? REJECT_TEXT : ACCEPT_TEXT);
        if (!btn) btn = findTextButton(banner, preferReject ? ACCEPT_TEXT : REJECT_TEXT);
        if (btn) {
          const label = (btn.innerText || btn.value || btn.getAttribute("aria-label") || "").trim().slice(0, 60);
          click(btn);
          state.handled.add(banner);
          notify("click", {
            provider: "generic",
            action: preferReject ? "reject" : "accept",
            selector: label,
            success: true
          });
          setTimeout(() => {
            if (isVisible(banner)) {
              hideNode(banner);
              notify("hide", { provider: "generic", action: "hide-fallback", success: true });
            }
            unlockScroll();
          }, 400);
        } else {
          hideNode(banner);
          unlockScroll();
          state.handled.add(banner);
          notify("hide", { provider: "generic", action: "hide", success: true });
        }
      }
    }

    state.lastActionAt = Date.now();
  }

  function findFirst(selectors, root = document) {
    for (const raw of selectors) {
      for (const selector of expandSelector(raw)) {
        try {
          const el = root.querySelector?.(selector);
          if (el && isVisible(el)) return el;
        } catch {
          /* invalid selector */
        }
      }
    }
    return null;
  }

  function queryAll(selectors, root = document) {
    const out = [];
    for (const raw of selectors) {
      for (const selector of expandSelector(raw)) {
        try {
          out.push(...root.querySelectorAll(selector));
        } catch {
          /* ignore */
        }
      }
    }
    return out;
  }

  function expandSelector(selector) {
    // Support simple "#id_*" wildcard suffix used above
    if (selector.includes("*") && !selector.includes("[")) {
      const safe = selector.replace(/\*/g, "");
      return [safe];
    }
    return [selector];
  }

  function findTextButton(root, patterns) {
    const candidates = root.querySelectorAll(
      "button, a, [role='button'], input[type='button'], input[type='submit'], .btn, [onclick]"
    );
    let best = null;
    let bestScore = 0;
    for (const el of candidates) {
      if (!isVisible(el) || el.disabled) continue;
      const text = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim();
      if (!text || text.length > 80) continue;
      for (let i = 0; i < patterns.length; i++) {
        if (patterns[i].test(text)) {
          const score = patterns.length - i;
          if (score > bestScore) {
            best = el;
            bestScore = score;
          }
          break;
        }
      }
    }
    return best;
  }

  function looksLikeBanner(el) {
    if (!isVisible(el)) return false;
    const text = (el.innerText || "").toLowerCase();
    if (!text) return false;
    const cookieish = /cookie|consent|gdpr|privacy|tracking|personal data|we use/.test(text);
    if (!cookieish) return false;
    const rect = el.getBoundingClientRect();
    const large = rect.width > 180 && rect.height > 40;
    const fixedish =
      getComputedStyle(el).position === "fixed" ||
      getComputedStyle(el).position === "sticky" ||
      el.getAttribute("role") === "dialog";
    return large && (fixedish || rect.bottom > window.innerHeight * 0.55 || rect.top < 120);
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    if (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function click(el) {
    try {
      el.focus?.({ preventScroll: true });
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      if (typeof el.click === "function") el.click();
    } catch (err) {
      console.debug("[comet-cookie-blocker] click failed", err);
    }
  }

  function hideNode(el) {
    el.setAttribute("data-ccb-hidden", "1");
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("visibility", "hidden", "important");
    el.style.setProperty("pointer-events", "none", "important");
    el.setAttribute("aria-hidden", "true");
  }

  function unlockScroll() {
    const nodes = [document.documentElement, document.body];
    for (const node of nodes) {
      if (!node) continue;
      node.style.setProperty("overflow", "auto", "important");
      node.style.setProperty("position", "static", "important");
      node.classList.remove("no-scroll", "overflow-hidden", "modal-open", "consent-open");
    }
  }

  function notify(kind, extra = {}) {
    try {
      chrome.runtime.sendMessage({
        type: "event",
        kind,
        host: location.hostname,
        ...extra
      });
    } catch {
      /* extension context may be gone */
    }
  }
})();
