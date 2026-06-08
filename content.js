/**
 * Kaptan Discord DM Cleaner - Content Script
 * Beautiful, stable, and secure Discord direct message cleaner.
 */

const FEEDBACK_WEBHOOK_URL = ""; // Buraya Discord Webhook URL'nizi yapıştırabilirsiniz. Boş bırakılırsa GitHub yönlendirmesi kullanılır.

// ─── v5.1 Feature Flags ───────────────────────────────────────────────
const FEATURE_FLAGS = {
    ENABLE_DM_CACHE: true,
    ENABLE_NEW_DM_UI: true,
    ENABLE_DELETE_CARDS: true
};

// ─── Storage Abstraction Layer (namespace: kyo_) ─────────────────────
const Storage = {
    PREFIX: "kyo_",

    get(key) {
        try {
            return JSON.parse(localStorage.getItem(this.PREFIX + key) || "null");
        } catch (e) {
            return null;
        }
    },

    set(key, value) {
        try {
            localStorage.setItem(this.PREFIX + key, JSON.stringify(value));
        } catch (e) {
            console.warn("[Storage] set failed:", key, e);
        }
    },

    remove(key) {
        localStorage.removeItem(this.PREFIX + key);
    },

    has(key) {
        return localStorage.getItem(this.PREFIX + key) !== null;
    },

    getRaw(key) {
        return localStorage.getItem(this.PREFIX + key);
    },

    setRaw(key, value) {
        localStorage.setItem(this.PREFIX + key, value);
    },

    clearNamespace() {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(this.PREFIX)) {
                keysToRemove.push(k);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
    }
};

// ─── Workspace Versioning & Migration ────────────────────────────────
const CURRENT_WORKSPACE_VERSION = 2;

function migrateWorkspace(oldVersion, newVersion) {
    if (oldVersion < 1 && newVersion >= 1) {
        // v0 → v1: Initial workspace setup (no migration needed)
    }
    if (oldVersion < 2 && newVersion >= 2) {
        // v1 → v2: Migrate favorites from array to object format
        try {
            const oldFavs = Storage.get("favorite_channels");
            if (Array.isArray(oldFavs)) {
                const newFavs = {};
                oldFavs.forEach(id => {
                    newFavs[id] = { type: "dm", favorite: true, pinned: false, starredAt: Date.now() };
                });
                Storage.set("favorite_channels", newFavs);
            }
        } catch (e) {}
    }
    Storage.set("workspace_v", newVersion);
}

function initWorkspace() {
    try {
        const rawVersion = localStorage.getItem("kyo_workspace_v");
        if (rawVersion) {
            JSON.parse(rawVersion); // Throws if corrupted/broken JSON
        }
        const savedVersion = Storage.get("workspace_v") || 0;
        if (savedVersion < CURRENT_WORKSPACE_VERSION) {
            migrateWorkspace(savedVersion, CURRENT_WORKSPACE_VERSION);
        }
    } catch (err) {
        console.error("[KYO] Workspace recovery", err);
        Storage.clearNamespace();
        Storage.set("workspace_v", CURRENT_WORKSPACE_VERSION);
        if (typeof window !== "undefined" && window.kyoPanel && window.kyoPanel.dmCache) {
            window.kyoPanel.dmCache.clear();
        }
    }
}
initWorkspace();

// ─── Search Normalization (Turkish + Unicode diacritics) ─────────────
function normalizeSearch(str) {
    if (!str) return "";
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ş/g, "s")
        .replace(/ğ/g, "g")
        .replace(/ı/g, "i")
        .replace(/ö/g, "o")
        .replace(/ü/g, "u")
        .replace(/ç/g, "c")
        .replace(/İ/g, "i");
}

class SoundEffects {
    constructor() {
        this.enabled = true;
        this.soundPack = Storage.getRaw("sound_pack") || "cyber";
        this.volume = parseFloat(Storage.getRaw("sound_volume") ?? "0.5");
    }

    play(type) {
        if (!this.enabled || this.volume <= 0) return;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const masterGain = ctx.createGain();
            masterGain.gain.setValueAtTime(this.volume, ctx.currentTime);
            
            osc.connect(gain);
            gain.connect(masterGain);
            masterGain.connect(ctx.destination);
            const now = ctx.currentTime;

            if (this.soundPack === "mechanical") {
                if (type === "click") {
                    osc.type = "triangle";
                    osc.frequency.setValueAtTime(120, now);
                    gain.gain.setValueAtTime(0.2, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
                    osc.start(now);
                    osc.stop(now + 0.03);
                } else if (type === "tab") {
                    osc.type = "sawtooth";
                    osc.frequency.setValueAtTime(150, now);
                    gain.gain.setValueAtTime(0.1, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
                    osc.start(now);
                    osc.stop(now + 0.04);
                } else if (type === "start") {
                    osc.type = "sawtooth";
                    osc.frequency.setValueAtTime(180, now);
                    gain.gain.setValueAtTime(0.15, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                    osc.start(now);
                    osc.stop(now + 0.15);
                } else if (type === "success") {
                    osc.type = "sine";
                    osc.frequency.setValueAtTime(400, now);
                    osc.frequency.setValueAtTime(450, now + 0.1);
                    gain.gain.setValueAtTime(0.12, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                    osc.start(now);
                    osc.stop(now + 0.25);
                } else if (type === "stealth") {
                    osc.type = "triangle";
                    osc.frequency.setValueAtTime(220, now);
                    gain.gain.setValueAtTime(0.1, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                    osc.start(now);
                    osc.stop(now + 0.1);
                }
            } else if (this.soundPack === "soft") {
                if (type === "click") {
                    osc.type = "sine";
                    osc.frequency.setValueAtTime(800, now);
                    gain.gain.setValueAtTime(0.03, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
                    osc.start(now);
                    osc.stop(now + 0.04);
                } else if (type === "tab") {
                    osc.type = "sine";
                    osc.frequency.setValueAtTime(600, now);
                    osc.frequency.exponentialRampToValueAtTime(700, now + 0.06);
                    gain.gain.setValueAtTime(0.03, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
                    osc.start(now);
                    osc.stop(now + 0.06);
                } else if (type === "start") {
                    osc.type = "sine";
                    osc.frequency.setValueAtTime(440, now);
                    osc.frequency.exponentialRampToValueAtTime(880, now + 0.3);
                    gain.gain.setValueAtTime(0.05, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                    osc.start(now);
                    osc.stop(now + 0.3);
                } else if (type === "success") {
                    osc.type = "sine";
                    osc.frequency.setValueAtTime(523.25, now); // C5
                    osc.frequency.setValueAtTime(659.25, now + 0.15); // E5
                    gain.gain.setValueAtTime(0.08, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
                    osc.start(now);
                    osc.stop(now + 0.4);
                } else if (type === "stealth") {
                    osc.type = "sine";
                    osc.frequency.setValueAtTime(523.25, now);
                    gain.gain.setValueAtTime(0.04, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                    osc.start(now);
                    osc.stop(now + 0.15);
                }
            } else if (this.soundPack === "hacker") {
                if (type === "click") {
                    osc.type = "square";
                    osc.frequency.setValueAtTime(900, now);
                    gain.gain.setValueAtTime(0.03, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
                    osc.start(now);
                    osc.stop(now + 0.03);
                } else if (type === "tab") {
                    osc.type = "square";
                    osc.frequency.setValueAtTime(700, now);
                    osc.frequency.setValueAtTime(1400, now + 0.04);
                    gain.gain.setValueAtTime(0.02, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                    osc.start(now);
                    osc.stop(now + 0.08);
                } else if (type === "start") {
                    osc.type = "square";
                    osc.frequency.setValueAtTime(300, now);
                    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.25);
                    gain.gain.setValueAtTime(0.04, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                    osc.start(now);
                    osc.stop(now + 0.25);
                } else if (type === "success") {
                    osc.type = "square";
                    osc.frequency.setValueAtTime(800, now);
                    osc.frequency.setValueAtTime(1000, now + 0.08);
                    osc.frequency.setValueAtTime(1200, now + 0.16);
                    gain.gain.setValueAtTime(0.06, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
                    osc.start(now);
                    osc.stop(now + 0.35);
                } else if (type === "stealth") {
                    osc.type = "square";
                    osc.frequency.setValueAtTime(1600, now);
                    osc.frequency.setValueAtTime(800, now + 0.08);
                    gain.gain.setValueAtTime(0.03, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
                    osc.start(now);
                    osc.stop(now + 0.16);
                }
            } else if (this.soundPack === "minimal") {
                if (type === "click") {
                    osc.type = "sine";
                    osc.frequency.setValueAtTime(1000, now);
                    gain.gain.setValueAtTime(0.01, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
                    osc.start(now);
                    osc.stop(now + 0.02);
                } else if (type === "tab") {
                    osc.type = "sine";
                    osc.frequency.setValueAtTime(900, now);
                    gain.gain.setValueAtTime(0.01, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
                    osc.start(now);
                    osc.stop(now + 0.03);
                } else if (type === "start") {
                    osc.type = "sine";
                    osc.frequency.setValueAtTime(800, now);
                    gain.gain.setValueAtTime(0.02, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                    osc.start(now);
                    osc.stop(now + 0.1);
                } else if (type === "success") {
                    osc.type = "sine";
                    osc.frequency.setValueAtTime(880, now);
                    gain.gain.setValueAtTime(0.03, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
                    osc.start(now);
                    osc.stop(now + 0.2);
                } else if (type === "stealth") {
                    osc.type = "sine";
                    osc.frequency.setValueAtTime(700, now);
                    gain.gain.setValueAtTime(0.015, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                    osc.start(now);
                    osc.stop(now + 0.08);
                }
            } else if (this.soundPack === "synthwave") {
                if (type === "click") {
                    osc.type = "sawtooth";
                    osc.frequency.setValueAtTime(1000, now);
                    osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);
                    gain.gain.setValueAtTime(0.04, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
                    osc.start(now);
                    osc.stop(now + 0.05);
                } else if (type === "tab") {
                    osc.type = "triangle";
                    osc.frequency.setValueAtTime(440, now);
                    osc.frequency.setValueAtTime(554, now + 0.03);
                    osc.frequency.setValueAtTime(659, now + 0.06);
                    gain.gain.setValueAtTime(0.05, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                    osc.start(now);
                    osc.stop(now + 0.12);
                } else if (type === "start") {
                    osc.type = "sawtooth";
                    osc.frequency.setValueAtTime(200, now);
                    osc.frequency.exponentialRampToValueAtTime(1000, now + 0.4);
                    gain.gain.setValueAtTime(0.05, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
                    osc.start(now);
                    osc.stop(now + 0.4);
                } else if (type === "success") {
                    osc.type = "sawtooth";
                    osc.frequency.setValueAtTime(587.33, now);
                    osc.frequency.setValueAtTime(739.99, now + 0.1);
                    osc.frequency.setValueAtTime(880.00, now + 0.2);
                    osc.frequency.setValueAtTime(1174.66, now + 0.3);
                    gain.gain.setValueAtTime(0.06, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
                    osc.start(now);
                    osc.stop(now + 0.55);
                } else if (type === "stealth") {
                    osc.type = "sine";
                    osc.frequency.setValueAtTime(880, now);
                    osc.frequency.exponentialRampToValueAtTime(80, now + 0.3);
                    gain.gain.setValueAtTime(0.06, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                    osc.start(now);
                    osc.stop(now + 0.3);
                } else if (type === "error") {
                    osc.type = "sawtooth";
                    osc.frequency.setValueAtTime(150, now);
                    osc.frequency.setValueAtTime(80, now + 0.08);
                    gain.gain.setValueAtTime(0.08, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
                    osc.start(now);
                    osc.stop(now + 0.2);
                }
            } else {
                if (type === "click") {
                    osc.type = "sine";
                    osc.frequency.setValueAtTime(600, now);
                    gain.gain.setValueAtTime(0.08, now);
                    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.05);
                    osc.start(now);
                    osc.stop(now + 0.05);
                } else if (type === "tab") {
                    osc.type = "triangle";
                    osc.frequency.setValueAtTime(350, now);
                    osc.frequency.exponentialRampToValueAtTime(700, now + 0.08);
                    gain.gain.setValueAtTime(0.04, now);
                    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.08);
                    osc.start(now);
                    osc.stop(now + 0.08);
                } else if (type === "start") {
                    osc.type = "sawtooth";
                    osc.frequency.setValueAtTime(80, now);
                    osc.frequency.exponentialRampToValueAtTime(900, now + 0.4);
                    gain.gain.setValueAtTime(0.08, now);
                    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.4);
                    osc.start(now);
                    osc.stop(now + 0.4);
                } else if (type === "success") {
                    osc.type = "sine";
                    osc.frequency.setValueAtTime(523.25, now);
                    osc.frequency.setValueAtTime(659.25, now + 0.12);
                    osc.frequency.setValueAtTime(783.99, now + 0.24);
                    osc.frequency.setValueAtTime(1046.50, now + 0.36);
                    gain.gain.setValueAtTime(0.15, now);
                    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.6);
                    osc.start(now);
                    osc.stop(now + 0.6);
                } else if (type === "stealth") {
                    osc.type = "sine";
                    osc.frequency.setValueAtTime(900, now);
                    osc.frequency.exponentialRampToValueAtTime(150, now + 0.22);
                    gain.gain.setValueAtTime(0.05, now);
                    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.22);
                    osc.start(now);
                    osc.stop(now + 0.22);
                }
            }
        } catch(e) {}
    }
}

class ModalManager {
    constructor() {
        this.overlay = null;
    }

    i18n(key, substitutions) {
        return chrome.i18n.getMessage(key, substitutions);
    }

    getIconSvg(type) {
        const svgs = {
            success: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
            error: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>',
            warning: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/></svg>',
            info: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>'
        };
        return svgs[type] || '';
    }

    show(title, body, buttons, options) {
        this.hide();
        this.overlay = document.createElement("div");
        this.overlay.className = "kyo-modal-overlay";

        const iconHtml = options?.icon ? `
            <div class="kyo-modal-icon ${options.icon}">
                ${this.getIconSvg(options.icon)}
            </div>
        ` : "";

        const statsHtml = options?.stats ? `
            <div class="kyo-modal-stats">
                <div class="kyo-modal-stat">
                    <span class="kyo-modal-stat-value">${options.stats.deleted || 0}</span>
                    <span class="kyo-modal-stat-label">${this.i18n("progressDeleted")}</span>
                </div>
                <div class="kyo-modal-stat">
                    <span class="kyo-modal-stat-value">${options.stats.failed || 0}</span>
                    <span class="kyo-modal-stat-label">${this.i18n("progressFailed")}</span>
                </div>
                <div class="kyo-modal-stat">
                    <span class="kyo-modal-stat-value">${options.stats.total || 0}</span>
                    <span class="kyo-modal-stat-label">${this.i18n("progressTotal")}</span>
                </div>
            </div>
        ` : "";

        const bodyHtml = body ? `<div style="margin-bottom: ${statsHtml ? "0" : "20px"}">${this.escapeHtml(body)}</div>` : "";

        this.overlay.innerHTML = `
            <div class="kyo-modal">
                <div class="kyo-modal-header">
                    ${iconHtml}
                    <h3 class="kyo-modal-title">${this.escapeHtml(title)}</h3>
                </div>
                <div class="kyo-modal-body">
                    ${bodyHtml}
                    ${statsHtml}
                </div>
                <div class="kyo-modal-footer" id="kyo-modal-buttons"></div>
            </div>
        `;

        document.body.appendChild(this.overlay);

        const buttonsContainer = this.overlay.querySelector("#kyo-modal-buttons");
        if (buttonsContainer) {
            buttons.forEach(btn => {
                const buttonEl = document.createElement("button");
                buttonEl.className = btn.primary ? "kyo-modal-button" : "kyo-modal-button kyo-modal-button-secondary";
                buttonEl.textContent = btn.text;
                buttonEl.addEventListener("click", () => {
                    btn.onClick();
                    this.hide();
                });
                buttonsContainer.appendChild(buttonEl);
            });
        }

        if (buttons.length === 1) {
            this.overlay.addEventListener("click", (e) => {
                if (e.target === this.overlay) this.hide();
            });
        }
    }

    alert(title, body, options) {
        return new Promise(resolve => {
            this.show(title, body, [{
                text: this.i18n("modalOk"),
                primary: true,
                onClick: () => resolve()
            }], options);
        });
    }

    confirm(title, body, options) {
        return new Promise(resolve => {
            this.show(title, body, [
                {
                    text: this.i18n("modalCancel"),
                    primary: false,
                    onClick: () => resolve(false)
                },
                {
                    text: this.i18n("modalConfirm"),
                    primary: true,
                    onClick: () => resolve(true)
                }
            ], options);
        });
    }

    hide() {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }

    escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }
}

class DiscordAPI {
    constructor() {
        this.token = "";
        this.currentUserId = "";
    }

    async initialize() {
        try {
            this.token = await this.getTokenFromDiscord();
            if (!this.token) return false;

            const user = await this.getCurrentUser();
            if (user) {
                this.currentUserId = user.id;
                return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    async getTokenFromDiscord() {
        return new Promise(resolve => {
            try {
                let tokenFound = false;
                const onTokenFound = (e) => {
                    if (e.detail && !tokenFound) {
                        tokenFound = true;
                        document.removeEventListener("kyo-token-found", onTokenFound);
                        cleanup();
                        resolve(e.detail);
                    }
                };

                document.addEventListener("kyo-token-found", onTokenFound);

                const cleanup = () => {
                    const el = document.getElementById("kyo-token-extractor");
                    if (el) el.remove();
                };

                cleanup();

                const script = document.createElement("script");
                script.id = "kyo-token-extractor";
                script.src = chrome.runtime.getURL("inject.js");
                script.onload = () => {
                    setTimeout(() => {
                        if (!tokenFound) {
                            document.removeEventListener("kyo-token-found", onTokenFound);
                            cleanup();
                            resolve("");
                        }
                    }, 8000);
                };
                script.onerror = () => {
                    document.removeEventListener("kyo-token-found", onTokenFound);
                    cleanup();
                    resolve("");
                };

                (document.head || document.documentElement).appendChild(script);

                setTimeout(() => {
                    if (!tokenFound) {
                        document.removeEventListener("kyo-token-found", onTokenFound);
                        cleanup();
                        resolve("");
                    }
                }, 10000);
            } catch (e) {
                resolve("");
            }
        });
    }

    async request(url, options = {}) {
        const startTime = Date.now();
        if (!options.headers) options.headers = {};
        options.headers["Authorization"] = this.token;
        options.headers["Content-Type"] = "application/json";
        
        try {
            const res = await fetch(url, options);
            const latency = Date.now() - startTime;
            if (window.kyoPanel && window.kyoPanel.updateLiveConsole) {
                window.kyoPanel.updateLiveConsole(options.method || "GET", url, res.status, latency);
            }
            return res;
        } catch (e) {
            const latency = Date.now() - startTime;
            if (window.kyoPanel && window.kyoPanel.updateLiveConsole) {
                window.kyoPanel.updateLiveConsole(options.method || "GET", url, 500, latency);
            }
            throw e;
        }
    }

    async getCurrentUser() {
        try {
            const res = await this.request("https://discord.com/api/v9/users/@me");
            return res.ok ? await res.json() : null;
        } catch (e) {
            return null;
        }
    }

    async getDMChannels() {
        try {
            const res = await this.request("https://discord.com/api/v9/users/@me/channels");
            if (!res.ok) return [];
            return await res.json();
        } catch (e) {
            return [];
        }
    }

    async getRelationshipDMChannels() {
        try {
            const res = await this.request("https://discord.com/api/v9/users/@me/relationships");
            if (!res.ok) return [];
            return await res.json();
        } catch (e) {
            return [];
        }
    }

    async createDMChannel(recipientId) {
        try {
            const res = await this.request("https://discord.com/api/v9/users/@me/channels", {
                method: "POST",
                body: JSON.stringify({ recipient_id: recipientId })
            });
            if (!res.ok) return null;
            return await res.json();
        } catch (e) {
            return null;
        }
    }

    getCurrentChannelId() {
        const match = window.location.pathname.match(/\/channels\/(?:@me|\d+)\/(\d+)/);
        return match ? match[1] : null;
    }

    isDMsSection() {
        return window.location.pathname.startsWith("/channels/@me");
    }

    isGuildChannel() {
        const match = window.location.pathname.match(/\/channels\/(\d+)\/(\d+)/);
        return match !== null && match[1] !== "@me";
    }

    isDMPage() {
        return window.location.pathname.includes("/channels/@me/") && this.getCurrentChannelId() !== null;
    }

    getCurrentUserId() {
        return this.currentUserId;
    }

    async fetchMessagesBatch(channelId, beforeId = null, limit = 100) {
        try {
            const url = beforeId
                ? `https://discord.com/api/v9/channels/${channelId}/messages?before=${beforeId}&limit=${limit}`
                : `https://discord.com/api/v9/channels/${channelId}/messages?limit=${limit}`;

            const res = await this.request(url);
            if (res.status === 429) {
                let delayMs = 2500;
                try {
                    const data = await res.json();
                    const retryAfter = data.retry_after || 2.5;
                    delayMs = retryAfter < 100 ? (retryAfter * 1000) : retryAfter;
                } catch (jsonErr) {
                    const headerRetry = res.headers.get("retry-after");
                    if (headerRetry) delayMs = parseFloat(headerRetry) * 1000;
                }
                throw new RateLimitError(delayMs);
            }
            if (!res.ok) return [];
            return await res.json();
        } catch (e) {
            if (e instanceof RateLimitError) throw e;
            return [];
        }
    }

    async deleteMessage(channelId, messageId) {
        try {
            const res = await this.request(`https://discord.com/api/v9/channels/${channelId}/messages/${messageId}`, {
                method: "DELETE"
            });
            if (res.status === 204 || res.ok) return true;
            if (res.status === 429) {
                let delayMs = 2500;
                try {
                    const data = await res.json();
                    const retryAfter = data.retry_after || 2.5;
                    delayMs = retryAfter < 100 ? (retryAfter * 1000) : retryAfter;
                } catch (jsonErr) {
                    const headerRetry = res.headers.get("retry-after");
                    if (headerRetry) delayMs = parseFloat(headerRetry) * 1000;
                }
                throw new RateLimitError(delayMs);
            }
            return false;
        } catch (e) {
            if (e instanceof RateLimitError) throw e;
            return false;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

class DeletePanel {
    constructor(api) {
        this.panel = null;
        this.progressBar = null;
        this.isDeleting = false;
        this.shouldStop = false;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.deleteStatus = { total: 0, deleted: 0, failed: 0 };
        this.deletedLog = [];
        this.api = api;
        this.modal = new ModalManager();
        this.sound = new SoundEffects();
        this.matrixInterval = null;
        this.selectedDeleteMode = "single";
        this.activeDeleteSession = null;
    }

    initWorkspace() {
        initWorkspace();
    }

    i18n(key, substitutions) {
        return chrome.i18n.getMessage(key, substitutions);
    }

    inject() {
        if (!this.api.isDMsSection() && !this.api.isGuildChannel()) return;

        if (!document.getElementById("kyo-delete-panel")) {
            window.kyoPanel = this;
            
            let backdrop = document.querySelector(".kyo-loading-backdrop");
            if (!backdrop) {
                backdrop = document.createElement("div");
                backdrop.className = "kyo-loading-backdrop";
                document.body.appendChild(backdrop);
            }
            backdrop.classList.add("active");

            this.panel = this.createPanel();
            this.panel.classList.add("kyo-loading-center");

            document.body.appendChild(this.panel);
            this.attachEventListeners();
            
            // Set saved theme
            const savedTheme = Storage.getRaw("theme") || "cyberpunk";
            this.changeTheme(savedTheme);

            this.loadLifetimeStats().then(stats => this.renderLifetimeStats(stats.deleted, stats.bytes));
            
            // Bootsplash Screen - Enhanced Cyber Terminal Console
            const bootOverlay = document.createElement("div");
            bootOverlay.className = "kyo-boot-overlay";
            bootOverlay.innerHTML = `
                <div style="font-size: 14px; letter-spacing: 2px; margin-bottom: 8px; font-weight: bold; text-shadow: 0 0 8px #00ff00; font-family: monospace;">SYSTEM BOOT IN PROGRESS</div>
                <div id="kyo-boot-console" style="width:90%; max-height:120px; overflow:hidden; font-family: 'Consolas', 'Courier New', monospace; font-size:9px; line-height:1.6; text-align:left; margin-bottom:10px; color:#00ff00; border: 1px solid rgba(0,255,0,0.2); padding: 6px 8px; border-radius: 4px; background: rgba(0,20,0,0.6);"></div>
                <div class="kyo-boot-bar-container">
                    <div id="kyo-boot-bar-fill" class="kyo-boot-bar-fill"></div>
                </div>
                <div id="kyo-boot-percentage" style="font-size: 12px; margin-top: 6px; font-family: monospace;">0%</div>
            `;
            this.panel.appendChild(bootOverlay);

            let progress = 0;
            const bootConsole = bootOverlay.querySelector("#kyo-boot-console");
            const consoleLines = [
                { pct: 0,  text: "[ INIT ] Loading Kaptan DM Cleaner v4.0.0...", color: "#00ff00" },
                { pct: 5,  text: "[ OK   ] Core runtime initialized.", color: "#00ff00" },
                { pct: 10, text: "[ OK   ] Audio synthesizer oscillators ready.", color: "#00ff00" },
                { pct: 15, text: "[ .... ] Scanning Discord webpackChunk modules...", color: "#aaffaa" },
                { pct: 22, text: "[ OK   ] Token decryption service active.", color: "#00ff00" },
                { pct: 30, text: "[ OK   ] Secure API gateway tunnel established.", color: "#00ff00" },
                { pct: 38, text: "[ .... ] Loading AI filter engine (heuristic v3)...", color: "#aaffaa" },
                { pct: 45, text: "[ OK   ] Sentiment analyzer calibrated.", color: "#00ff00" },
                { pct: 52, text: "[ OK   ] Background particle renderer compiled.", color: "#00ff00" },
                { pct: 58, text: "[ OK   ] Theme engine initialized (8 themes).", color: "#00ff00" },
                { pct: 65, text: "[ OK   ] Achievement system loaded (12 badges).", color: "#00ff00" },
                { pct: 72, text: "[ .... ] Establishing rate-limiter safeguards...", color: "#aaffaa" },
                { pct: 78, text: "[ OK   ] Scheduler & age-filter modules online.", color: "#00ff00" },
                { pct: 85, text: "[ OK   ] HTML report exporter ready.", color: "#00ff00" },
                { pct: 90, text: "[ OK   ] Sound pack library (6 packs) verified.", color: "#00ff00" },
                { pct: 95, text: "[ OK   ] All subsystems nominal.", color: "#00ffaa" },
                { pct: 100, text: "[ READY ] SYSTEM OPERATIONAL. WELCOME COMMANDER!", color: "#ffff00" }
            ];
            let lastLineIndex = -1;

            const interval = setInterval(() => {
                progress += Math.floor(Math.random() * 6) + 3;
                if (progress >= 100) {
                    progress = 100;
                    clearInterval(interval);
                    // Append final line
                    const finalLine = consoleLines[consoleLines.length - 1];
                    const finalSpan = document.createElement("div");
                    finalSpan.style.color = finalLine.color;
                    finalSpan.textContent = finalLine.text;
                    bootConsole.appendChild(finalSpan);
                    bootConsole.scrollTop = bootConsole.scrollHeight;
                    
                    setTimeout(() => {
                        bootOverlay.style.transition = "opacity 0.4s ease";
                        bootOverlay.style.opacity = "0";
                        setTimeout(() => {
                            bootOverlay.remove();
                            this.sound.play("success");
                            this.showAuthenticating();
                            this.initBackgroundCanvas();
                        }, 400);
                    }, 500);
                }
                
                // Append console lines based on progress
                for (let i = lastLineIndex + 1; i < consoleLines.length; i++) {
                    if (progress >= consoleLines[i].pct && i > lastLineIndex) {
                        const lineEl = document.createElement("div");
                        lineEl.style.color = consoleLines[i].color;
                        lineEl.style.opacity = "0";
                        lineEl.textContent = consoleLines[i].text;
                        bootConsole.appendChild(lineEl);
                        // Animate in
                        requestAnimationFrame(() => {
                            lineEl.style.transition = "opacity 0.2s ease";
                            lineEl.style.opacity = "1";
                        });
                        bootConsole.scrollTop = bootConsole.scrollHeight;
                        lastLineIndex = i;
                    }
                }
                
                const pFill = bootOverlay.querySelector("#kyo-boot-bar-fill");
                const pPerc = bootOverlay.querySelector("#kyo-boot-percentage");
                if (pFill) pFill.style.width = `${progress}%`;
                if (pPerc) pPerc.innerText = `${progress}%`;
            }, 80);
        }
    }

    changeTheme(themeName) {
        if (!this.panel) return;
        const themes = ["theme-discord", "theme-cyberpunk", "theme-matrix", "theme-gotham", "theme-amoled", "theme-neonpurple", "theme-crimsonred", "theme-amoledgold"];
        themes.forEach(t => this.panel.classList.remove(t));
        this.panel.classList.add(`theme-${themeName}`);
        Storage.setRaw("theme", themeName);
        
        const packMapping = {
            "discord": "soft",
            "cyberpunk": "cyber",
            "matrix": "hacker",
            "gotham": "minimal",
            "amoled": "minimal",
            "neonpurple": "cyber",
            "crimsonred": "mechanical",
            "amoledgold": "synthwave"
        };
        const pack = packMapping[themeName] || "cyber";
        this.sound.soundPack = pack;
        Storage.setRaw("sound_pack", pack);
    }

    changeBackgroundEffect(effectName) {
        Storage.setRaw("bg_effect", effectName);
        this.initBackgroundCanvas();
    }

    applyFont(fontKey) {
        if (!this.panel) return;
        const fontMap = {
            "outfit": "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
            "grotesk": "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
            "hacker": "'Consolas', 'Courier New', 'Fira Code', monospace"
        };
        this.panel.style.fontFamily = fontMap[fontKey] || fontMap["outfit"];
    }

    startSparkles(el) {
        if (el._sparkleInterval) return;
        el.style.position = "relative";
        el.style.overflow = "visible";
        el._sparkleInterval = setInterval(() => {
            const sparkle = document.createElement("span");
            sparkle.className = "kyo-sparkle-particle";
            sparkle.textContent = ["✦", "✧", "⬥", "◆", "⬦", "★"][Math.floor(Math.random() * 6)];
            sparkle.style.cssText = `
                position: absolute;
                pointer-events: none;
                font-size: ${6 + Math.random() * 8}px;
                left: ${Math.random() * 100}%;
                top: ${Math.random() * 100}%;
                color: var(--kyo-accent, #ff007f);
                text-shadow: 0 0 6px var(--kyo-accent-glow, rgba(255,0,127,0.8));
                opacity: 1;
                z-index: 10;
                animation: kyo-sparkle-fly ${0.4 + Math.random() * 0.6}s ease-out forwards;
            `;
            el.appendChild(sparkle);
            setTimeout(() => sparkle.remove(), 1000);
        }, 80);
    }

    stopSparkles(el) {
        if (el._sparkleInterval) {
            clearInterval(el._sparkleInterval);
            el._sparkleInterval = null;
        }
    }

    initBackgroundCanvas() {
        if (!this.panel) return;
        const oldCanvas = this.panel.querySelector(".kyo-canvas-container");
        if (oldCanvas) oldCanvas.remove();

        const effect = Storage.getRaw("bg_effect") || "particles";
        if (effect === "none") return;

        const canvasContainer = document.createElement("div");
        canvasContainer.className = "kyo-canvas-container";
        const canvas = document.createElement("canvas");
        canvas.className = "kyo-canvas-bg";
        canvasContainer.appendChild(canvas);
        this.panel.appendChild(canvasContainer);

        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        let width = canvas.width = this.panel.offsetWidth || 420;
        let height = canvas.height = this.panel.offsetHeight || 500;

        window.addEventListener("resize", () => {
            if (canvas) {
                width = canvas.width = this.panel.offsetWidth || 420;
                height = canvas.height = this.panel.offsetHeight || 500;
            }
        });

        if (effect === "particles") {
            const particles = [];
            for (let i = 0; i < 25; i++) {
                particles.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    r: Math.random() * 3 + 1,
                    vx: Math.random() * 0.4 - 0.2,
                    vy: Math.random() * 0.4 - 0.2,
                    alpha: Math.random() * 0.4 + 0.2
                });
            }
            const animate = () => {
                if (!this.panel || !this.panel.contains(canvas)) return;
                ctx.clearRect(0, 0, width, height);
                ctx.fillStyle = "rgba(127, 0, 255, 0.4)";
                particles.forEach(p => {
                    p.x += p.vx;
                    p.y += p.vy;
                    if (p.x < 0 || p.x > width) p.vx *= -1;
                    if (p.y < 0 || p.y > height) p.vy *= -1;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                    ctx.globalAlpha = p.alpha;
                    ctx.fill();
                });
                ctx.globalAlpha = 1.0;
                requestAnimationFrame(animate);
            };
            animate();
        } else if (effect === "matrix") {
            const columns = Math.floor(width / 14);
            const yPositions = Array(columns).fill(0);
            const chars = "01010101010101010111";
            const animate = () => {
                if (!this.panel || !this.panel.contains(canvas)) return;
                ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
                ctx.fillRect(0, 0, width, height);
                ctx.fillStyle = "#0f0";
                ctx.font = "9px monospace";
                for (let i = 0; i < yPositions.length; i++) {
                    const char = chars[Math.floor(Math.random() * chars.length)];
                    const x = i * 14;
                    const y = yPositions[i];
                    ctx.fillText(char, x, y);
                    if (y > height && Math.random() > 0.975) {
                        yPositions[i] = 0;
                    } else {
                        yPositions[i] += 12;
                    }
                }
                setTimeout(() => requestAnimationFrame(animate), 50);
            };
            animate();
        } else if (effect === "grid") {
            const animate = () => {
                if (!this.panel || !this.panel.contains(canvas)) return;
                ctx.clearRect(0, 0, width, height);
                ctx.strokeStyle = "rgba(255, 0, 127, 0.05)";
                ctx.lineWidth = 1;
                for (let x = 0; x < width; x += 25) {
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, height);
                    ctx.stroke();
                }
                for (let y = 0; y < height; y += 25) {
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(width, y);
                    ctx.stroke();
                }
                requestAnimationFrame(animate);
            };
            animate();
        } else if (effect === "dots") {
            const dots = [];
            for (let i = 0; i < 35; i++) {
                dots.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    alpha: Math.random(),
                    speed: Math.random() * 0.02 + 0.005
                });
            }
            const animate = () => {
                if (!this.panel || !this.panel.contains(canvas)) return;
                ctx.clearRect(0, 0, width, height);
                ctx.fillStyle = "#ffffff";
                dots.forEach(d => {
                    d.alpha += d.speed;
                    if (d.alpha > 1 || d.alpha < 0) d.speed *= -1;
                    ctx.beginPath();
                    ctx.arc(d.x, d.y, 1.5, 0, Math.PI * 2);
                    ctx.globalAlpha = Math.max(0, Math.min(1, d.alpha));
                    ctx.fill();
                });
                ctx.globalAlpha = 1.0;
                requestAnimationFrame(animate);
            };
            animate();
        }
    }

    showAuthenticating() {
        if (!this.panel) return;
        const container = this.panel.querySelector("#kyo-status-container");
        const contents = this.panel.querySelectorAll(".kyo-tab-content");
        const tabs = this.panel.querySelector(".kyo-tabs-container");

        if (container) {
            container.innerHTML = `
                <div class="kyo-status kyo-status-authenticating" style="min-height: 130px; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; overflow: hidden; border-radius: 8px;">
                    <canvas id="kyo-matrix-canvas" class="kyo-matrix-canvas"></canvas>
                    <div class="kyo-scanner-line"></div>
                    <div class="kyo-spinner" style="z-index: 2;"></div>
                    <span id="kyo-loading-step-text" class="kyo-status-authenticating-text" style="margin-top: 16px; font-size: 13px; color: #ffffff; font-weight: 600; text-shadow: 0 0 10px rgba(255,255,255,0.5); z-index: 2;">${this.i18n("stepSearchingToken")}</span>
                </div>
            `;
            this.startMatrixRain();
        }
        contents.forEach(el => el.style.display = "none");
        if (tabs) tabs.style.display = "none";
    }

    startMatrixRain() {
        this.stopMatrixRain();
        const canvas = this.panel?.querySelector("#kyo-matrix-canvas");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        
        canvas.width = canvas.offsetWidth || 312;
        canvas.height = 130;
        
        const columns = Math.floor(canvas.width / 12);
        const yPositions = Array(columns).fill(0);
        const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ☠☢☣⚡";
        
        const draw = () => {
            if (!ctx) return;
            ctx.fillStyle = "rgba(10, 10, 10, 0.15)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.fillStyle = "#ffffff";
            ctx.font = "8px monospace";
            
            for (let i = 0; i < yPositions.length; i++) {
                const char = chars[Math.floor(Math.random() * chars.length)];
                const x = i * 12;
                const y = yPositions[i];
                
                ctx.fillText(char, x, y);
                
                if (y > canvas.height && Math.random() > 0.975) {
                    yPositions[i] = 0;
                } else {
                    yPositions[i] += 12;
                }
            }
        };
        
        this.matrixInterval = setInterval(draw, 45);
    }

    stopMatrixRain() {
        if (this.matrixInterval) {
            clearInterval(this.matrixInterval);
            this.matrixInterval = null;
        }
    }

    updateLoadingStep(text) {
        if (!this.panel) return;
        const label = this.panel.querySelector("#kyo-loading-step-text");
        if (label) {
            label.textContent = text;
        }
    }

    showAuthenticated() {
        this.stopMatrixRain();
        if (!this.panel) return;
        const container = this.panel.querySelector("#kyo-status-container");
        const contents = this.panel.querySelectorAll(".kyo-tab-content");
        const tabs = this.panel.querySelector(".kyo-tabs-container");

        if (container) container.innerHTML = "";
        
        // Remove loading state transitions
        this.panel.classList.remove("kyo-loading-center");
        const backdrop = document.querySelector(".kyo-loading-backdrop");
        if (backdrop) backdrop.classList.remove("active");
        
        const activeTabBtn = this.panel.querySelector(".kyo-tab-button.active");
        if (activeTabBtn) {
            const activeTabId = activeTabBtn.id === "kyo-tab-cleaner-btn" ? "#kyo-tab-cleaner-content" : "#kyo-tab-hidden-content";
            const activeContent = this.panel.querySelector(activeTabId);
            if (activeContent) activeContent.style.display = "block";
        } else {
            const cleanerContent = this.panel.querySelector("#kyo-tab-cleaner-content");
            if (cleanerContent) cleanerContent.style.display = "block";
        }

        if (tabs && !this.api.isGuildChannel()) {
            tabs.style.display = "flex";
        } else if (tabs) {
            tabs.style.display = "none";
        }

        // Start background developer loops and tools
        this.startDebugStatsLoop();
        this.renderResumeBanner();
        this.checkDuplicateAttachments();
        this.loadAnalyticsDashboard();
        
        // Render Delete Mode Cards
        this.renderDeleteModeCards();
    }

    showAuthError(err) {
        this.stopMatrixRain();
        if (!this.panel) return;
        const container = this.panel.querySelector("#kyo-status-container");
        const contents = this.panel.querySelectorAll(".kyo-tab-content");
        const tabs = this.panel.querySelector(".kyo-tabs-container");

        // Remove loading state transitions
        this.panel.classList.remove("kyo-loading-center");
        const backdrop = document.querySelector(".kyo-loading-backdrop");
        if (backdrop) backdrop.classList.remove("active");

        if (container) {
            container.innerHTML = `
                <div class="kyo-status kyo-status-error">
                    <div class="kyo-status-icon error">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="m15 9-6 6M9 9l6 6"/>
                        </svg>
                    </div>
                    <span class="kyo-status-text">${this.escapeHtml(err || this.i18n("statusAuthError"))}</span>
                </div>
            `;
        }
        contents.forEach(el => el.style.display = "none");
        if (tabs) tabs.style.display = "none";
    }

    escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    hexToRgba(hex, alpha) {
        hex = hex.replace("#", "");
        if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
        const r = parseInt(hex.substring(0, 2), 16) || 0;
        const g = parseInt(hex.substring(2, 4), 16) || 0;
        const b = parseInt(hex.substring(4, 6), 16) || 0;
        return `rgba(${r},${g},${b},${alpha})`;
    }

    createPanel() {
        const isServer = this.api.isGuildChannel();
        const titleText = isServer ? this.i18n("panelServerTitle") : this.i18n("panelTitle");
        
        const panelEl = document.createElement("div");
        panelEl.id = "kyo-delete-panel";
        const savedStealth = Storage.getRaw("stealth_mode") === "true";
        if (savedStealth) {
            panelEl.classList.add("kyo-stealth-active");
            setTimeout(() => this.showStealthAnchor(), 150);
        }
        panelEl.innerHTML = `
            <div class="kyo-laser-scanner"></div>
            <div id="kyo-delete-panel-header">
                <div id="kyo-delete-panel-title">
                    <div class="kyo-logo">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="5" r="2.5"/>
                            <line x1="12" y1="7.5" x2="12" y2="19"/>
                            <line x1="8" y1="11" x2="16" y2="11"/>
                            <path d="M5 12a7 7 0 0 0 14 0"/>
                            <path d="M19 12l2-2M5 12L3 10"/>
                        </svg>
                    </div>
                    <span>${titleText}</span>
                </div>
                <div style="display: flex; align-items: center;">
                    <button id="kyo-stealth-toggle" title="Hayalet Modu (Stealth Mode)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M9 12h.01M15 12h.01M12 2a8 8 0 0 0-8 8v12l3-3 3 3 3-3 3 3 3-3 3 3V10a8 8 0 0 0-8-8z"/>
                        </svg>
                    </button>
                    <button id="kyo-delete-panel-close">${this.i18n("panelClose")}</button>
                </div>
            </div>

            <!-- Tab Buttons (hidden if Server Channel) -->
            <div class="kyo-tabs-container" style="${isServer ? 'display:none;' : ''}">
                <button class="kyo-tab-button active" id="kyo-tab-cleaner-btn">${this.i18n("tabCleaner")}</button>
                <button class="kyo-tab-button" id="kyo-tab-hidden-btn">${this.i18n("tabHiddenDMs")}</button>
                <button class="kyo-tab-button" id="kyo-tab-analytics-btn">İstatistikler &amp; Başarımlar</button>
            </div>

            <div id="kyo-status-container"></div>
            <div id="kyo-resume-container" style="padding: 0 16px; margin-top: 10px;"></div>

            <!-- TAB 1: Cleaner Content -->
            <div id="kyo-tab-cleaner-content" class="kyo-tab-content active" style="padding: 16px; overflow-y: auto; max-height: calc(85vh - 150px);">
                <!-- Delete Mode Cards (hidden if Server Channel) -->
                <div class="kyo-mode-cards" style="${isServer ? 'display:none;' : ''}"></div>

                <div class="kyo-form-group" id="kyo-limit-group">
                    <label>${this.i18n("panelMessageLimit")}</label>
                    <input type="number" id="kyo-limit" value="100" min="1" max="5000" placeholder="${this.i18n("panelMessageLimitPlaceholder")}">
                </div>

                <div class="kyo-options-group" style="margin-bottom: 15px; display: flex; flex-direction: column; gap: 8px;">
                    <label class="kyo-checkbox-label">
                        <input type="checkbox" id="kyo-delete-all">
                        <span>${this.i18n("panelDeleteAll")}</span>
                    </label>
                </div>

                <!-- Scope Options (hidden if Server Channel) -->
                <div class="kyo-scope-options" style="margin-bottom: 15px; display: ${isServer ? 'none' : 'flex'}; flex-direction: column; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 12px;">
                    <label style="font-size: 11px; color: #888888; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; margin-bottom: 2px;">Temizlik Kapsamı (Scope)</label>
                    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                        <label class="kyo-checkbox-label" style="font-size: 11px; margin-bottom: 0;">
                            <input type="checkbox" id="kyo-target-dms" checked>
                            <span>Bireysel DM'ler</span>
                        </label>
                        <label class="kyo-checkbox-label" style="font-size: 11px; margin-bottom: 0;">
                            <input type="checkbox" id="kyo-target-groups" checked>
                            <span>Grup Sohbetleri</span>
                        </label>
                        <label class="kyo-checkbox-label" style="font-size: 11px; margin-bottom: 0; color: var(--kyo-accent, #00f0ff);">
                            <input type="checkbox" id="kyo-whitelist-favorites">
                            <span style="font-weight: bold;">Favorileri Koru 🔒</span>
                        </label>
                    </div>
                </div>

                <!-- Scrollable DM Selection List (Only displayed when Clear All DMs is checked) -->
                <div id="kyo-dm-selector-container" style="display: none; margin-bottom: 15px;">
                    <label style="font-size: 12px; color: #888888; display: block; margin-bottom: 4px;">${this.i18n("selectDMsLabel")}</label>
                    <input type="text" id="kyo-dm-search" class="kyo-adv-input" placeholder="Kullanıcı veya Grup Ara..." style="width: 100%; margin-bottom: 8px; box-sizing: border-box; padding: 8px 10px !important; font-size: 12px !important;">
                    <div class="kyo-dm-quick-actions" style="margin-bottom: 6px; display: flex; gap: 8px; flex-wrap: wrap;">
                        <button type="button" class="kyo-dm-quick-btn" id="kyo-dm-select-all">Tümünü Seç</button>
                        <button type="button" class="kyo-dm-quick-btn" id="kyo-dm-deselect-all">Temizle</button>
                        <button type="button" class="kyo-dm-quick-btn" id="kyo-dm-select-groups">Grupları Seç</button>
                        <button type="button" class="kyo-dm-quick-btn" id="kyo-dm-select-favs">Favorileri Seç</button>
                    </div>
                    <div class="kyo-dm-selector-list" id="kyo-dm-picker-list" style="margin-top: 0; margin-bottom: 0;"></div>
                </div>

                <!-- AI Filtering Container -->
                <div class="kyo-ai-container">
                    <label>${this.i18n("aiInputLabel")}</label>
                    <div class="kyo-ai-suggestions">
                        <div class="kyo-ai-tag" data-prompt="sadece resimler ve videolar">Medya</div>
                        <div class="kyo-ai-tag" data-prompt="sadece bağlantılar ve linkler">Linkler</div>
                        <div class="kyo-ai-tag" data-prompt="küfürleri sil">Küfürler</div>
                    </div>
                    <textarea class="kyo-ai-input" id="kyo-ai-input" placeholder="${this.i18n("aiInputPlaceholder")}"></textarea>
                </div>
                
                <!-- Gelişmiş Seçenekler Accordion -->
                <div class="kyo-accordion" id="kyo-adv-accordion">
                    <div class="kyo-accordion-header" id="kyo-adv-accordion-header">
                        <span>${this.i18n("advSettingsTitle")}</span>
                        <svg class="kyo-accordion-arrow" viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
                    </div>
                    <div class="kyo-accordion-content">
                        <!-- Theme, Background, Sound Selectors -->
                        <div class="kyo-adv-field-group">
                            <label>Tema Seçimi</label>
                            <select class="kyo-adv-input" id="kyo-theme-select" style="width:100%; box-sizing:border-box; color:#fff; background: var(--kyo-bg-header, #121212);">
                                <option value="cyberpunk">Cyberpunk</option>
                                <option value="discord">Discord</option>
                                <option value="matrix">Matrix</option>
                                <option value="gotham">Gotham</option>
                                <option value="amoled">AMOLED</option>
                                <option value="neonpurple">Neon Purple</option>
                                <option value="crimsonred">Crimson Red</option>
                                <option value="amoledgold">AMOLED Gold</option>
                            </select>
                        </div>
                        <div class="kyo-adv-field-group">
                            <label>Arka Plan Efekti</label>
                            <select class="kyo-adv-input" id="kyo-bg-effect-select" style="width:100%; box-sizing:border-box; color:#fff; background: var(--kyo-bg-header, #121212);">
                                <option value="particles">Particles</option>
                                <option value="matrix">Matrix Rain</option>
                                <option value="grid">Neon Grid</option>
                                <option value="dots">Floating Dots</option>
                                <option value="none">Yok</option>
                            </select>
                        </div>
                        <div class="kyo-adv-field-group">
                            <label>Ses Paketi</label>
                            <select class="kyo-adv-input" id="kyo-sound-pack-select" style="width:100%; box-sizing:border-box; color:#fff; background: var(--kyo-bg-header, #121212);">
                                <option value="cyber">Cyber</option>
                                <option value="mechanical">Mechanical</option>
                                <option value="soft">Soft</option>
                                <option value="hacker">Hacker</option>
                                <option value="minimal">Minimal</option>
                                <option value="synthwave">Retro Synthwave</option>
                            </select>
                        </div>
                        <div class="kyo-scheduler-container">
                            <div class="kyo-adv-field-group" style="margin-bottom:8px;">
                                <label>Zaman Ayarlı Temizlik (Gecikme)</label>
                                <select class="kyo-adv-input" id="kyo-scheduler-delay" style="width:100%; box-sizing:border-box; color:#fff; background: var(--kyo-bg-header, #121212);">
                                    <option value="0">Devre Dışı (Hemen Başla)</option>
                                    <option value="5">5 Saniye Geciktir (Test)</option>
                                    <option value="30">30 Saniye Geciktir</option>
                                    <option value="60">1 Dakika Geciktir</option>
                                    <option value="300">5 Dakika Geciktir</option>
                                    <option value="600">10 Dakika Geciktir</option>
                                    <option value="1800">30 Dakika Geciktir</option>
                                </select>
                            </div>
                            <div class="kyo-adv-field-group" style="margin-bottom:0;">
                                <label>Yaş Filtresi (Tarih Sınırı)</label>
                                <select class="kyo-adv-input" id="kyo-scheduler-age-filter" style="width:100%; box-sizing:border-box; color:#fff; background: var(--kyo-bg-header, #121212);">
                                    <option value="0">Tüm Zamanlar (Filtresiz)</option>
                                    <option value="7">7 Günden Eski Mesajlar</option>
                                    <option value="30">30 Günden Eski Mesajlar</option>
                                    <option value="90">90 Günden Eski Mesajlar</option>
                                    <option value="180">6 Aydan Eski Mesajlar</option>
                                    <option value="365">1 Yıldan Eski Mesajlar</option>
                                </select>
                            </div>
                        </div>
                        <div class="kyo-adv-field-group">
                            <label>Ses Seviyesi (Volume)</label>
                            <input type="range" id="kyo-sound-volume-slider" min="0" max="1" step="0.05" value="0.5" class="kyo-adv-input" style="width: 100%; box-sizing: border-box; height: 6px; padding: 0 !important; cursor: pointer;">
                        </div>
                        <div class="kyo-adv-field-group">
                            <label>Silme Gecikmesi: <span id="kyo-delay-val">1200</span>ms</label>
                            <input type="range" id="kyo-delay-slider" min="500" max="5000" step="100" value="1200" class="kyo-adv-input" style="width: 100%; box-sizing: border-box; height: 6px; padding: 0 !important; cursor: pointer;">
                            <div style="display:flex; justify-content:space-between; font-size:9px; color:#888; margin-top:2px;">
                                <span>Hızlı (Riskli)</span>
                                <span>Güvenli (Yavaş)</span>
                            </div>
                        </div>
                        <div class="kyo-adv-field-group">
                            <label>Yazı Tipi Seçimi</label>
                            <select class="kyo-adv-input" id="kyo-font-select" style="width:100%; box-sizing:border-box; color:#fff; background: var(--kyo-bg-header, #121212);">
                                <option value="outfit">🎨 Sleek Modern (Outfit)</option>
                                <option value="grotesk">🚀 Sci-Fi Cyber (Space Grotesk)</option>
                                <option value="hacker">💀 Pure Hacker (Monospace)</option>
                            </select>
                        </div>

                        <!-- Presets Selection -->
                        <div class="kyo-adv-field-group">
                            <label>Hazır Şablonlar (Presets)</label>
                            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px;">
                                <button type="button" class="kyo-dm-quick-btn preset-btn" data-preset="media">Medya Temizleyici</button>
                                <button type="button" class="kyo-dm-quick-btn preset-btn" data-preset="memories">Eski Anılar</button>
                                <button type="button" class="kyo-dm-quick-btn preset-btn" data-preset="spam">Spam Temizleyici</button>
                                <button type="button" class="kyo-dm-quick-btn preset-btn" data-preset="ghost">Hayalet Modu</button>
                            </div>
                        </div>

                        <!-- Query Builder Checkboxes -->
                        <div class="kyo-adv-field-group">
                            <label>Gelişmiş Filtre Oluşturucu (Query Builder)</label>
                            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; font-size: 11px; margin-bottom: 4px;">
                                <label class="kyo-checkbox-label" style="font-size:11px;"><input type="checkbox" id="q-filter-images"> ${this.i18n("filterImages")}</label>
                                <label class="kyo-checkbox-label" style="font-size:11px;"><input type="checkbox" id="q-filter-videos"> ${this.i18n("filterVideos")}</label>
                                <label class="kyo-checkbox-label" style="font-size:11px;"><input type="checkbox" id="q-filter-gifs"> ${this.i18n("filterGifs")}</label>
                                <label class="kyo-checkbox-label" style="font-size:11px;"><input type="checkbox" id="q-filter-audio"> ${this.i18n("filterAudio")}</label>
                                <label class="kyo-checkbox-label" style="font-size:11px;"><input type="checkbox" id="q-filter-zip"> ${this.i18n("filterZipRar")}</label>
                                <label class="kyo-checkbox-label" style="font-size:11px;"><input type="checkbox" id="q-filter-links"> ${this.i18n("filterLinks")}</label>
                                <label class="kyo-checkbox-label" style="font-size:11px;"><input type="checkbox" id="q-filter-embeds"> ${this.i18n("filterEmbeds")}</label>
                                <label class="kyo-checkbox-label" style="font-size:11px;"><input type="checkbox" id="q-filter-short"> ${this.i18n("filterLengthShort")}</label>
                                <label class="kyo-checkbox-label" style="font-size:11px;"><input type="checkbox" id="q-filter-long"> ${this.i18n("filterLengthLong")}</label>
                                <label class="kyo-checkbox-label" style="font-size:11px;"><input type="checkbox" id="q-filter-empty"> ${this.i18n("filterLengthEmpty")}</label>
                                <label class="kyo-checkbox-label" style="font-size:11px;"><input type="checkbox" id="q-filter-emojis"> ${this.i18n("filterEmoji")}</label>
                                <label class="kyo-checkbox-label" style="font-size:11px;"><input type="checkbox" id="q-filter-mentions"> ${this.i18n("filterMention")}</label>
                            </div>
                            <div id="q-builder-regex-preview" style="font-size: 9px; font-family: monospace; color: #888; margin-top: 4px; border: 1px dashed rgba(255,255,255,0.05); padding: 4px; background: rgba(0,0,0,0.2);">Regex: .*</div>
                        </div>

                        <!-- Whitelist Safe Words -->
                        <div class="kyo-adv-field-group">
                            <label>${this.i18n("advWhitelistLabel")}</label>
                            <input type="text" class="kyo-adv-input" id="kyo-whitelist-words" placeholder="${this.i18n("advWhitelistPlaceholder")}">
                            <label class="kyo-adv-checkbox-row">
                                <input type="checkbox" id="kyo-keep-pinned" checked>
                                <span>${this.i18n("advKeepPinnedLabel")}</span>
                            </label>
                        </div>
                        
                        <!-- Date Range Selection -->
                        <div class="kyo-adv-row-2col">
                            <div class="kyo-adv-field-group">
                                <label>${this.i18n("advDateStartLabel")}</label>
                                <input type="date" class="kyo-adv-input" id="kyo-date-start">
                            </div>
                            <div class="kyo-adv-field-group">
                                <label>${this.i18n("advDateEndLabel")}</label>
                                <input type="date" class="kyo-adv-input" id="kyo-date-end">
                            </div>
                        </div>
                        
                        <!-- Message Type Select -->
                        <div class="kyo-adv-field-group">
                            <label>${this.i18n("advMsgTypeLabel")}</label>
                            <select class="kyo-adv-input" id="kyo-msg-type-filter" style="width:100%; box-sizing:border-box; color: #ffffff; background: var(--kyo-bg-header, #121212);">
                                <option value="all">${this.i18n("advMsgTypeAll")}</option>
                                <option value="replies">${this.i18n("advMsgTypeReplies")}</option>
                                <option value="gifs">${this.i18n("advMsgTypeGifs")}</option>
                                <option value="attachments">${this.i18n("advMsgTypeAttachments")}</option>
                            </select>
                        </div>
                        
                        <!-- Switches: Backup, Ghost, Dry Run -->
                        <div class="kyo-adv-field-group" style="gap: 8px;">
                            <label class="kyo-adv-checkbox-row" style="flex-wrap: wrap;">
                                <input type="checkbox" id="kyo-backup-before">
                                <span>${this.i18n("advBackupLabel")}</span>
                                <span style="font-size: 9px; color: #f59e0b; width: 100%; margin-left: 20px; display: block; margin-top: 2px;">Maks. 2000 mesaj yedeklenebilir (Max 2000 msgs)</span>
                            </label>
                            <label class="kyo-adv-checkbox-row" id="kyo-backup-html-row" style="margin-left: 20px; display: none; margin-top: -4px; margin-bottom: 4px;">
                                <input type="checkbox" id="kyo-backup-html" checked>
                                <span style="font-size: 11px; color: #a855f7;">Görsel HTML Şablonu (Discord Style HTML)</span>
                            </label>
                            <label class="kyo-adv-checkbox-row">
                                <input type="checkbox" id="kyo-ghost-mode" checked>
                                <span>${this.i18n("advGhostModeLabel")}</span>
                            </label>
                            <label class="kyo-adv-checkbox-row">
                                <input type="checkbox" id="kyo-dry-run">
                                <span>${this.i18n("advDryRunLabel")}</span>
                            </label>
                        </div>

                        <!-- Feedback Form -->
                        <div class="kyo-feedback-container" style="margin-top: 14px;">
                            <label>${this.i18n("feedbackTitle")}</label>
                            <textarea class="kyo-feedback-textarea" id="kyo-feedback-text" placeholder="${this.i18n("feedbackPlaceholder")}"></textarea>
                            <button class="kyo-feedback-btn" id="kyo-feedback-submit">${this.i18n("feedbackSendBtn")}</button>
                        </div>
                    </div>
                </div>

                <!-- Duplicate Attachment Finder & Spam sections -->
                <div id="kyo-duplicate-finder-section" style="display:none; margin-top:10px;" class="kyo-adv-field-group">
                    <label>${this.i18n("duplicateFinderTitle")}</label>
                    <div id="kyo-duplicate-list" style="max-height:80px; overflow-y:auto; font-size:11px; background:rgba(0,0,0,0.2); padding:6px; border-radius:4px; border:1px solid rgba(255,255,255,0.05); margin-bottom:6px;">Hiç kopya bulunamadı.</div>
                    <button type="button" class="kyo-button-secondary kyo-feedback-btn" id="kyo-delete-duplicates-btn" style="padding:6px 10px !important;">${this.i18n("deleteDuplicatesBtn")}</button>
                </div>

                <!-- Live Monitor Console & Debug stats -->
                <div class="kyo-adv-field-group" style="margin-top: 14px;">
                    <label>${this.i18n("liveRequestMonitor")}</label>
                    <canvas id="kyo-latency-sparkline" width="350" height="40" style="width: 100%; height: 40px; background: rgba(0, 0, 0, 0.3); border-radius: 4px; margin-bottom: 6px; border: 1px solid rgba(255, 255, 255, 0.05); display: block;"></canvas>
                    <div class="kyo-live-console-container" id="kyo-live-api-console">
                        <div style="color:#888;">[OK] Console initialized. Awaiting API activity...</div>
                    </div>
                    <div class="kyo-debug-panel" id="kyo-debug-stats">
                        <div style="display:flex; justify-content:space-between;"><span>Queue: <strong id="debug-queue">0</strong></span> <span>Threads: <strong id="debug-threads">1</strong></span></div>
                        <div style="display:flex; justify-content:space-between;"><span>Latency: <strong id="debug-latency">112 ms</strong></span></div>
                    </div>
                </div>

                <!-- Lifetime Stats -->
                <div class="kyo-lifetime-stats-container">
                    <span>${this.i18n("lifetimeStatsDeleted")}: <strong id="kyo-lifetime-deleted">0</strong></span>
                    <span>${this.i18n("lifetimeStatsCleaned")}: <strong id="kyo-lifetime-mb">0.0 MB</strong></span>
                </div>
                
                <button id="kyo-start" class="kyo-button" style="margin-top: 14px;">${this.i18n("panelStartDeleting")}</button>
                
                <div class="kyo-status kyo-status-info kyo-status-info-static">
                    <div class="kyo-status-icon info">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><g fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-width="1.5" d="M12 17v-6"/><circle cx="1" cy="1" r="1" fill="currentColor" transform="matrix(1 0 0 -1 11 9)"/><path stroke="currentColor" stroke-width="1.5" d="M2 12c0-4.714 0-7.071 1.464-8.536C4.93 2 7.286 2 12 2s7.071 0 8.535 1.464C22 4.93 22 7.286 22 12s0 7.071-1.465 8.535C19.072 22 16.714 22 12 22s-7.071 0-8.536-1.465C2 19.072 2 16.714 2 12Z"/></g></svg>
                    </div>
                    <span class="kyo-status-text">${this.i18n("panelInfo")}</span>
                </div>
            </div>

            <!-- TAB 2: Hidden DMs Manager -->
            <div id="kyo-tab-hidden-content" class="kyo-tab-content" style="padding: 16px; display: none; overflow-y: auto; max-height: calc(85vh - 150px);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <span style="font-weight:700; font-size:12px; color:#fff;">Gizli Konuşmalar</span>
                    <button type="button" class="kyo-resume-btn" id="kyo-hidden-restore-all-btn">Hepsini Aç</button>
                </div>
                <div class="kyo-hidden-dms-list" id="kyo-hidden-dms-list-container"></div>
            </div>

            <!-- TAB 3: Achievements & Analytics Content -->
            <div id="kyo-tab-analytics-content" class="kyo-tab-content" style="padding: 16px; display: none; overflow-y: auto; max-height: calc(85vh - 150px);">
                <!-- Mini Dashboard -->
                <div class="kyo-report-card" style="margin-bottom: 12px; padding: 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                    <div style="flex: 1;">
                        <div style="font-weight: bold; border-bottom: 1px solid #7f00ff; padding-bottom: 4px; margin-bottom: 6px;">KAPTAN DASHBOARD</div>
                        <div style="font-size: 11px; display:grid; grid-template-columns:repeat(2,1fr); gap:6px;">
                            <div>Messages: <strong id="dash-messages">0</strong></div>
                            <div>DMs: <strong id="dash-dms">0</strong></div>
                            <div>Hidden DMs: <strong id="dash-hidden">0</strong></div>
                            <div>Runtime: <strong id="dash-runtime">0 saat</strong></div>
                            <div>Version: <strong>4.0.0</strong></div>
                            <div style="grid-column: span 2; display: flex; align-items: center; gap: 4px; margin-top: 2px;">Sohbet Havası: <span id="dash-sentiment" class="kyo-sentiment-badge serious">Ciddi 📝</span></div>
                        </div>
                    </div>
                    <div style="flex-shrink: 0; width: 70px; height: 70px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.15); border-radius: 50%; padding: 4px;">
                        <canvas id="kyo-circular-progress" width="70" height="70" style="width: 70px; height: 70px;"></canvas>
                    </div>
                </div>

                <!-- Relationship Analyzer Heatmap -->
                <div class="kyo-analytics-chart-container">
                    <div style="font-weight: bold; font-size: 12px; margin-bottom: 8px; color: #fff;">En Çok Konuştuğun Kişiler</div>
                    <div id="kyo-heatmap-list">
                        <div style="font-size:10px; color:#888; text-align:center; padding:10px 0;">Veriler taranıyor...</div>
                    </div>
                </div>

                <!-- Message Timeline Calendar -->
                <div class="kyo-analytics-chart-container" style="margin-top: 10px;">
                    <div style="font-weight: bold; font-size: 12px; margin-bottom: 8px; color: #fff;">Yıllık Mesaj Dağılımı</div>
                    <div id="kyo-timeline-list">
                        <div style="font-size:10px; color:#888; text-align:center; padding:10px 0;">Veriler taranıyor...</div>
                    </div>
                </div>

                <!-- Active Hours distribution -->
                <div class="kyo-analytics-chart-container" style="margin-top: 10px;">
                    <div style="font-weight: bold; font-size: 12px; margin-bottom: 8px; color: #fff;">Saatlik Aktiflik Dağılımı</div>
                    <div id="kyo-hours-chart" class="kyo-hour-chart-container">
                        <div style="font-size:10px; color:#888; text-align:center; width:100%; padding:10px 0;">Veriler taranıyor...</div>
                    </div>
                </div>

                <!-- Message Density Heatmap (Canvas) -->
                <div class="kyo-analytics-chart-container" style="margin-top: 10px;">
                    <div style="font-weight: bold; font-size: 12px; margin-bottom: 8px; color: #fff;">📊 Mesaj Yoğunluk Haritası (Saat × Gün)</div>
                    <canvas id="kyo-density-heatmap" style="width:100%; height:100px; border-radius:6px; display:block;"></canvas>
                    <div style="display:flex; justify-content:space-between; font-size:8px; color:#666; margin-top:4px;">
                        <span>Pzt</span><span>Sal</span><span>Çar</span><span>Per</span><span>Cum</span><span>Cmt</span><span>Paz</span>
                    </div>
                </div>

                <!-- Word Cloud list -->
                <div class="kyo-analytics-chart-container" style="margin-top: 10px;">
                    <div style="font-weight: bold; font-size: 12px; margin-bottom: 8px; color: #fff;">En Çok Kullandığın Kelimeler</div>
                    <div id="kyo-words-list" style="display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px;">
                        <div style="font-size:10px; color:#888; text-align:center; width:100%; padding:10px 0;">Veriler taranıyor...</div>
                    </div>
                </div>

                <!-- Achievements Grid -->
                <div style="font-weight: bold; font-size: 12px; margin-top: 14px; margin-bottom: 6px; color: #fff;">Başarımlar</div>
                <div class="kyo-achievements-grid">
                    <div class="kyo-achievement-card" id="ach-first-cleanup">
                        <div class="kyo-achievement-icon">🏅</div>
                        <div class="kyo-achievement-name">${this.i18n("achievementFirstCleanup")}</div>
                        <div class="kyo-achievement-desc">İlk mesaj silindi.</div>
                    </div>
                    <div class="kyo-achievement-card" id="ach-mass-cleaner">
                        <div class="kyo-achievement-icon">⚡</div>
                        <div class="kyo-achievement-name">${this.i18n("achievementMassCleaner")}</div>
                        <div class="kyo-achievement-desc">1,000+ mesaj silindi.</div>
                    </div>
                    <div class="kyo-achievement-card" id="ach-digital-ghost">
                        <div class="kyo-achievement-icon">👻</div>
                        <div class="kyo-achievement-name">${this.i18n("achievementDigitalGhost")}</div>
                        <div class="kyo-achievement-desc">10,000+ mesaj silindi.</div>
                    </div>
                    <div class="kyo-achievement-card" id="ach-investigator">
                        <div class="kyo-achievement-icon">🔍</div>
                        <div class="kyo-achievement-name">${this.i18n("achievementInvestigator")}</div>
                        <div class="kyo-achievement-desc">Gizli DM açıldı.</div>
                    </div>
                    <div class="kyo-achievement-card kyo-ach-hidden" id="ach-night-owl">
                        <div class="kyo-achievement-icon">🦉</div>
                        <div class="kyo-achievement-name">${this.i18n("achievementNightOwl")}</div>
                        <div class="kyo-achievement-desc">Gece 00:00-05:00 arası temizlik.</div>
                    </div>
                    <div class="kyo-achievement-card kyo-ach-hidden" id="ach-speed-demon">
                        <div class="kyo-achievement-icon">💀</div>
                        <div class="kyo-achievement-name">${this.i18n("achievementSpeedDemon")}</div>
                        <div class="kyo-achievement-desc">Gecikme 500ms'e ayarlandı.</div>
                    </div>
                    <div class="kyo-achievement-card kyo-ach-hidden" id="ach-backup-master">
                        <div class="kyo-achievement-icon">💾</div>
                        <div class="kyo-achievement-name">${this.i18n("achievementBackupMaster")}</div>
                        <div class="kyo-achievement-desc">İlk yedekleme alındı.</div>
                    </div>
                    <div class="kyo-achievement-card kyo-ach-hidden" id="ach-multi-sweep">
                        <div class="kyo-achievement-icon">🌊</div>
                        <div class="kyo-achievement-name">${this.i18n("achievementMultiSweep")}</div>
                        <div class="kyo-achievement-desc">5+ DM tek seferde temizlendi.</div>
                    </div>
                    <div class="kyo-achievement-card kyo-ach-hidden" id="ach-ghost-protocol">
                        <div class="kyo-achievement-icon">🥷</div>
                        <div class="kyo-achievement-name">${this.i18n("achievementGhostProtocol")}</div>
                        <div class="kyo-achievement-desc">Ghost Mode ile 500+ mesaj silindi.</div>
                    </div>
                    <div class="kyo-achievement-card kyo-ach-hidden" id="ach-filter-master">
                        <div class="kyo-achievement-icon">🎯</div>
                        <div class="kyo-achievement-name">${this.i18n("achievementFilterMaster")}</div>
                        <div class="kyo-achievement-desc">Query Builder filtresiyle silme yapıldı.</div>
                    </div>
                    <div class="kyo-achievement-card kyo-ach-hidden" id="ach-panic-button">
                        <div class="kyo-achievement-icon">🚨</div>
                        <div class="kyo-achievement-name">${this.i18n("achievementPanicButton")}</div>
                        <div class="kyo-achievement-desc">Panic Mode (Ctrl+Shift+X) kullanıldı.</div>
                    </div>
                    <div class="kyo-achievement-card" id="ach-dev-friend">
                        <div class="kyo-achievement-icon">💬</div>
                        <div class="kyo-achievement-name">${this.i18n("achievementDevFriend")}</div>
                        <div class="kyo-achievement-desc">İlk geri bildirimi gönderdin.</div>
                    </div>
                    <div class="kyo-achievement-card" id="ach-archivist">
                        <div class="kyo-achievement-icon">📚</div>
                        <div class="kyo-achievement-name">${this.i18n("achievementArchivist")}</div>
                        <div class="kyo-achievement-desc">HTML ve TXT yedeklemeyi aktif ettin.</div>
                    </div>
                    <div class="kyo-achievement-card kyo-ach-hidden secret-ach" id="ach-neo">
                        <div class="kyo-achievement-icon">🕶️</div>
                        <div class="kyo-achievement-name">${this.i18n("achievementNeo")}</div>
                        <div class="kyo-achievement-desc">Sistem simülasyonunu kırdın (Konami).</div>
                    </div>
                    <div class="kyo-achievement-card kyo-ach-hidden secret-ach" id="ach-shop-supporter">
                        <div class="kyo-achievement-icon">🛍️</div>
                        <div class="kyo-achievement-name">${this.i18n("achievementShopSupporter")}</div>
                        <div class="kyo-achievement-desc">İtemSatış mağaza rozetine tıkladın.</div>
                    </div>
                    <div class="kyo-achievement-card kyo-ach-hidden secret-ach" id="ach-speedrunner">
                        <div class="kyo-achievement-icon">🦔</div>
                        <div class="kyo-achievement-name">${this.i18n("achievementSpeedrunner")}</div>
                        <div class="kyo-achievement-desc">Gecikme süresi 500ms iken 100+ silme.</div>
                    </div>
                    <div class="kyo-achievement-card kyo-ach-hidden secret-ach" id="ach-perfect-voyage">
                        <div class="kyo-achievement-icon">🛡️</div>
                        <div class="kyo-achievement-name">${this.i18n("achievementPerfectVoyage")}</div>
                        <div class="kyo-achievement-desc">Tek seferde 500+ mesajı hatasız sildin.</div>
                    </div>
                    <div class="kyo-achievement-card kyo-ach-hidden" id="ach-completionist">
                        <div class="kyo-achievement-icon">👑</div>
                        <div class="kyo-achievement-name">${this.i18n("achievementCompletionist")}</div>
                        <div class="kyo-achievement-desc">Tüm başarımlar açıldı.</div>
                    </div>
                </div>

                <!-- Discord Activity Report Export -->
                <button id="kyo-export-activity-report" class="kyo-button" style="margin-top: 16px; background: linear-gradient(135deg, #00f0ff, #7f00ff) !important; box-shadow: 0 4px 15px rgba(0, 240, 255, 0.35);">${this.i18n("activityReportTitle")}</button>
            </div>

            <div id="kyo-delete-panel-footer">
                <div style="font-size: 9px; color: #555555; margin-bottom: 8px; line-height: 1.2; text-align: center;">
                    ${this.i18n("panelLegalDisclaimer")}
                </div>
                <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; width: 100%;">
                    <div style="display: flex; gap: 8px; justify-content: center; align-items: center; width: 100%; flex-wrap: wrap;">
                        <a href="https://www.itemsatis.com/p/Kaptanbey0" target="_blank" class="kyo-promo-badge">${this.i18n("promoBadgeText")}</a>
                    </div>
                </div>
                <span class="kyo-version" style="margin-top: 6px;">${this.i18n("panelCopyright")}</span>
            </div>
        `;
        return panelEl;
    }

    attachEventListeners() {
        if (!this.panel) return;

        // Request notifications permission proactively
        if (typeof Notification !== "undefined" && Notification.permission === "default") {
            Notification.requestPermission().catch(() => {});
        }

        // AI Suggestion Tags
        const aiInput = this.panel.querySelector("#kyo-ai-input");
        this.panel.querySelectorAll(".kyo-ai-tag").forEach(tag => {
            tag.addEventListener("click", () => {
                this.sound.play("click");
                if (aiInput) {
                    aiInput.value = tag.getAttribute("data-prompt");
                }
            });
        });

        // Dragging
        const header = this.panel.querySelector("#kyo-delete-panel-header");
        header.addEventListener("mousedown", this.onDragStart.bind(this));
        document.addEventListener("mousemove", this.onDragMove.bind(this));
        document.addEventListener("mouseup", this.onDragEnd.bind(this));

        // Close and Start Buttons
        const closeBtn = this.panel.querySelector("#kyo-delete-panel-close");
        const startBtn = this.panel.querySelector("#kyo-start");
        const stealthToggleBtn = this.panel.querySelector("#kyo-stealth-toggle");
        
        closeBtn?.addEventListener("click", () => {
            this.sound.play("click");
            this.close();
        });
        startBtn?.addEventListener("click", () => {
            this.sound.play("start");
            this.startDeleting();
        });
        stealthToggleBtn?.addEventListener("click", () => {
            this.sound.play("stealth");
            const isStealth = this.panel.classList.toggle("kyo-stealth-active");
            Storage.setRaw("stealth_mode", isStealth ? "true" : "false");
            if (isStealth) {
                this.showStealthAnchor();
            } else {
                this.hideStealthAnchor();
            }
        });

        // Advanced Settings Accordion Toggle
        const accordion = this.panel.querySelector("#kyo-adv-accordion");
        const accordionHeader = this.panel.querySelector("#kyo-adv-accordion-header");
        accordionHeader?.addEventListener("click", () => {
            this.sound.play("tab");
            accordion?.classList.toggle("active");
        });

        // Selectors Event Listeners (Theme, BG, Sound)
        const themeSelect = this.panel.querySelector("#kyo-theme-select");
        const bgEffectSelect = this.panel.querySelector("#kyo-bg-effect-select");
        const soundPackSelect = this.panel.querySelector("#kyo-sound-pack-select");
        const volumeSlider = this.panel.querySelector("#kyo-sound-volume-slider");
        const delaySlider = this.panel.querySelector("#kyo-delay-slider");
        const delayValText = this.panel.querySelector("#kyo-delay-val");

        const fontSelect = this.panel.querySelector("#kyo-font-select");

        // Sync initial values
        if (themeSelect) themeSelect.value = Storage.getRaw("theme") || "cyberpunk";
        if (bgEffectSelect) bgEffectSelect.value = Storage.getRaw("bg_effect") || "particles";
        if (soundPackSelect) soundPackSelect.value = this.sound.soundPack;
        if (volumeSlider) volumeSlider.value = this.sound.volume;
        if (delaySlider) {
            const savedDelay = Storage.getRaw("speed_delay") || "1200";
            delaySlider.value = savedDelay;
            if (delayValText) delayValText.textContent = savedDelay;
        }
        if (fontSelect) {
            fontSelect.value = Storage.getRaw("font") || "outfit";
            this.applyFont(fontSelect.value);
        }

        themeSelect?.addEventListener("change", (e) => {
            this.sound.play("click");
            this.changeTheme(e.target.value);
            if (soundPackSelect) soundPackSelect.value = this.sound.soundPack;
        });
        bgEffectSelect?.addEventListener("change", (e) => {
            this.sound.play("click");
            this.changeBackgroundEffect(e.target.value);
        });
        soundPackSelect?.addEventListener("change", (e) => {
            this.sound.soundPack = e.target.value;
            Storage.setRaw("sound_pack", e.target.value);
            // Live preview: play success melody so user hears the pack's tone
            setTimeout(() => this.sound.play("success"), 100);
        });
        volumeSlider?.addEventListener("input", (e) => {
            const vol = parseFloat(e.target.value);
            this.sound.volume = vol;
            Storage.setRaw("sound_volume", vol.toString());
        });
        volumeSlider?.addEventListener("change", () => {
            this.sound.play("click");
        });
        delaySlider?.addEventListener("input", (e) => {
            const val = e.target.value;
            if (delayValText) delayValText.textContent = val;
            Storage.setRaw("speed_delay", val);
        });
        delaySlider?.addEventListener("change", () => {
            this.sound.play("click");
        });

        // Font Selector Event Handler
        fontSelect?.addEventListener("change", (e) => {
            this.sound.play("click");
            this.applyFont(e.target.value);
            Storage.setRaw("font", e.target.value);
        });

        // Sparkle Particle Effect on Start Button hover

        if (startBtn) {
            startBtn.addEventListener("mouseenter", () => this.startSparkles(startBtn));
            startBtn.addEventListener("mouseleave", () => this.stopSparkles(startBtn));
        }

        const schedulerDelaySelect = this.panel.querySelector("#kyo-scheduler-delay");
        const schedulerAgeSelect = this.panel.querySelector("#kyo-scheduler-age-filter");

        if (schedulerDelaySelect) schedulerDelaySelect.value = Storage.getRaw("sched_delay") || "0";
        if (schedulerAgeSelect) schedulerAgeSelect.value = Storage.getRaw("sched_age") || "0";

        schedulerDelaySelect?.addEventListener("change", (e) => {
            this.sound.play("click");
            Storage.setRaw("sched_delay", e.target.value);
        });
        schedulerAgeSelect?.addEventListener("change", (e) => {
            this.sound.play("click");
            Storage.setRaw("sched_age", e.target.value);
        });

        // Presets Buttons Event Handler
        this.panel.querySelectorAll(".preset-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                this.sound.play("click");
                const preset = btn.getAttribute("data-preset");
                this.applyPreset(preset);
            });
        });
 
        // Query builder checkboxes event listeners
        this.panel.querySelectorAll("[id^='q-filter-']").forEach(cb => {
            cb.addEventListener("change", () => {
                this.sound.play("click");
                this.updateRegexPreview();
            });
        });

        // Checkbox interaction
        const deleteAllCb = this.panel.querySelector("#kyo-delete-all");
        const limitGroup = this.panel.querySelector("#kyo-limit-group");
        const limitInput = this.panel.querySelector("#kyo-limit");
        const dmSelectorContainer = this.panel.querySelector("#kyo-dm-selector-container");

        const updateLimitState = () => {
            this.sound.play("click");
            const isUnlimited = deleteAllCb.checked || this.selectedDeleteMode !== "single";
            if (limitGroup && limitInput) {
                if (isUnlimited) {
                    limitGroup.classList.add("disabled");
                    limitInput.disabled = true;
                } else {
                    limitGroup.classList.remove("disabled");
                    limitInput.disabled = false;
                }
            }
        };

        deleteAllCb?.addEventListener("change", updateLimitState);

        const backupCb = this.panel.querySelector("#kyo-backup-before");
        const backupHtmlRow = this.panel.querySelector("#kyo-backup-html-row");
        backupCb?.addEventListener("change", () => {
            this.sound.play("click");
            if (backupHtmlRow) {
                backupHtmlRow.style.display = backupCb.checked ? "flex" : "none";
            }
        });
        const backupHtmlCb = this.panel.querySelector("#kyo-backup-html");
        backupHtmlCb?.addEventListener("change", () => {
            this.sound.play("click");
        });

        // Tabs Events
        const cleanerTabBtn = this.panel.querySelector("#kyo-tab-cleaner-btn");
        const hiddenTabBtn = this.panel.querySelector("#kyo-tab-hidden-btn");
        const analyticsTabBtn = this.panel.querySelector("#kyo-tab-analytics-btn");
        const cleanerContent = this.panel.querySelector("#kyo-tab-cleaner-content");
        const hiddenContent = this.panel.querySelector("#kyo-tab-hidden-content");
        const analyticsContent = this.panel.querySelector("#kyo-tab-analytics-content");

        cleanerTabBtn?.addEventListener("click", () => {
            this.sound.play("tab");
            cleanerTabBtn.classList.add("active");
            hiddenTabBtn?.classList.remove("active");
            analyticsTabBtn?.classList.remove("active");
            if (cleanerContent) cleanerContent.style.display = "block";
            if (hiddenContent) hiddenContent.style.display = "none";
            if (analyticsContent) analyticsContent.style.display = "none";
        });

        hiddenTabBtn?.addEventListener("click", () => {
            this.sound.play("tab");
            hiddenTabBtn.classList.add("active");
            cleanerTabBtn?.classList.remove("active");
            analyticsTabBtn?.classList.remove("active");
            if (hiddenContent) hiddenContent.style.display = "block";
            if (cleanerContent) cleanerContent.style.display = "none";
            if (analyticsContent) analyticsContent.style.display = "none";
            this.renderHiddenDMsList();
        });

        analyticsTabBtn?.addEventListener("click", () => {
            this.sound.play("tab");
            analyticsTabBtn.classList.add("active");
            cleanerTabBtn?.classList.remove("active");
            hiddenTabBtn?.classList.remove("active");
            if (analyticsContent) analyticsContent.style.display = "block";
            if (cleanerContent) cleanerContent.style.display = "none";
            if (hiddenContent) hiddenContent.style.display = "none";
            this.loadAnalyticsDashboard();
        });

        // DM Search Filter (with Turkish + Unicode normalization)
        const dmSearchInput = this.panel.querySelector("#kyo-dm-search");
        dmSearchInput?.addEventListener("input", (e) => {
            const query = normalizeSearch(e.target.value.trim());
            const rows = this.panel.querySelectorAll(".kyo-dm-item-row");
            rows.forEach(row => {
                const name = normalizeSearch(row.querySelector(".kyo-dm-item-name")?.textContent || "");
                if (name.includes(query)) {
                    row.style.display = "flex";
                } else {
                    row.style.display = "none";
                }
            });
            // Update section headers visibility based on visible rows
            this.panel.querySelectorAll(".kyo-dm-category-header").forEach(header => {
                let nextEl = header.nextElementSibling;
                let hasVisibleRow = false;
                while (nextEl && !nextEl.classList.contains("kyo-dm-category-header")) {
                    if (nextEl.classList.contains("kyo-dm-item-row") && nextEl.style.display !== "none") {
                        hasVisibleRow = true;
                    }
                    nextEl = nextEl.nextElementSibling;
                }
                header.style.display = hasVisibleRow ? "flex" : "none";
            });
        });

        // Feedback Submission
        const feedbackSubmitBtn = this.panel.querySelector("#kyo-feedback-submit");
        const feedbackText = this.panel.querySelector("#kyo-feedback-text");
        feedbackSubmitBtn?.addEventListener("click", () => {
            this.sound.play("click");
            if (feedbackText) {
                this.sendFeedbackWebhook(feedbackText.value);
            }
        });

        // Quick Selection Buttons Handlers
        const qSelectAll = this.panel.querySelector("#kyo-dm-select-all");
        const qDeselectAll = this.panel.querySelector("#kyo-dm-deselect-all");
        const qSelectGroups = this.panel.querySelector("#kyo-dm-select-groups");
        const qSelectFavs = this.panel.querySelector("#kyo-dm-select-favs");

        qSelectAll?.addEventListener("click", () => {
            this.sound.play("click");
            const cbs = this.panel.querySelectorAll(".kyo-dm-item-checkbox");
            cbs.forEach(cb => cb.checked = true);
        });

        qDeselectAll?.addEventListener("click", () => {
            this.sound.play("click");
            const cbs = this.panel.querySelectorAll(".kyo-dm-item-checkbox");
            cbs.forEach(cb => cb.checked = false);
        });

        qSelectGroups?.addEventListener("click", () => {
            this.sound.play("click");
            const cbs = this.panel.querySelectorAll(".kyo-dm-item-checkbox");
            cbs.forEach(cb => {
                const isGroup = cb.getAttribute("data-channel-type") === "3";
                cb.checked = isGroup;
            });
        });

        qSelectFavs?.addEventListener("click", () => {
            this.sound.play("click");
            const cbs = this.panel.querySelectorAll(".kyo-dm-item-checkbox");
            cbs.forEach(cb => {
                const isFav = cb.getAttribute("data-is-fav") === "true";
                cb.checked = isFav;
            });
        });

        // Activity Report button handler
        const exportReportBtn = this.panel.querySelector("#kyo-export-activity-report");
        exportReportBtn?.addEventListener("click", () => {
            this.sound.play("success");
            this.exportActivityReport();
        });

        // Promo Badge click achievement
        const promoBadge = this.panel.querySelector(".kyo-promo-badge");
        promoBadge?.addEventListener("click", () => {
            this.unlockAchievement("ach-shop-supporter");
        });

        // Hidden restore all handler
        const restoreAllBtn = this.panel.querySelector("#kyo-hidden-restore-all-btn");
        restoreAllBtn?.addEventListener("click", () => {
            this.sound.play("click");
            this.restoreAllHiddenDMs();
        });

        // Delete duplicates handler
        const deleteDupBtn = this.panel.querySelector("#kyo-delete-duplicates-btn");
        deleteDupBtn?.addEventListener("click", () => {
            this.sound.play("start");
            this.deleteDuplicateAttachments();
        });

        // Keyboard Shortcuts (Space for Pause, Esc for Stop/Close)
        this.globalKeydownHandler = (e) => {
            const activeTag = document.activeElement?.tagName;
            if (activeTag === "INPUT" || activeTag === "TEXTAREA" || document.activeElement?.isContentEditable) {
                return;
            }

            if (this.progressBar && this.progressBar.style.display !== "none") {
                if (e.code === "Space") {
                    e.preventDefault();
                    const pauseBtn = this.progressBar.querySelector("#kyo-progress-pause-btn");
                    if (pauseBtn) {
                        this.sound.play("click");
                        pauseBtn.click();
                    }
                } else if (e.code === "Escape") {
                    e.preventDefault();
                    const stopBtn = this.progressBar.querySelector("#kyo-progress-stop-btn");
                    if (stopBtn) {
                        this.sound.play("click");
                        stopBtn.click();
                    }
                }
            } else if (this.panel && this.panel.style.display !== "none") {
                if (e.code === "Escape") {
                    e.preventDefault();
                    this.sound.play("click");
                    this.close();
                }
            }
        };
        window.addEventListener("keydown", this.globalKeydownHandler);

        // Konami Easter egg tracker
        let konamiCode = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "KeyB", "KeyA"];
        let konamiIndex = 0;
        this.konamiHandler = (e) => {
            if (e.code === konamiCode[konamiIndex]) {
                konamiIndex++;
                if (konamiIndex === konamiCode.length) {
                    konamiIndex = 0;
                    this.matrixEasterEgg();
                }
            } else {
                konamiIndex = 0;
            }
        };
        window.addEventListener("keydown", this.konamiHandler);

        // Panic Stop shortcut: CTRL + SHIFT + X
        this.panicHandler = (e) => {
            if (e.ctrlKey && e.shiftKey && e.code === "KeyX") {
                e.preventDefault();
                this.triggerPanicStop();
            }
        };
        window.addEventListener("keydown", this.panicHandler);
    }

    async sendFeedbackWebhook(text) {
        if (!text || !text.trim()) {
            await this.modal.alert(this.i18n("modalError"), this.i18n("feedbackEmptyErr"), { icon: "warning" });
            return;
        }

        const submitBtn = this.panel?.querySelector("#kyo-feedback-submit");
        const textArea = this.panel?.querySelector("#kyo-feedback-text");
        if (submitBtn) submitBtn.disabled = true;

        try {
            if (FEEDBACK_WEBHOOK_URL) {
                const payload = {
                    embeds: [{
                        title: "📩 Kaptan DM Cleaner - Yeni Geri Bildirim",
                        color: 8323327, // #7f00ff
                        description: text,
                        fields: [
                            { name: "Sürüm", value: "4.0.0", inline: true },
                            { name: "Kanal Tipi", value: this.api.isGuildChannel() ? "Sunucu Kanalı" : "DM Sohbeti", inline: true },
                            { name: "Kanal ID", value: this.api.channelId || "Bilinmiyor", inline: true }
                        ],
                        timestamp: new Date().toISOString()
                    }]
                };
                const res = await fetch(FEEDBACK_WEBHOOK_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    throw new Error("HTTP " + res.status);
                }
            } else {
                const githubUrl = `https://github.com/Kaptanbey0/kaptandmcleaner/issues/new?title=${encodeURIComponent("Kaptan DM Cleaner - Geri Bildirim")}&body=${encodeURIComponent(text)}`;
                window.open(githubUrl, "_blank");
            }

            this.sound.play("success");
            if (textArea) textArea.value = "";
            this.unlockAchievement("ach-dev-friend");
            await this.modal.alert(this.i18n("modalConfirm"), this.i18n("feedbackSuccess"), { icon: "success" });
        } catch (e) {
            console.error("Feedback error:", e);
            this.sound.play("error");
            await this.modal.alert(this.i18n("modalError"), "Geri bildirim gönderilirken bir hata oluştu. Lütfen tekrar deneyin.", { icon: "error" });
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    async collectAllDMs(forceRefresh = false) {
        if (this.dmCache && this.dmCache.size > 0 && !forceRefresh) {
            return this.dmCache;
        }

        if (!this.dmCache) {
            this.dmCache = new Map();
        } else {
            this.dmCache.clear();
        }

        const channels = await this.api.getDMChannels();
        let dmChannels = channels.filter(ch => ch.type === 1 || ch.type === 3);

        try {
            const relationships = await this.api.getRelationshipDMChannels();
            relationships.forEach(rel => {
                const hasChannel = dmChannels.some(ch => ch.type === 1 && ch.recipients?.some(r => r.id === rel.id));
                if (!hasChannel && rel.user) {
                    dmChannels.push({
                        id: `rel_${rel.id}`,
                        type: 1,
                        recipients: [rel.user],
                        isRelationshipPlaceholder: true,
                        last_message_id: "0"
                    });
                }
            });
        } catch (err) {}

        // Get favorites (rich object format via Storage wrapper)
        let favoritesObj = Storage.get("favorite_channels") || {};
        if (Array.isArray(favoritesObj)) {
            const migrated = {};
            favoritesObj.forEach(id => {
                migrated[id] = { type: "dm", favorite: true, pinned: false, starredAt: Date.now() };
            });
            favoritesObj = migrated;
            Storage.set("favorite_channels", favoritesObj);
        }

        // Sort by last_message_id descending
        dmChannels.sort((a, b) => {
            const idA = BigInt(a.last_message_id || "0");
            const idB = BigInt(b.last_message_id || "0");
            if (idB > idA) return 1;
            if (idB < idA) return -1;
            return 0;
        });

        this._dmChannelsRaw = dmChannels; // Keep raw for rendering
        dmChannels.forEach(ch => {
            const name = ch.name || ch.recipients?.map(r => r.username).join(", ") || (ch.type === 3 ? "Grup DM" : "Bilinmeyen Kullanıcı");
            const meta = {
                id: ch.id,
                type: ch.type === 3 ? "group" : "dm",
                name: name,
                avatar: ch.recipients?.[0]?.avatar || null,
                favorite: !!favoritesObj[ch.id],
                pinned: favoritesObj[ch.id]?.pinned || false,
                unread: false,
                lastActivity: ch.last_message_id || "0",
                messageCount: 0,
                selected: true,
                isRelationshipPlaceholder: !!ch.isRelationshipPlaceholder,
                _raw: ch
            };
            this.dmCache.set(ch.id, Object.seal(meta));
        });

        return this.dmCache;
    }

    getDMById(id) {
        return this.dmCache?.get(id) || null;
    }

    getDeleteModes() {
        return [
            {
                id: "single",
                icon: "🎯",
                title: this.i18n("modeSingleTitle") || "Single DM",
                description: this.i18n("modeSingleDesc") || "Current conversation only",
                requiresPicker: false
            },
            {
                id: "selected",
                icon: "📋",
                title: this.i18n("modeSelectedTitle") || "Selected DMs",
                description: this.i18n("modeSelectedDesc") || "Choose conversations",
                requiresPicker: true
            },
            {
                id: "full",
                icon: "💀",
                title: this.i18n("modeFullTitle") || "Full Wipe",
                description: this.i18n("modeFullDesc") || "Delete everything",
                requiresPicker: false
            }
        ];
    }

    getDeleteModeConfig(modeId) {
        return this.getDeleteModes().find(m => m.id === modeId) || this.getDeleteModes()[0];
    }

    renderDeleteModeCards() {
        const container = this.panel?.querySelector(".kyo-mode-cards");
        if (!container) return;

        const currentMode = this.selectedDeleteMode || "single";
        const modes = this.getDeleteModes();

        container.innerHTML = modes.map(m => `
            <div class="kyo-mode-card ${m.id === currentMode ? 'active' : ''}" data-mode="${m.id}">
                <div class="kyo-mode-card-icon">${m.icon}</div>
                <div class="kyo-mode-card-title">${m.title}</div>
                <div class="kyo-mode-card-desc">${m.description}</div>
            </div>
        `).join("");

        container.querySelectorAll(".kyo-mode-card").forEach(card => {
            card.addEventListener("click", () => {
                this.sound.play("click");
                const modeId = card.getAttribute("data-mode");
                this.setDeleteMode(modeId);
            });
        });
    }

    setDeleteMode(modeId) {
        this.selectedDeleteMode = modeId;
        this.renderDeleteModeCards();

        const limitGroup = this.panel?.querySelector("#kyo-limit-group");
        const limitInput = this.panel?.querySelector("#kyo-limit");
        const dmSelectorContainer = this.panel?.querySelector("#kyo-dm-selector-container");
        const deleteAllCb = this.panel?.querySelector("#kyo-delete-all");

        const modeConfig = this.getDeleteModeConfig(modeId);
        if (dmSelectorContainer) {
            dmSelectorContainer.style.display = modeConfig.requiresPicker ? "block" : "none";
            if (modeConfig.requiresPicker) {
                this.renderDmPickerList();
            }
        }

        if (limitGroup && limitInput) {
            const isUnlimited = modeId !== "single" || (deleteAllCb && deleteAllCb.checked);
            limitGroup.classList.toggle("disabled", isUnlimited);
            limitInput.disabled = isUnlimited;
        }
    }

    async renderDmPickerList() {
        const pickerListContainer = this.panel?.querySelector("#kyo-dm-picker-list");
        if (!pickerListContainer) return;
        
        pickerListContainer.innerHTML = `<div class="kyo-spinner" style="width: 20px; height: 20px; margin: 10px auto;"></div>`;
        
        // ── Fetch DM channels (uses cache if available) ──
        await this.collectAllDMs();

        const dmChannels = this._dmChannelsRaw || [];
        let favoritesObj = Storage.get("favorite_channels") || {};
        if (Array.isArray(favoritesObj)) favoritesObj = {};

        if (dmChannels.length === 0) {
            pickerListContainer.innerHTML = this.renderEmptyState("◈", "SYSTEM STATUS: CLEAR", this.i18n("modalNoMessagesFound"));
            return;
        }

        // ── Preserve check states ──
        const uncheckedIds = new Set();
        pickerListContainer.querySelectorAll(".kyo-dm-item-checkbox").forEach(cb => {
            if (!cb.checked) uncheckedIds.add(cb.value);
        });

        pickerListContainer.innerHTML = "";

        // ── Separate into categories ──
        const favsGroup = [];
        const individualGroup = [];
        const groupsGroup = [];

        dmChannels.forEach(ch => {
            if (favoritesObj[ch.id]) {
                favsGroup.push(ch);
            } else if (ch.type === 3) {
                groupsGroup.push(ch);
            } else {
                individualGroup.push(ch);
            }
        });

        // ── Load persisted section collapse state ──
        const sectionState = Storage.get("dm_section_state") || { favorites: true, individuals: true, groups: true };

        // ── appendCategory: collapsible headers + counters + empty states ──
        const appendCategory = (sectionKey, title, channelsList, icon, emptyIcon, emptyTitle, emptyDesc) => {
            const isOpen = sectionState[sectionKey] !== false;
            
            const header = document.createElement("div");
            header.className = `kyo-dm-category-header ${isOpen ? "open" : "collapsed"}`;
            header.setAttribute("data-section", sectionKey);
            header.innerHTML = `
                <span class="kyo-dm-cat-arrow">${isOpen ? "▼" : "▶"}</span>
                ${icon} ${title} <span class="kyo-dm-cat-count">(${channelsList.length})</span>
            `;
            header.style.cursor = "pointer";
            header.addEventListener("click", () => {
                this.sound.play("click");
                const isNowOpen = header.classList.toggle("open");
                header.classList.toggle("collapsed", !isNowOpen);
                header.querySelector(".kyo-dm-cat-arrow").textContent = isNowOpen ? "▼" : "▶";

                // Toggle visibility of rows in this section
                let next = header.nextElementSibling;
                while (next && !next.classList.contains("kyo-dm-category-header")) {
                    next.style.display = isNowOpen ? "flex" : "none";
                    next = next.nextElementSibling;
                }

                // Persist collapse state
                const state = Storage.get("dm_section_state") || {};
                state[sectionKey] = isNowOpen;
                Storage.set("dm_section_state", state);
            });
            pickerListContainer.appendChild(header);

            if (channelsList.length === 0) {
                const emptyEl = document.createElement("div");
                emptyEl.className = "kyo-dm-empty-state";
                emptyEl.style.display = isOpen ? "flex" : "none";
                emptyEl.innerHTML = this.renderEmptyState(emptyIcon, emptyTitle, emptyDesc);
                pickerListContainer.appendChild(emptyEl);
                return;
            }

            channelsList.forEach(ch => {
                const name = ch.name || ch.recipients?.map(r => r.username).join(", ") || (ch.type === 3 ? "Grup DM" : "Bilinmeyen Kullanıcı");
                const row = document.createElement("div");
                row.className = "kyo-dm-item-row";
                row.setAttribute("data-channel-id", ch.id);
                row.style.display = isOpen ? "flex" : "none";

                const isFav = !!favoritesObj[ch.id];
                const badge = ch.isRelationshipPlaceholder ? ` <span style="font-size: 8px; opacity: 0.5; background: rgba(255,255,255,0.08); padding: 1px 4px; border-radius: 4px; margin-left: 6px;">Gizli</span>` : "";
                const isChecked = !uncheckedIds.has(ch.id);

                row.innerHTML = `
                    <input type="checkbox" class="kyo-dm-item-checkbox" value="${ch.id}" data-channel-type="${ch.type}" data-is-fav="${isFav ? 'true' : 'false'}" data-rel-id="${ch.isRelationshipPlaceholder ? ch.recipients[0].id : ''}" ${isChecked ? 'checked' : ''}>
                    <span class="kyo-dm-item-name">${this.escapeHtml(name)}${badge}</span>
                    <button class="kyo-dm-fav-btn ${isFav ? 'active' : ''}" title="${isFav ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}">${isFav ? '★' : '☆'}</button>
                `;

                // Favorite toggle with rich object
                const favBtn = row.querySelector(".kyo-dm-fav-btn");
                favBtn.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    this.sound.play("click");
                    favBtn.classList.add("kyo-star-pop");
                    let currentFavs = Storage.get("favorite_channels") || {};
                    if (Array.isArray(currentFavs)) currentFavs = {};
                    if (currentFavs[ch.id]) {
                        delete currentFavs[ch.id];
                    } else {
                        currentFavs[ch.id] = {
                            type: ch.type === 3 ? "group" : "dm",
                            favorite: true,
                            pinned: false,
                            starredAt: Date.now()
                        };
                    }
                    Storage.set("favorite_channels", currentFavs);
                    await this.collectAllDMs(true);
                    this.favoriteRenderGeneration = (this.favoriteRenderGeneration || 0) + 1;
                    const generation = this.favoriteRenderGeneration;
                    setTimeout(() => {
                        if (generation !== this.favoriteRenderGeneration) return;
                        this.renderDmPickerList();
                    }, 350);
                });

                // Row click toggles checkbox
                row.addEventListener("click", (e) => {
                    if (e.target.tagName !== "INPUT" && e.target.tagName !== "BUTTON") {
                        this.sound.play("click");
                        const cb = row.querySelector("input");
                        cb.checked = !cb.checked;
                        this.updateSelectionSummary();
                    }
                });

                // Checkbox change updates summary
                const cb = row.querySelector("input");
                cb?.addEventListener("change", () => this.updateSelectionSummary());

                pickerListContainer.appendChild(row);
            });
        };

        // Show empty states with premium placeholders
        appendCategory("favorites", "Favoriler", favsGroup, "⭐", "⭐", "FAVORİ LISTESI BOŞ", "Henüz favori DM yok. Yıldız ikonuna tıklayarak ekleyebilirsiniz.");
        appendCategory("individuals", "DM Kutuları", individualGroup, "👤", "👤", "BİREYSEL DM BULUNAMADI", "Silinebilecek bireysel DM kutusu bulunamadı.");
        appendCategory("groups", "Gruplar", groupsGroup, "👥", "👥", "GRUP DM BULUNAMADI", "Herhangi bir grup DM kutusu bulunamadı.");

        // ── Selection Summary Bar ──
        let summaryBar = this.panel.querySelector("#kyo-selection-summary");
        if (!summaryBar) {
            summaryBar = document.createElement("div");
            summaryBar.id = "kyo-selection-summary";
            summaryBar.className = "kyo-selection-summary";
            const dmSelectorContainer = this.panel.querySelector("#kyo-dm-selector-container");
            if (dmSelectorContainer) {
                dmSelectorContainer.appendChild(summaryBar);
            }
        }
        this.updateSelectionSummary();
    }

    calculateSelectionSummary() {
        const allCbs = this.panel?.querySelectorAll(".kyo-dm-item-checkbox") || [];
        let individuals = 0, groups = 0, favorites = 0, total = 0;
        allCbs.forEach(cb => {
            if (cb.checked) {
                total++;
                const isFav = cb.getAttribute("data-is-fav") === "true";
                const isGroup = cb.getAttribute("data-channel-type") === "3";
                if (isFav) {
                    favorites++;
                } else if (isGroup) {
                    groups++;
                } else {
                    individuals++;
                }
            }
        });
        return { favorites, individuals, groups, total };
    }

    updateSelectionSummary() {
        const summaryBar = this.panel?.querySelector("#kyo-selection-summary");
        if (!summaryBar) return;

        const { favorites, individuals, groups, total } = this.calculateSelectionSummary();

        summaryBar.innerHTML = `
            <span>Seçili</span>
            <span class="kyo-summary-item">👤 ${individuals}</span>
            <span class="kyo-summary-item">👥 ${groups}</span>
            <span class="kyo-summary-item">⭐ ${favorites}</span>
            <span class="kyo-summary-sep">|</span>
            <span class="kyo-summary-total">Toplam: ${total}</span>
        `;
    }

    renderEmptyState(icon, title, text) {
        return `
        <div class="kyo-empty-state">
            <div class="kyo-empty-icon">${icon}</div>
            <div class="kyo-empty-title">${title}</div>
            <div class="kyo-empty-text">${text}</div>
        </div>`;
    }

    async renderHiddenDMsList() {
        const listContainer = this.panel.querySelector("#kyo-hidden-dms-list-container");
        if (!listContainer) return;
        
        listContainer.innerHTML = `<div class="kyo-spinner" style="width: 20px; height: 20px; margin: 20px auto;"></div>`;
        
        const channels = await this.api.getDMChannels();
        const activeRecipientIds = new Set();
        const groupRecipients = [];

        channels.forEach(ch => {
            if (ch.type === 1 && ch.recipients) {
                ch.recipients.forEach(r => activeRecipientIds.add(r.id));
            } else if (ch.type === 3 && ch.recipients) {
                ch.recipients.forEach(r => {
                    if (r.id !== this.api.getCurrentUserId()) {
                        groupRecipients.push(r);
                    }
                });
            }
        });

        const hiddenDMsMap = new Map();

        // 1. Add non-friends from group DMs who don't have an active 1-on-1 DM channel
        groupRecipients.forEach(r => {
            if (!activeRecipientIds.has(r.id)) {
                hiddenDMsMap.set(r.id, {
                    recipientId: r.id,
                    username: r.username,
                    globalName: r.global_name || r.username,
                    badge: "Grup"
                });
            }
        });

        // 2. Add users from relationships (friends, blocked, pending) who don't have an active channel
        try {
            const relationships = await this.api.getRelationshipDMChannels();
            relationships.forEach(rel => {
                if (rel.user && !activeRecipientIds.has(rel.id)) {
                    let badge = "Arkadaş";
                    if (rel.type === 2) badge = "Engelli";
                    else if (rel.type === 3) badge = "Gelen İstek";
                    else if (rel.type === 4) badge = "Giden İstek";

                    hiddenDMsMap.set(rel.id, {
                        recipientId: rel.id,
                        username: rel.user.username,
                        globalName: rel.user.global_name || rel.user.username,
                        badge: badge
                    });
                }
            });
        } catch (err) {}
        
        const hiddenDMs = Array.from(hiddenDMsMap.values());
        
        if (hiddenDMs.length === 0) {
            listContainer.innerHTML = this.renderEmptyState("◈", "SYSTEM STATUS: CLEAR", "Kapalı veya gizli bir DM kutusu bulunamadı.");
            return;
        }
        
        listContainer.innerHTML = "";
        hiddenDMs.forEach(dm => {
            const name = dm.globalName || dm.username;
            const badgeHtml = dm.badge ? `<span class="kyo-badge" style="margin-left: 8px; font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(0, 240, 255, 0.15); color: #00f0ff; border: 1px solid rgba(0, 240, 255, 0.3); font-weight: 500; font-family: monospace;">${dm.badge}</span>` : "";
            const row = document.createElement("div");
            row.className = "kyo-hidden-dm-row";
            row.innerHTML = `
                <div class="kyo-hidden-dm-avatar-name" style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                    <span class="kyo-hidden-dm-name">${this.escapeHtml(name)}</span>
                    ${badgeHtml}
                </div>
                <button class="kyo-hidden-dm-open-btn" data-id="${dm.recipientId}">${this.i18n("openDMBtn")}</button>
            `;
            
            row.querySelector(".kyo-hidden-dm-open-btn").addEventListener("click", async (e) => {
                this.sound.play("click");
                const btn = e.target;
                btn.disabled = true;
                btn.textContent = "...";
                
                const resolvedChan = await this.api.createDMChannel(dm.recipientId);
                if (resolvedChan && resolvedChan.id) {
                    window.history.pushState(null, null, "/channels/@me/" + resolvedChan.id);
                    window.dispatchEvent(new PopStateEvent("popstate"));
                    
                    setTimeout(() => this.renderHiddenDMsList(), 1200);
                } else {
                    btn.disabled = false;
                    btn.textContent = this.i18n("openDMBtn");
                }
            });
            
            listContainer.appendChild(row);
        });
    }

    onDragStart(e) {
        if (!this.panel) return;
        this.isDragging = true;
        const rect = this.panel.getBoundingClientRect();
        this.dragOffset = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        this.panel.style.cursor = "grabbing";
    }

    onDragMove(e) {
        if (!this.isDragging || !this.panel) return;
        const x = e.clientX - this.dragOffset.x;
        const y = e.clientY - this.dragOffset.y;
        const maxW = window.innerWidth - this.panel.offsetWidth;
        const maxH = window.innerHeight - this.panel.offsetHeight;

        this.panel.style.left = Math.max(0, Math.min(x, maxW)) + "px";
        this.panel.style.top = Math.max(0, Math.min(y, maxH)) + "px";
        this.panel.style.right = "auto";
    }

    onDragEnd() {
        if (this.panel) {
            this.isDragging = false;
            this.panel.style.cursor = "default";
        }
    }

    showStealthAnchor() {
        if (document.getElementById("kyo-stealth-anchor")) return;
        const anchor = document.createElement("div");
        anchor.id = "kyo-stealth-anchor";
        anchor.title = "Kaptan DM panelini göster";
        anchor.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9"/>
                <circle cx="12" cy="12" r="3"/>
                <line x1="12" y1="3" x2="12" y2="9"/>
                <line x1="12" y1="15" x2="12" y2="21"/>
                <line x1="3" y1="12" x2="9" y2="12"/>
                <line x1="15" y1="12" x2="21" y2="12"/>
                <line x1="5.6" y1="5.6" x2="9.9" y2="9.9"/>
                <line x1="14.1" y1="14.1" x2="18.4" y2="18.4"/>
                <line x1="18.4" y1="5.6" x2="14.1" y2="9.9"/>
                <line x1="9.9" y1="14.1" x2="5.6" y2="18.4"/>
            </svg>
        `;
        anchor.addEventListener("click", () => {
            this.sound.play("stealth");
            this.hideStealthAnchor();
            if (this.panel) {
                this.panel.classList.remove("kyo-stealth-active");
                Storage.setRaw("stealth_mode", "false");
            }
        });
        document.body.appendChild(anchor);
    }

    hideStealthAnchor() {
        const anchor = document.getElementById("kyo-stealth-anchor");
        anchor?.remove();
    }

    async close() {
        if (this.isDeleting) {
            const confirmStop = await this.modal.confirm(
                this.i18n("modalDeletionInProgress"),
                this.i18n("modalDeletionInProgressMessage"),
                { icon: "warning" }
            );
            if (!confirmStop) return;
            this.shouldStop = true;
        }
        if (this.globalKeydownHandler) {
            window.removeEventListener("keydown", this.globalKeydownHandler);
            this.globalKeydownHandler = null;
        }
        if (this.konamiHandler) {
            window.removeEventListener("keydown", this.konamiHandler);
            this.konamiHandler = null;
        }
        if (this.panicHandler) {
            window.removeEventListener("keydown", this.panicHandler);
            this.panicHandler = null;
        }
        if (this.debugStatsInterval) {
            clearInterval(this.debugStatsInterval);
            this.debugStatsInterval = null;
        }
        this.hideStealthAnchor();
        this.stopMatrixRain();
        this.panel?.remove();
        this.panel = null;
    }

    parseAIInput(text) {
        if (!text) return null;
        const clean = text.toLowerCase().trim();
        const rules = {
            onlyAttachments: /resim|foto|görsel|görüntü|image|photo|dosya|file|video|gif|attachment|yükleme/i.test(clean),
            onlyLinks: /link|bağlantı|url|http|www/i.test(clean),
            onlyProfanity: /küfür|argo|badword|profanity/i.test(clean),
            keywords: []
        };
        const quotedMatches = text.match(/"([^"\\]|\\.)*"/g);
        if (quotedMatches) {
            rules.keywords = quotedMatches.map(m => m.replace(/"/g, "").toLowerCase().trim());
        } else {
            if (clean.length > 0 && !rules.onlyAttachments && !rules.onlyLinks && !rules.onlyProfanity) {
                rules.keywords = [clean];
            }
        }
        return rules;
    }

    filterMessage(msg, aiRules, advOptions) {
        // 1. Pinned messages protection
        if (advOptions?.keepPinned && msg.pinned) {
            return false;
        }

        // 2. Whitelist words protection
        if (advOptions?.whitelistWords && advOptions.whitelistWords.length > 0) {
            const contentLower = (msg.content || "").toLowerCase();
            const hit = advOptions.whitelistWords.some(w => contentLower.includes(w));
            if (hit) return false;
        }

        // 3. Date Range (End Date check - cannot delete newer than end date)
        if (advOptions?.dateEnd) {
            const t = new Date(msg.timestamp).getTime();
            if (t > advOptions.dateEnd) return false;
        }

        // 3b. Age Filter check (cannot delete newer than maxAgeDate threshold)
        if (advOptions?.maxAgeDate) {
            const t = new Date(msg.timestamp).getTime();
            if (t > advOptions.maxAgeDate) return false;
        }

        // 4. Specific Message Types
        if (advOptions?.msgType && advOptions.msgType !== "all") {
            if (advOptions.msgType === "replies") {
                if (msg.type !== 19 && !msg.referenced_message) return false;
            } else if (advOptions.msgType === "gifs") {
                const isGif = /tenor\.com|giphy\.com|\.gif/i.test(msg.content || "") || 
                    (msg.embeds && msg.embeds.some(e => e.type === "gifv" || e.video || (e.thumbnail && e.thumbnail.url.includes(".gif"))));
                if (!isGif) return false;
            } else if (advOptions.msgType === "attachments") {
                const hasAttachment = msg.attachments && msg.attachments.length > 0;
                if (!hasAttachment) return false;
            }
        }

        // 5. AI Prompt Rules
        if (aiRules) {
            if (aiRules.onlyAttachments) {
                const hasAttachment = (msg.attachments && msg.attachments.length > 0) || (msg.embeds && msg.embeds.length > 0);
                if (!hasAttachment) return false;
            }
            if (aiRules.onlyLinks) {
                const hasLink = /https?:\/\/[^\s]+/.test(msg.content);
                if (!hasLink) return false;
            }
            if (aiRules.onlyProfanity) {
                const profanityRegex = /amk|aq|sik|piç|göt|yarrak|oç|siktir|kaltak|kahpe|orospu|fuck|shit|bitch|asshole|cunt/i;
                const hasProfanity = profanityRegex.test(msg.content);
                if (!hasProfanity) return false;
            }
            if (aiRules.keywords && aiRules.keywords.length > 0) {
                const hasKeyword = aiRules.keywords.some(kw => msg.content.toLowerCase().includes(kw));
                if (!hasKeyword) return false;
            }
        }

        // 6. Query Builder Filters
        if (advOptions?.queryBuilder) {
            const q = advOptions.queryBuilder;
            let matchedAnyFilter = false;
            let activeFiltersCount = 0;

            if (q.images) {
                activeFiltersCount++;
                const isImage = (msg.attachments && msg.attachments.some(a => a.width || a.content_type?.startsWith("image/"))) ||
                    (msg.embeds && msg.embeds.some(e => e.type === "image" || e.thumbnail));
                if (isImage) matchedAnyFilter = true;
            }
            if (q.videos) {
                activeFiltersCount++;
                const isVideo = (msg.attachments && msg.attachments.some(a => a.content_type?.startsWith("video/"))) ||
                    (msg.embeds && msg.embeds.some(e => e.type === "video" || e.video));
                if (isVideo) matchedAnyFilter = true;
            }
            if (q.gifs) {
                activeFiltersCount++;
                const isGif = /tenor\.com|giphy\.com|\.gif/i.test(msg.content || "") ||
                    (msg.attachments && msg.attachments.some(a => a.filename?.endsWith(".gif") || a.content_type?.includes("gif"))) ||
                    (msg.embeds && msg.embeds.some(e => e.type === "gifv" || e.thumbnail?.url?.includes(".gif")));
                if (isGif) matchedAnyFilter = true;
            }
            if (q.audio) {
                activeFiltersCount++;
                const isAudio = msg.attachments && msg.attachments.some(a => a.content_type?.startsWith("audio/") || a.filename?.endsWith(".mp3") || a.filename?.endsWith(".wav") || a.filename?.endsWith(".ogg"));
                if (isAudio) matchedAnyFilter = true;
            }
            if (q.zip) {
                activeFiltersCount++;
                const isZip = msg.attachments && msg.attachments.some(a => /\.(zip|rar|7z|tar|gz)$/i.test(a.filename || ""));
                if (isZip) matchedAnyFilter = true;
            }
            if (q.links) {
                activeFiltersCount++;
                const isLink = /https?:\/\/[^\s]+/.test(msg.content || "");
                if (isLink) matchedAnyFilter = true;
            }
            if (q.embeds) {
                activeFiltersCount++;
                const isEmbed = msg.embeds && msg.embeds.length > 0;
                if (isEmbed) matchedAnyFilter = true;
            }

            const contentLength = (msg.content || "").length;
            if (q.short) {
                activeFiltersCount++;
                if (contentLength > 0 && contentLength < 10) matchedAnyFilter = true;
            }
            if (q.long) {
                activeFiltersCount++;
                if (contentLength > 100) matchedAnyFilter = true;
            }
            if (q.empty) {
                activeFiltersCount++;
                if (contentLength === 0) matchedAnyFilter = true;
            }

            if (q.emojis) {
                activeFiltersCount++;
                const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{1F1E0}-\u{1F1FF}]|<a?:[a-zA-Z0-9_]+:[0-9]+>/u;
                if (emojiRegex.test(msg.content || "")) matchedAnyFilter = true;
            }

            if (q.mentions) {
                activeFiltersCount++;
                const mentionRegex = /@everyone|@here|<@!?\d+>|<@&\d+>/;
                if (mentionRegex.test(msg.content || "")) matchedAnyFilter = true;
            }

            if (activeFiltersCount > 0 && !matchedAnyFilter) {
                return false;
            }
        }

        return true;
    }

    downloadReport() {
        let text = "========================================\n";
        text += "KAPTAN DM CLEANER TEMİZLİK RAPORU\n";
        text += `Tarih: ${new Date().toLocaleString()}\n`;
        text += `Silinen Mesaj Sayısı: ${this.deleteStatus.deleted}\n`;
        text += `Başarısız Mesaj Sayısı: ${this.deleteStatus.failed}\n`;
        text += "========================================\n\n";
        
        if (this.deletedLog.length === 0) {
            text += "Silinen mesaj detayı bulunamadı.\n";
        } else {
            this.deletedLog.forEach((log, idx) => {
                text += `${idx + 1}. [Kanal: ${log.channel}] [Zaman: ${log.time}] ID: ${log.id}\n`;
                text += `İçerik: ${log.content || "(Boş veya Medya)"}\n`;
                text += "----------------------------------------\n";
            });
        }

        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "kaptan-temizlik-raporu.txt";
        a.click();
        URL.revokeObjectURL(url);
    }

    downloadReportCsv() {
        let csvContent = "\uFEFF"; // BOM for Turkish character support in Excel
        csvContent += "Sıra;Kanal;Zaman;Mesaj ID;İçerik\n";
        
        if (this.deletedLog.length === 0) {
            csvContent += ";;;;\n";
        } else {
            this.deletedLog.forEach((log, idx) => {
                const escapedChannel = (log.channel || "").replace(/"/g, '""');
                const escapedTime = (log.time || "").replace(/"/g, '""');
                const escapedId = (log.id || "").replace(/"/g, '""');
                const escapedContent = (log.content || "(Boş veya Medya)").replace(/"/g, '""');
                
                csvContent += `"${idx + 1}";"${escapedChannel}";"${escapedTime}";"${escapedId}";"${escapedContent}"\n`;
            });
        }

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "kaptan-temizlik-raporu.csv";
        a.click();
        URL.revokeObjectURL(url);
    }

    async startDeleting(bypassScheduler = false) {
        if (!this.panel) return;

        // Scheduler Gecikmeli Başlatıcı check
        const schedDelay = parseInt(this.panel.querySelector("#kyo-scheduler-delay")?.value || "0", 10);
        if (schedDelay > 0 && !this.isDelayCountdownActive && !bypassScheduler) {
            this.isDelayCountdownActive = true;
            this.isDeleting = true;

            const overlay = document.createElement("div");
            overlay.className = "kyo-scheduler-countdown-overlay";
            overlay.innerHTML = `
                <div style="font-size: 16px; font-weight: bold; color: #fff; letter-spacing: 1px;">ZAMAN AYARLI TEMİZLİK</div>
                <div style="font-size: 11px; color: #888; margin-top: 4px;">Temizlik otomatik olarak başlayacak...</div>
                <div id="kyo-countdown-timer" class="kyo-countdown-num">${schedDelay}</div>
                <button id="kyo-cancel-scheduler" class="kyo-button" style="background: linear-gradient(135deg, #ff0033, #8b0000) !important; box-shadow: 0 4px 15px rgba(255, 0, 51, 0.35); padding: 8px 16px; font-size:12px; margin-top:10px;">İPTAL ET</button>
            `;
            this.panel.appendChild(overlay);

            let timeLeft = schedDelay;
            const timerText = overlay.querySelector("#kyo-countdown-timer");
            const cancelBtn = overlay.querySelector("#kyo-cancel-scheduler");

            this.sound.play("start");

            this.schedulerInterval = setInterval(() => {
                timeLeft--;
                if (timerText) timerText.textContent = timeLeft;
                this.sound.play("click");

                if (timeLeft <= 0) {
                    clearInterval(this.schedulerInterval);
                    overlay.remove();
                    this.isDelayCountdownActive = false;
                    this.isDeleting = false;
                    this.startDeleting(true);
                }
            }, 1000);

            cancelBtn.addEventListener("click", () => {
                this.sound.play("error");
                clearInterval(this.schedulerInterval);
                overlay.remove();
                this.isDelayCountdownActive = false;
                this.isDeleting = false;
            });

            return;
        }

        if (this.isDeleting) return;

        const currentUserId = this.api.getCurrentUserId();
        if (!currentUserId) {
            return void await this.modal.alert("Hata", "Kullanıcı bilgileri doğrulanamadı. Lütfen sayfayı yenileyin.", { icon: "error" });
        }

        const isServerMode = this.api.isGuildChannel();
        const deleteAll = this.panel.querySelector("#kyo-delete-all").checked;
        const aiInputVal = this.panel.querySelector("#kyo-ai-input").value;
        const aiRules = this.parseAIInput(aiInputVal);

        const limitVal = parseInt(this.panel.querySelector("#kyo-limit").value) || 100;
        const finalLimit = deleteAll ? Infinity : limitVal;

        const ageSelectVal = parseInt(this.panel.querySelector("#kyo-scheduler-age-filter")?.value || "0", 10);
        const maxAgeDate = ageSelectVal > 0 ? (Date.now() - ageSelectVal * 24 * 60 * 60 * 1000) : null;

        // Read advanced options
        const advOptions = {
            maxAgeDate: maxAgeDate,
            whitelistWords: (this.panel.querySelector("#kyo-whitelist-words")?.value || "")
                .split(",")
                .map(w => w.trim().toLowerCase())
                .filter(Boolean),
            keepPinned: this.panel.querySelector("#kyo-keep-pinned")?.checked ?? true,
            dateStart: this.panel.querySelector("#kyo-date-start")?.value 
                ? new Date(this.panel.querySelector("#kyo-date-start").value).getTime() 
                : null,
            dateEnd: this.panel.querySelector("#kyo-date-end")?.value 
                ? new Date(this.panel.querySelector("#kyo-date-end").value).getTime() 
                : null,
            msgType: this.panel.querySelector("#kyo-msg-type-filter")?.value || "all",
            backupBefore: this.panel.querySelector("#kyo-backup-before")?.checked ?? false,
            backupHtml: this.panel.querySelector("#kyo-backup-html")?.checked ?? false,
            ghostMode: (this.panel.querySelector("#kyo-ghost-mode")?.checked ?? true) || this.panel.classList.contains("kyo-stealth-mode"),
            dryRun: this.panel.querySelector("#kyo-dry-run")?.checked ?? false,
            delayMs: parseInt(this.panel.querySelector("#kyo-delay-slider")?.value) || 1200,
            queryBuilder: this.getQueryBuilderOptions()
        };

        this.currentSweepOptions = advOptions;
        this.currentSweepAiRules = aiRules;
        this.currentSweepLimit = finalLimit;
        if (advOptions.backupBefore && advOptions.backupHtml) {
            this.unlockAchievement("ach-archivist");
        }
        this.isDeleting = true;
        this.shouldStop = false;
        this.isPaused = false;
        this.deleteStatus = { total: 0, deleted: 0, failed: 0 };
        this.deletedLog = [];

        let targetChannelIds = [];
        if (isServerMode) {
            const channelId = this.api.getCurrentChannelId();
            if (!channelId) {
                this.isDeleting = false;
                return void await this.modal.alert("Hata", "Sunucu kanalı tespit edilemedi.", { icon: "error" });
            }
            targetChannelIds = [channelId];
        } else {
            if (this.selectedDeleteMode === "selected") {
                const selectedCheckboxes = this.panel.querySelectorAll(".kyo-dm-item-checkbox:checked");
                targetChannelIds = Array.from(selectedCheckboxes).map(cb => cb.value);
                if (targetChannelIds.length === 0) {
                    this.isDeleting = false;
                    return void await this.modal.alert(this.i18n("modalError"), this.i18n("selectAtLeastOneDM"), { icon: "warning" });
                }
            } else if (this.selectedDeleteMode === "full") {
                await this.collectAllDMs();
                targetChannelIds = Array.from(this.dmCache.keys());
                if (targetChannelIds.length === 0) {
                    this.isDeleting = false;
                    return void await this.modal.alert(this.i18n("modalError"), this.i18n("modalNoMessagesFound"), { icon: "warning" });
                }
            } else { // "single"
                if (!this.api.isDMPage()) {
                    this.isDeleting = false;
                    return void await this.modal.alert(this.i18n("modalNotOnDMPage"), this.i18n("modalNotOnDMPageMessage"), { icon: "warning" });
                }
                const channelId = this.api.getCurrentChannelId();
                if (!channelId) {
                    this.isDeleting = false;
                    return void await this.modal.alert(this.i18n("modalChannelNotDetected"), this.i18n("modalChannelNotDetectedMessage"), { icon: "error" });
                }
                targetChannelIds = [channelId];
            }
        }

        if (!isServerMode && (this.selectedDeleteMode === "selected" || this.selectedDeleteMode === "full")) {
            await this.collectAllDMs();
            const deleteIndividuals = this.panel.querySelector("#kyo-target-dms")?.checked ?? true;
            const deleteGroups = this.panel.querySelector("#kyo-target-groups")?.checked ?? true;
            const protectFavorites = this.panel.querySelector("#kyo-whitelist-favorites")?.checked ?? false;

            targetChannelIds = targetChannelIds.filter(cid => {
                const meta = this.dmCache?.get(cid);
                if (!meta) return true;

                if (meta.type === "dm" && !deleteIndividuals) return false;
                if (meta.type === "group" && !deleteGroups) return false;
                if (protectFavorites && meta.favorite) return false;

                return true;
            });

            if (targetChannelIds.length === 0) {
                this.isDeleting = false;
                return void await this.modal.alert(this.i18n("modalError"), "Seçilen kapsama veya filtrelere uyan (bireysel/grup) ya da koruma dışı bırakılmış DM kutusu bulunamadı.", { icon: "warning" });
            }
        }

        this.currentSweepChannelsCount = targetChannelIds.length;

        // Run Dry Run / Pre-scan Analysis first!
        const approved = await this.runPreScanAndShowPreview(targetChannelIds, finalLimit, aiRules, advOptions, isServerMode);
        if (!approved) {
            this.isDeleting = false;
            return;
        }

        // Proceed to Deletion sweeps
        this.isDeleting = true;
        this.shouldStop = false;
        this.isPaused = false;
        this.deleteStatus = { total: 0, deleted: 0, failed: 0 };
        this.deletedLog = [];

        this.createDeleteSession(isServerMode ? "single" : this.selectedDeleteMode, targetChannelIds);

        this.panel.style.display = "none";
        this.showProgressBar();

        try {
            if (isServerMode) {
                const channelId = targetChannelIds[0];
                this.currentChannelSweepId = channelId;
                this.currentChannelSweepIndex = 0;
                this.updateProgressTitle(this.i18n("progressServerTitle"));
                if (advOptions.backupBefore) {
                    await this.backupChannelMessages(channelId, finalLimit, aiRules, advOptions, this.i18n("serverChannelName"));
                }
                await this.sweepChannel(channelId, finalLimit, aiRules, this.i18n("serverChannelName"), advOptions);
            } else {
                if (this.selectedDeleteMode === "selected" || this.selectedDeleteMode === "full") {
                    const channels = await this.api.getDMChannels();

                    for (let i = 0; i < targetChannelIds.length && !this.shouldStop; i++) {
                        let channelId = targetChannelIds[i];
                        let recipientName = "";
                        let isPlaceholder = channelId.startsWith("rel_");
                        let relId = isPlaceholder ? channelId.replace("rel_", "") : "";

                        this.currentChannelSweepId = channelId;
                        this.currentChannelSweepIndex = i;

                        if (isPlaceholder) {
                            // Retrieve placeholder recipient name from cache
                            const cacheItem = this.getDMById(channelId);
                            recipientName = cacheItem?.name || "Gizli DM";
                            this.updateProgressTitle(`DM ${i + 1}/${targetChannelIds.length}: ${recipientName} (Açılıyor...)`);
                            this.appendConsoleLog(`[GİZLİ] ${recipientName} ile olan gizli DM kutusu açılıyor...`, "system");

                            const resolvedChan = await this.api.createDMChannel(relId);
                            if (resolvedChan && resolvedChan.id) {
                                channelId = resolvedChan.id;
                                this.currentChannelSweepId = channelId; // Update sweeping ID
                                this.appendConsoleLog(`[GİZLİ] DM kutusu başarıyla açıldı (Kanal ID: ${channelId}).`, "system");
                            } else {
                                this.appendConsoleLog(`[GİZLİ] ${recipientName} için DM kutusu açılamadı! Bu kanal atlanıyor.`, "error");
                                if (this.activeDeleteSession) {
                                    this.activeDeleteSession.failed++;
                                    this.updateDeleteSessionProgress();
                                }
                                continue;
                            }
                        } else {
                            const channelObj = channels.find(ch => ch.id === channelId);
                            recipientName = channelObj?.recipients?.map(r => r.username).join(", ") || this.i18n("groupDM");
                        }
                        
                        this.updateProgressTitle(`DM ${i + 1}/${targetChannelIds.length}: ${recipientName}`);

                        window.history.pushState(null, null, "/channels/@me/" + channelId);
                        window.dispatchEvent(new PopStateEvent("popstate"));

                        await this.api.delay(1500);

                        if (this.activeDeleteSession) {
                            this.updateDeleteSessionProgress();
                        }

                        if (advOptions.backupBefore) {
                            await this.backupChannelMessages(channelId, Infinity, aiRules, advOptions, recipientName);
                        }
                        await this.sweepChannel(channelId, Infinity, aiRules, recipientName, advOptions);
                    }
                } else {
                    const channelId = targetChannelIds[0];
                    this.currentChannelSweepId = channelId;
                    this.currentChannelSweepIndex = 0;
                    this.updateProgressTitle(this.i18n("progressTitle"));

                    const channels = await this.api.getDMChannels();
                    const channelObj = channels.find(ch => ch.id === channelId);
                    const recipientName = channelObj?.recipients?.map(r => r.username).join(", ") || this.i18n("groupDM");

                    if (advOptions.backupBefore) {
                        await this.backupChannelMessages(channelId, finalLimit, aiRules, advOptions, recipientName);
                    }
                    await this.sweepChannel(channelId, finalLimit, aiRules, recipientName, advOptions);
                }
            }

            this.hideProgressBar();
            this.sound.play("success");

            this.modal.show(
                this.i18n("modalDeletionComplete"),
                this.shouldStop ? this.i18n("modalDeletionStopped") : (isServerMode ? this.i18n("modalServerSuccess") : this.i18n("modalDeletionSuccess")),
                [
                    {
                        text: "TXT Raporu",
                        primary: true,
                        onClick: () => this.downloadReport()
                    },
                    {
                        text: "CSV Raporu",
                        primary: true,
                        onClick: () => this.downloadReportCsv()
                    },
                    {
                        text: this.i18n("modalOk"),
                        primary: false,
                        onClick: () => {}
                    }
                ],
                {
                    icon: "success",
                    stats: {
                        deleted: this.deleteStatus.deleted,
                        failed: this.deleteStatus.failed,
                        total: this.deleteStatus.total
                    }
                }
            );
        } catch (err) {
            this.hideProgressBar();
            if (this.activeDeleteSession) {
                this.logSession("error", `Temizlik hatayla durdu: ${err.message || err}`, "error");
                this.finishDeleteSession("failed");
            }
            await this.modal.alert(this.i18n("modalError"), this.i18n("modalErrorMessage"), { icon: "error" });
        } finally {
            this.sendFinishNotification();
            this.isDeleting = false;
            this.panel.style.display = "block";

            if (this.activeDeleteSession) {
                if (this.shouldStop) {
                    this.abortDeleteSession();
                } else {
                    this.finishDeleteSession("completed");
                }
            }

            if (!this.shouldStop && this.deleteStatus && this.deleteStatus.deleted > 0) {
                if (this.deleteStatus.deleted >= 500 && this.deleteStatus.failed === 0) {
                    this.unlockAchievement("ach-perfect-voyage");
                }
                if (this.deleteStatus.deleted >= 100 && advOptions.delayMs <= 500) {
                    this.unlockAchievement("ach-speedrunner");
                }
            }
        }
    }

    sendFinishNotification() {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(this.i18n("extensionName"), {
                body: this.shouldStop ? this.i18n("notificationStopped") : this.i18n("notificationSuccess"),
                icon: "https://discord.com/assets/847541504914fd33810e70a0ea73177e.ico"
            });
        }
    }

    appendConsoleLog(text, type = "") {
        const feed = this.progressBarElements?.consoleFeed;
        if (!feed) return;

        if (this.activeDeleteSession) {
            let level = "info";
            if (type === "success") level = "success";
            else if (type === "error" || type === "danger") level = "error";
            else if (type === "warning") level = "warning";
            else if (type === "system") level = "system";
            
            this.logSession(level, text, "log");
            return;
        }

        const line = document.createElement("div");
        line.className = `kyo-console-line ${type}`;
        
        const time = new Date().toTimeString().split(' ')[0];
        
        // Escape content first for safety
        const escaped = this.escapeHtml(text);
        let html = escaped;
        
        // Replace HTTP verbs
        html = html.replace(/\b(GET)\b/g, '<span class="kyo-log-get">$1</span>');
        html = html.replace(/\b(POST)\b/g, '<span class="kyo-log-post">$1</span>');
        html = html.replace(/\b(DELETE)\b/g, '<span class="kyo-log-delete">$1</span>');
        
        // Replace Status Codes
        html = html.replace(/\b(200)\b/g, '<span class="kyo-log-success">$1</span>');
        html = html.replace(/\b(429)\b/g, '<span class="kyo-log-warning">$1</span>');
        
        // Highlights tags like [BAŞARIM], [EASTER-EGG], [LIMIT]
        html = html.replace(/\[(BAŞARIM|EASTER-EGG|YEDEK)\]/g, '<span class="kyo-log-success">[$1]</span>');
        html = html.replace(/\[(LIMIT|PANIC|GİZLİ|HATA)\]/g, '<span class="kyo-log-warning">[$1]</span>');
        
        line.innerHTML = `<span style="opacity: 0.5;">[${time}]</span> ${html}`;
        
        feed.appendChild(line);
        
        requestAnimationFrame(() => {
            if (feed) {
                const isNearBottom = feed.scrollHeight - feed.clientHeight - feed.scrollTop < 25;
                if (isNearBottom) {
                    feed.scrollTop = feed.scrollHeight;
                }
            }
        });
        
        while (feed.childNodes.length > 50) {
            const first = feed.firstChild;
            if (first && first.id) {
                const id = first.id.replace("kyo-console-", "");
                this.consoleStatusLines?.delete(id);
            }
            feed.removeChild(first);
        }
    }

    updateConsoleStatus(id, text, type = "") {
        const feed = this.progressBarElements?.consoleFeed;
        if (!feed) return;
        
        let line = this.consoleStatusLines?.get(id);
        const time = new Date().toTimeString().split(' ')[0];
        
        if (!line) {
            line = feed.querySelector(`#kyo-console-${id}`);
            if (!line) {
                line = document.createElement("div");
                line.id = `kyo-console-${id}`;
                line.className = `kyo-console-line ${type}`;
                feed.appendChild(line);
            }
            this.consoleStatusLines?.set(id, line);
        } else {
            line.className = `kyo-console-line ${type}`;
        }
        
        const escaped = this.escapeHtml(text);
        let html = escaped;
        
        html = html.replace(/\b(GET)\b/g, '<span class="kyo-log-get">$1</span>');
        html = html.replace(/\b(POST)\b/g, '<span class="kyo-log-post">$1</span>');
        html = html.replace(/\b(DELETE)\b/g, '<span class="kyo-log-delete">$1</span>');
        html = html.replace(/\b(200)\b/g, '<span class="kyo-log-success">$1</span>');
        html = html.replace(/\b(429)\b/g, '<span class="kyo-log-warning">$1</span>');
        html = html.replace(/\[(BAŞARIM|EASTER-EGG|YEDEK)\]/g, '<span class="kyo-log-success">[$1]</span>');
        html = html.replace(/\[(LIMIT|PANIC|GİZLİ|HATA)\]/g, '<span class="kyo-log-warning">[$1]</span>');
        
        line.innerHTML = `<span style="opacity: 0.5;">[${time}]</span> ${html}`;
        
        requestAnimationFrame(() => {
            if (feed) {
                const isNearBottom = feed.scrollHeight - feed.clientHeight - feed.scrollTop < 25;
                if (isNearBottom) {
                    feed.scrollTop = feed.scrollHeight;
                }
            }
        });
    }

    async backupChannelMessages(channelId, limit, aiRules, advOptions, channelName) {
        this.appendConsoleLog(`[YEDEK] ${this.i18n("stepListingChats")}`, "system");
        let messagesToBackup = [];
        let lastMessageId = null;
        let hasMore = true;
        const myUserId = this.api.getCurrentUserId();
        const maxBackupLimit = limit === Infinity ? 2000 : limit;
        let totalFetched = 0;

        while (hasMore && messagesToBackup.length < maxBackupLimit) {
            // Check paused state
            while (this.isPaused && !this.shouldStop) {
                await this.api.delay(200);
            }
            if (this.shouldStop) break;

            const messages = await this.api.fetchMessagesBatch(channelId, lastMessageId, 100);
            if (!messages || messages.length === 0) {
                hasMore = false;
                break;
            }

            totalFetched += messages.length;

            const ourMessages = messages.filter(m => m.author && m.author.id === myUserId);
            const filtered = ourMessages.filter(m => this.filterMessage(m, aiRules, advOptions));
            
            let dateStartReached = false;
            for (const msg of filtered) {
                if (advOptions?.dateStart) {
                    const t = new Date(msg.timestamp).getTime();
                    if (t < advOptions.dateStart) {
                        dateStartReached = true;
                        break;
                    }
                }
                messagesToBackup.push(msg);
                if (messagesToBackup.length >= maxBackupLimit) break;
            }

            if (dateStartReached) {
                hasMore = false;
                break;
            }

            this.updateConsoleStatus("backup-fetch-status", `Sohbet yedeği taranıyor... Size ait ${messagesToBackup.length} mesaj yedekleme için hazırlandı. (İncelenen toplam: ${totalFetched})`, "system");

            lastMessageId = messages[messages.length - 1].id;
            await this.api.delay(300);
        }

        if (messagesToBackup.length >= maxBackupLimit) {
            this.appendConsoleLog(`[YEDEK] Güvenlik Limiti! Bellek ve tarayıcı performansı için yedekleme ${maxBackupLimit} mesaj ile sınırlandırıldı.`, "warning");
        }

        if (messagesToBackup.length === 0) {
            this.appendConsoleLog("[YEDEK] Yedeklenecek mesaj bulunamadı.", "system");
            return;
        }

        const safeChanName = channelName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        let blob, filename;

        if (advOptions?.backupHtml) {
            const htmlContent = this.generateHtmlBackup(channelId, channelName, messagesToBackup);
            blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
            filename = `kaptan_backup_${safeChanName}_${Date.now()}.html`;
        } else {
            let backupText = `========================================\n`;
            backupText += `KAPTAN DM CLEANER - SOHBET YEDEĞİ\n`;
            backupText += `Kanal: ${channelName} (ID: ${channelId})\n`;
            backupText += `Tarih: ${new Date().toLocaleString()}\n`;
            backupText += `Toplam Mesaj: ${messagesToBackup.length}\n`;
            backupText += `========================================\n\n`;

            messagesToBackup.forEach((msg, idx) => {
                const time = new Date(msg.timestamp).toLocaleString();
                let attachmentUrls = "";
                if (msg.attachments && msg.attachments.length > 0) {
                    attachmentUrls = ` [Dosyalar: ${msg.attachments.map(a => a.url).join(", ")}]`;
                }
                backupText += `[${time}] ID: ${msg.id}\nİçerik: ${msg.content || "(Boş/Medya)"}${attachmentUrls}\n----------------------------------------\n`;
            });
            blob = new Blob([backupText], { type: "text/plain;charset=utf-8" });
            filename = `kaptan_backup_${safeChanName}_${Date.now()}.txt`;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        this.appendConsoleLog(this.i18n("backupDownloadSuccess"), "system");
        Storage.setRaw("backup_master_triggered", "true");
        this.unlockAchievement("ach-backup-master");
        await this.api.delay(1000);
    }

    async sweepChannel(channelId, limit, aiRules, channelName, advOptions) {
        let lastMessageId = null;
        let hasMore = true;
        const myUserId = this.api.getCurrentUserId();
        let totalFetched = 0;
        let totalOurMessagesFetched = 0;

        if (advOptions?.dryRun) {
            this.appendConsoleLog(this.i18n("terminalDryRunStarted"), "system");
        } else {
            this.appendConsoleLog(this.i18n("terminalScanning", channelName), "system");
        }

        while (hasMore && !this.shouldStop && this.deleteStatus.deleted < limit) {
            // Check paused state
            while (this.isPaused && !this.shouldStop) {
                await this.api.delay(200);
            }
            if (this.shouldStop) break;

            // Fetch messages batch
            let messages;
            try {
                messages = await this.api.fetchMessagesBatch(channelId, lastMessageId, 100);
            } catch (err) {
                if (err instanceof RateLimitError) {
                    const delayMs = err.retryAfterMs;
                    this.appendConsoleLog(`[LIMIT] Tarama Hız Sınırı! ${(delayMs/1000).toFixed(1)}sn beklenecek...`, "system");
                    if (this.activeDeleteSession) {
                        this.activeDeleteSession.rateLimits++;
                        this.activeDeleteSession.retries++;
                        this.logSession("warning", `Mesaj tarama hız sınırı. ${(delayMs/1000).toFixed(1)}sn bekleniyor...`, "rate_limit", {
                            channelId,
                            extra: { retryAfterMs: delayMs }
                        });
                        this.updateDeleteSessionProgress();
                    }
                    await this.api.delay(delayMs + 150);
                    continue;
                } else {
                    throw err;
                }
            }

            if (!messages || messages.length === 0) {
                hasMore = false;
                break;
            }

            totalFetched += messages.length;
            
            // Filter our messages
            const ourMessages = messages.filter(m => m.author && m.author.id === myUserId);
            totalOurMessagesFetched += ourMessages.length;
            
            this.updateConsoleStatus("fetch-status", `Mesajlar taranıyor... Size ait ${totalOurMessagesFetched} mesaj tespit edildi. (İncelenen toplam: ${totalFetched})`, "system");
            
            // Apply all filters (including advanced)
            const filteredMessages = ourMessages.filter(m => this.filterMessage(m, aiRules, advOptions));
            
            // Time range start check: if a message is older than start date, stop fetching
            let dateStartReached = false;
            let activeMessages = [];
            for (const msg of filteredMessages) {
                if (advOptions?.dateStart) {
                    const t = new Date(msg.timestamp).getTime();
                    if (t < advOptions.dateStart) {
                        dateStartReached = true;
                        break;
                    }
                }
                activeMessages.push(msg);
            }

            if (activeMessages.length > 0) {
                this.updateConsoleStatus("matches-status", `Silinmek üzere filtreye uygun ${activeMessages.length} yeni mesaj eşleşti.`);
            }
            
            this.deleteStatus.total += activeMessages.length;
            if (this.activeDeleteSession) {
                this.activeDeleteSession.total = this.deleteStatus.total;
                this.updateDeleteSessionProgress();
            }
            this.updateProgressBar();

            // Process messages
            for (let i = 0; i < activeMessages.length && !this.shouldStop && this.deleteStatus.deleted < limit; i++) {
                // Check paused state
                while (this.isPaused && !this.shouldStop) {
                    await this.api.delay(200);
                }
                if (this.shouldStop) break;

                const msg = activeMessages[i];
                const cleanContent = msg.content ? (msg.content.length > 25 ? msg.content.substring(0, 22) + "..." : msg.content) : "Medya/Resim";

                if (advOptions?.dryRun) {
                    // Dry run simulation
                    this.deleteStatus.deleted++;
                    if (this.activeDeleteSession) {
                        this.activeDeleteSession.deleted++;
                        this.updateDeleteSessionProgress();
                    }
                    this.deletedLog.push({
                        id: msg.id,
                        channel: channelName,
                        time: new Date(msg.timestamp).toLocaleString(),
                        content: msg.content
                    });
                    this.updateConsoleStatus("delete-progress", `[TEST-OK] Simüle silindi: "${cleanContent}" (${this.deleteStatus.deleted} / ${limit === Infinity ? 'Sınırsız' : limit})`, "success");
                    this.updateProgressBar();
                    await this.api.delay(300); // Fast delay for simulation
                } else {
                    // Actual Deletion
                    try {
                        const success = await this.api.deleteMessage(channelId, msg.id);
                        if (success) {
                            this.deleteStatus.deleted++;
                            if (this.activeDeleteSession) {
                                this.activeDeleteSession.deleted++;
                                this.updateDeleteSessionProgress();
                            }
                            this.deletedLog.push({
                                id: msg.id,
                                channel: channelName,
                                time: new Date(msg.timestamp).toLocaleString(),
                                content: msg.content
                            });
                            this.updateConsoleStatus("delete-progress", `[OK] Silindi: "${cleanContent}" (${this.deleteStatus.deleted} / ${limit === Infinity ? 'Sınırsız' : limit})`, "success");

                            // Estimate space cleaned for lifetime stats
                            let estimatedBytes = 200;
                            if (msg.attachments && msg.attachments.length > 0) {
                                msg.attachments.forEach(att => {
                                    estimatedBytes += (att.size || 0);
                                });
                            }
                            if (msg.embeds && msg.embeds.length > 0) {
                                estimatedBytes += msg.embeds.length * 500;
                            }
                            this.updateLifetimeStats(1, estimatedBytes);
                        } else {
                            this.deleteStatus.failed++;
                            if (this.activeDeleteSession) {
                                this.activeDeleteSession.failed++;
                                this.updateDeleteSessionProgress();
                            }
                            this.appendConsoleLog(this.i18n("terminalFailed", msg.id), "error");
                        }
                    } catch (err) {
                        if (err instanceof RateLimitError) {
                            const delayMs = err.retryAfterMs;
                            this.appendConsoleLog(`[LIMIT] Silme Hız Sınırı! ${(delayMs/1000).toFixed(1)}sn beklenecek...`, "system");
                            if (this.activeDeleteSession) {
                                this.activeDeleteSession.rateLimits++;
                                this.activeDeleteSession.retries++;
                                this.logSession("warning", `Mesaj silme hız sınırı. ${(delayMs/1000).toFixed(1)}sn bekleniyor...`, "rate_limit", {
                                    channelId,
                                    messageId: msg.id,
                                    extra: { retryAfterMs: delayMs }
                                });
                                this.updateDeleteSessionProgress();
                            }
                            await this.api.delay(delayMs + 150);
                            i--; // Retry deleting the same message
                            continue;
                        } else {
                            throw err;
                        }
                    }
                    this.updateProgressBar();
                    
                    // Jitter delay (Ghost mode) or regular delay
                    const baseDelay = advOptions?.delayMs || 1200;
                    if (advOptions?.ghostMode) {
                        const jitter = Math.floor(Math.random() * ((baseDelay * 2) - baseDelay + 1)) + baseDelay;
                        await this.api.delay(jitter);
                    } else {
                        await this.api.delay(baseDelay);
                    }
                }
            }

            if (dateStartReached) {
                hasMore = false;
                break;
            }

            // Move cursor backward
            lastMessageId = messages[messages.length - 1].id;
            
            // Brief pause between batch retrievals
            await this.api.delay(500);
        }
    }

    stopDeleting() {
        this.shouldStop = true;
    }

    getETAString() {
        const processed = this.deleteStatus.deleted + this.deleteStatus.failed;
        
        const limitEl = document.querySelector("#kyo-limit");
        const deleteAllEl = document.querySelector("#kyo-delete-all");
        
        let remaining = 0;
        if (deleteAllEl && deleteAllEl.checked) {
            remaining = this.deleteStatus.total - processed;
        } else if (limitEl) {
            const limitVal = parseInt(limitEl.value) || 100;
            remaining = limitVal - this.deleteStatus.deleted;
        } else {
            remaining = this.deleteStatus.total - processed;
        }

        if (remaining <= 0) {
            return this.isDeleting ? "Taranıyor..." : this.i18n("calculating");
        }
        
        // 1.2s delay per deletion plus 150ms buffer
        const totalSeconds = Math.ceil(remaining * 1.35);
        
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        
        if (h > 0) {
            return `~${h}${this.i18n("hourShort")} ${m}${this.i18n("minuteShort")}`;
        }
        if (m > 0) {
            return `~${m}${this.i18n("minuteShort")} ${s}${this.i18n("secondShort")}`;
        }
        return `~${s}${this.i18n("secondShort")}`;
    }

    showProgressBar() {
        if (this.progressBar) return;
        this.progressBar = document.createElement("div");
        this.progressBar.id = "kyo-progress-bar";
        this.progressBar.innerHTML = `
            <div class="kyo-progress-bar-top-row">
                <div class="kyo-progress-circular-container">
                    <svg width="90" height="90" viewBox="0 0 90 90" class="kyo-progress-ring-svg">
                        <circle cx="45" cy="45" r="40" class="kyo-progress-ring-circle-bg" />
                        <circle cx="45" cy="45" r="40" class="kyo-progress-ring-circle-fill" id="kyo-ring-progress-bar" />
                    </svg>
                    <div class="kyo-progress-circular-percentage" id="kyo-stat-percent">0%</div>
                </div>
                <div class="kyo-progress-content">
                    <div class="kyo-progress-text" id="kyo-progress-title-text">${this.i18n("progressTitle")}</div>
                    <div class="kyo-progress-details">
                        <span>${this.i18n("progressDeleted")}: <strong id="kyo-stat-deleted" style="color: #4ade80;">0</strong></span>
                        <span>${this.i18n("progressFailed")}: <strong id="kyo-stat-failed" style="color: #f87171;">0</strong></span>
                        <span>${this.i18n("progressTotal")}: <strong id="kyo-stat-total">0</strong></span>
                        <span style="margin-left: 8px;">${this.i18n("progressRemaining")}: <strong id="kyo-stat-eta" style="color: #60a5fa;">${this.i18n("calculating")}</strong></span>
                    </div>
                </div>
                <div class="kyo-progress-btn-group">
                    <button class="kyo-progress-pause" id="kyo-progress-pause-btn">${this.i18n("progressPause")}</button>
                    <button class="kyo-progress-stop" id="kyo-progress-stop-btn">${this.i18n("progressStop")}</button>
                </div>
            </div>
            <div class="kyo-progress-console" id="kyo-console-feed">
                <div class="kyo-console-line system">&gt;_ ${this.i18n("terminalInitialized")}</div>
            </div>
        `;
        document.body.appendChild(this.progressBar);

        this.progressBarElements = {
            deleted: this.progressBar.querySelector("#kyo-stat-deleted"),
            failed: this.progressBar.querySelector("#kyo-stat-failed"),
            total: this.progressBar.querySelector("#kyo-stat-total"),
            percent: this.progressBar.querySelector("#kyo-stat-percent"),
            ringFill: this.progressBar.querySelector("#kyo-ring-progress-bar"),
            eta: this.progressBar.querySelector("#kyo-stat-eta"),
            consoleFeed: this.progressBar.querySelector("#kyo-console-feed"),
            titleText: this.progressBar.querySelector("#kyo-progress-title-text")
        };
        this.consoleStatusLines = new Map();

        const stopBtn = this.progressBar.querySelector("#kyo-progress-stop-btn");
        const pauseBtn = this.progressBar.querySelector("#kyo-progress-pause-btn");

        stopBtn?.addEventListener("click", () => {
            this.sound.play("click");
            this.stopDeleting();
        });

        pauseBtn?.addEventListener("click", () => {
            this.sound.play("click");
            this.isPaused = !this.isPaused;
            if (this.isPaused) {
                pauseBtn.textContent = this.i18n("progressResume");
                pauseBtn.style.background = "#22c55e"; // Green for resume
                pauseBtn.style.boxShadow = "0 0 10px rgba(34, 197, 94, 0.3)";
                this.appendConsoleLog(this.i18n("terminalPaused"), "system");
            } else {
                pauseBtn.textContent = this.i18n("progressPause");
                pauseBtn.style.background = "#eab308"; // Yellow for pause
                pauseBtn.style.boxShadow = "0 0 10px rgba(234, 179, 8, 0.3)";
                this.appendConsoleLog(this.i18n("terminalResumed"), "system");
            }
        });
    }

    updateProgressTitle(titleText) {
        if (this.progressBarElements?.titleText) {
            this.progressBarElements.titleText.textContent = titleText;
        }
    }

    updateProgressBar() {
        const els = this.progressBarElements;
        if (!els) return;

        if (els.deleted) els.deleted.textContent = this.deleteStatus.deleted.toString();
        if (els.failed) els.failed.textContent = this.deleteStatus.failed.toString();
        if (els.total) els.total.textContent = this.deleteStatus.total.toString();
        if (els.eta) els.eta.textContent = this.getETAString();

        const processed = this.deleteStatus.deleted + this.deleteStatus.failed;
        if (els.percent && this.deleteStatus.total > 0) {
            const percent = Math.min(100, Math.floor((processed / this.deleteStatus.total) * 100));
            els.percent.textContent = `${percent}%`;

            if (els.ringFill) {
                const circumference = 251.2;
                const offset = circumference - (percent / 100) * circumference;
                els.ringFill.style.strokeDashoffset = offset.toString();
            }
        }
    }

    hideProgressBar() {
        if (this.progressBar) {
            this.progressBar.remove();
            this.progressBar = null;
            this.progressBarElements = null;
            this.consoleStatusLines = null;
        }
    }

    async loadLifetimeStats() {
        return new Promise(resolve => {
            if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(["kyo_lifetime_deleted", "kyo_lifetime_bytes"], (result) => {
                    const deleted = result.kyo_lifetime_deleted || 0;
                    const bytes = result.kyo_lifetime_bytes || 0;
                    resolve({ deleted, bytes });
                });
            } else {
                const deleted = parseInt(Storage.getRaw("lifetime_deleted") || "0", 10);
                const bytes = parseInt(Storage.getRaw("lifetime_bytes") || "0", 10);
                resolve({ deleted, bytes });
            }
        });
    }

    async updateLifetimeStats(deletedCount, bytesCount) {
        const stats = await this.loadLifetimeStats();
        const newDeleted = stats.deleted + deletedCount;
        const newBytes = stats.bytes + bytesCount;

        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({
                kyo_lifetime_deleted: newDeleted,
                kyo_lifetime_bytes: newBytes
            });
        } else {
            Storage.setRaw("lifetime_deleted", newDeleted.toString());
            Storage.setRaw("lifetime_bytes", newBytes.toString());
        }

        this.renderLifetimeStats(newDeleted, newBytes);

        // Track ghost mode messages deleted
        if (this.currentSweepOptions && this.currentSweepOptions.ghostMode) {
            let ghostCount = parseInt(Storage.getRaw("ghost_deleted_count") || "0", 10);
            ghostCount += deletedCount;
            Storage.setRaw("ghost_deleted_count", ghostCount.toString());
        }

        this.checkAndUnlockAchievements(newDeleted);
    }

    renderLifetimeStats(deleted, bytes) {
        const deletedEl = this.panel?.querySelector("#kyo-lifetime-deleted");
        const mbEl = this.panel?.querySelector("#kyo-lifetime-mb");
        if (deletedEl) deletedEl.textContent = deleted.toLocaleString();
        if (mbEl) {
            const mb = bytes / (1024 * 1024);
            mbEl.textContent = `${mb.toFixed(1)} MB`;
        }
    }

    matrixEasterEgg() {
        this.changeTheme("matrix");
        this.changeBackgroundEffect("matrix");
        const themeSelect = this.panel?.querySelector("#kyo-theme-select");
        const bgEffectSelect = this.panel?.querySelector("#kyo-bg-effect-select");
        if (themeSelect) themeSelect.value = "matrix";
        if (bgEffectSelect) bgEffectSelect.value = "matrix";
        this.appendConsoleLog("[EASTER-EGG] Matrix theme activated via Konami Code!", "success");
        this.unlockAchievement("ach-neo");
    }

    async restoreAllHiddenDMs() {
        const listContainer = this.panel?.querySelector("#kyo-hidden-dms-list-container");
        if (!listContainer) return;
        const buttons = listContainer.querySelectorAll(".kyo-hidden-dm-open-btn");
        if (buttons.length === 0) {
            await this.modal.alert("Bilgi", "Geri yüklenecek gizli DM kutusu bulunamadı.", { icon: "info" });
            return;
        }

        const confirm = await this.modal.confirm("Hepsini Aç", `Toplam ${buttons.length} adet gizli DM kutusu geri açılacak. Emin misiniz?`, { icon: "warning" });
        if (!confirm) return;

        this.appendConsoleLog(`[GİZLİ] ${buttons.length} gizli DM kutusunu açma işlemi başladı...`, "system");
        
        // Unlock achievement for investigator!
        this.unlockAchievement("ach-investigator");

        for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            const recipientId = btn.getAttribute("data-id");
            btn.disabled = true;
            btn.textContent = "...";
            await this.api.createDMChannel(recipientId);
            await this.api.delay(1000);
        }

        this.appendConsoleLog("[GİZLİ] Tüm gizli DM kutuları başarıyla geri açıldı.", "success");
        this.renderHiddenDMsList();
    }

    applyPreset(preset) {
        // Clear all query builder checkboxes first
        const checkBoxes = [
            "images", "videos", "gifs", "audio", "zip", "links", "embeds",
            "short", "long", "empty", "emojis", "mentions"
        ];
        checkBoxes.forEach(c => {
            const el = this.panel?.querySelector(`#q-filter-${c}`);
            if (el) el.checked = false;
        });

        const ghostCb = this.panel?.querySelector("#kyo-ghost-mode");
        const dateStartEl = this.panel?.querySelector("#kyo-date-start");
        const dateEndEl = this.panel?.querySelector("#kyo-date-end");

        if (preset === "media") {
            ["images", "videos", "gifs", "audio", "zip", "embeds"].forEach(c => {
                const el = this.panel?.querySelector(`#q-filter-${c}`);
                if (el) el.checked = true;
            });
            this.appendConsoleLog("[PRESET] Medya Temizleyici şablonu yüklendi.", "system");
        } else if (preset === "memories") {
            if (dateEndEl) {
                // Set end date to 1 year ago
                const oneYearAgo = new Date();
                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                dateEndEl.value = oneYearAgo.toISOString().split("T")[0];
            }
            if (dateStartEl) dateStartEl.value = "";
            this.appendConsoleLog("[PRESET] Eski Anılar (1 yıldan eski mesajlar) şablonu yüklendi.", "system");
        } else if (preset === "spam") {
            ["short", "empty", "emojis", "mentions"].forEach(c => {
                const el = this.panel?.querySelector(`#q-filter-${c}`);
                if (el) el.checked = true;
            });
            this.appendConsoleLog("[PRESET] Spam Temizleyici şablonu yüklendi.", "system");
        } else if (preset === "ghost") {
            if (ghostCb) ghostCb.checked = true;
            const toggleBtn = this.panel?.querySelector("#kyo-stealth-toggle");
            if (toggleBtn && !this.panel.classList.contains("kyo-stealth-mode")) {
                toggleBtn.click();
            }
            this.appendConsoleLog("[PRESET] Hayalet Modu ve Stealth Mode etkinleştirildi.", "system");
        }
        
        this.updateRegexPreview();
    }

    async runPreScanAndShowPreview(targetChannelIds, finalLimit, aiRules, advOptions, isServerMode) {
        this.panel.style.display = "none";
        this.showProgressBar();
        this.updateProgressTitle("Önizleme Analizi Yapılıyor...");
        this.appendConsoleLog("[ANALİZ] Sohbet geçmişi analiz ediliyor, lütfen bekleyin...", "system");
        
        let totalMessages = 0;
        let deleteCount = 0;
        let protectCount = 0;
        let mediaCount = 0;
        const myUserId = this.api.getCurrentUserId();

        try {
            for (let i = 0; i < targetChannelIds.length && !this.shouldStop; i++) {
                const channelId = targetChannelIds[i];
                this.updateProgressTitle(`Analiz Ediliyor (${i + 1}/${targetChannelIds.length})`);
                
                const messages = await this.api.fetchMessagesBatch(channelId, null, 100);
                if (!messages || messages.length === 0) continue;

                totalMessages += messages.length;
                messages.forEach(msg => {
                    const isOurs = msg.author && msg.author.id === myUserId;
                    const matchesFilter = isOurs && this.filterMessage(msg, aiRules, advOptions);
                    
                    if (matchesFilter) {
                        deleteCount++;
                        if (msg.attachments && msg.attachments.length > 0) {
                            mediaCount += msg.attachments.length;
                        }
                    } else {
                        protectCount++;
                    }
                });
            }

            this.hideProgressBar();

            if (this.shouldStop) {
                this.isDeleting = false;
                this.panel.style.display = "block";
                return false;
            }

            // Estimate duration: ~1.35 seconds per message to delete
            const estSeconds = Math.ceil(deleteCount * 1.35);
            let durationStr = "";
            if (estSeconds >= 3600) {
                const hrs = Math.floor(estSeconds / 3600);
                const mins = Math.floor((estSeconds % 3600) / 60);
                durationStr = `${hrs} Saat ${mins} Dakika`;
            } else if (estSeconds >= 60) {
                const mins = Math.floor(estSeconds / 60);
                durationStr = `${mins} Dakika`;
            } else {
                durationStr = `${estSeconds} Saniye`;
            }

            const bodyContent = `
                <div style="font-family: monospace; font-size: 13px; line-height: 1.6; background: rgba(0,0,0,0.25); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); color: #ccc;">
                    <div style="font-weight: bold; color: #a855f7; border-bottom: 1px dashed rgba(255,255,255,0.1); padding-bottom: 8px; margin-bottom: 10px; font-size: 14px;">Analiz Tamamlandı</div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px;"><span>Toplam Mesaj :</span> <strong style="color:#ffffff;">${totalMessages}</strong></div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#f87171;"><span>Silinecek :</span> <strong>${deleteCount}</strong></div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#4ade80;"><span>Korunan :</span> <strong>${protectCount}</strong></div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#fbbf24;"><span>Medya Dosyası :</span> <strong>${mediaCount}</strong></div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px;"><span>Etkilenen Kanal :</span> <strong style="color:#ffffff;">${targetChannelIds.length}</strong></div>
                    <div style="display:flex; justify-content:space-between; margin-top:10px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 8px; font-weight:bold; color:#60a5fa;"><span>Tahmini Süre :</span> <strong>${durationStr}</strong></div>
                </div>
            `;

            const result = await new Promise(resolve => {
                this.modal.show(
                    "Önizleme Analizi",
                    "",
                    [
                        {
                            text: this.i18n("modalCancel"),
                            primary: false,
                            onClick: () => {
                                this.isDeleting = false;
                                this.panel.style.display = "block";
                                resolve(false);
                            }
                        },
                        {
                            text: "İşleme Başla",
                            primary: true,
                            onClick: () => {
                                resolve(true);
                            }
                        }
                    ],
                    { icon: "info" }
                );

                // Overwrite the modal body with our custom template directly to support HTML structure nicely
                const bodyContainer = this.modal.overlay?.querySelector(".kyo-modal-body");
                if (bodyContainer) {
                    bodyContainer.innerHTML = bodyContent;
                }
            });

            return result;

        } catch (err) {
            this.hideProgressBar();
            this.isDeleting = false;
            this.panel.style.display = "block";
            await this.modal.alert("Hata", "Analiz sırasında bir hata oluştu.", { icon: "error" });
            return false;
        }
    }

    updateRegexPreview() {
        const q = this.getQueryBuilderOptions();
        const parts = [];
        if (q.images) parts.push("image\\/.*");
        if (q.videos) parts.push("video\\/.*");
        if (q.gifs) parts.push(".*\\.gif");
        if (q.audio) parts.push("audio\\/.*");
        if (q.zip) parts.push(".*\\.(zip|rar|7z)");
        if (q.links) parts.push("https?:\\/\\/.*");
        if (q.embeds) parts.push("<embed>");
        if (q.short) parts.push("^.{1,9}$");
        if (q.long) parts.push("^.{101,}$");
        if (q.empty) parts.push("^$");
        if (q.emojis) parts.push("[\\p{Emoji}]");
        if (q.mentions) parts.push("(<@\\d+>|@everyone)");
        
        const previewEl = this.panel?.querySelector("#q-builder-regex-preview");
        if (previewEl) {
            if (parts.length > 0) {
                previewEl.textContent = `Regex: /${parts.join("|")}/i`;
            } else {
                previewEl.textContent = "Regex: .*";
            }
        }
    }

    getQueryBuilderOptions() {
        if (!this.panel) return {};
        return {
            images: this.panel.querySelector("#q-filter-images")?.checked ?? false,
            videos: this.panel.querySelector("#q-filter-videos")?.checked ?? false,
            gifs: this.panel.querySelector("#q-filter-gifs")?.checked ?? false,
            audio: this.panel.querySelector("#q-filter-audio")?.checked ?? false,
            zip: this.panel.querySelector("#q-filter-zip")?.checked ?? false,
            links: this.panel.querySelector("#q-filter-links")?.checked ?? false,
            embeds: this.panel.querySelector("#q-filter-embeds")?.checked ?? false,
            short: this.panel.querySelector("#q-filter-short")?.checked ?? false,
            long: this.panel.querySelector("#q-filter-long")?.checked ?? false,
            empty: this.panel.querySelector("#q-filter-empty")?.checked ?? false,
            emojis: this.panel.querySelector("#q-filter-emojis")?.checked ?? false,
            mentions: this.panel.querySelector("#q-filter-mentions")?.checked ?? false
        };
    }

    startDebugStatsLoop() {
        const queueEl = this.panel?.querySelector("#debug-queue");
        const threadsEl = this.panel?.querySelector("#debug-threads");

        this.debugStatsInterval = setInterval(() => {
            if (!this.panel) {
                if (this.debugStatsInterval) {
                    clearInterval(this.debugStatsInterval);
                    this.debugStatsInterval = null;
                }
                return;
            }
            if (queueEl) queueEl.textContent = this.isDeleting ? "1" : "0";
            if (threadsEl) threadsEl.textContent = this.isDeleting ? "2" : "1";
        }, 1000);
    }

    updateLiveConsole(method, url, status, latencyMs) {
        const consoleEl = this.panel?.querySelector("#kyo-live-api-console");
        if (!consoleEl) return;
        
        const line = document.createElement("div");
        line.style.borderBottom = "1px solid rgba(255,255,255,0.03)";
        line.style.padding = "2px 0";
        line.style.display = "flex";
        line.style.justifyContent = "space-between";
        line.style.fontFamily = "monospace";
        line.style.fontSize = "10px";
        
        let statusColor = "#4ade80";
        if (status >= 400) statusColor = "#f87171";
        else if (status === 429) statusColor = "#fbbf24";
        
        const cleanUrl = url.split("?")[0].replace("https://discord.com/api/v9", "");
        
        line.innerHTML = `
            <div>
                <span style="color: #c084fc; font-weight: bold;">[${method}]</span>
                <span style="color: #ccc; margin-left: 4px;">${cleanUrl}</span>
            </div>
            <div>
                <span style="color: ${statusColor}; font-weight: bold; margin-right: 6px;">${status}</span>
                <span style="color: #666;">${latencyMs}ms</span>
            </div>
        `;
        
        consoleEl.appendChild(line);
        consoleEl.scrollTop = consoleEl.scrollHeight;
        
        while (consoleEl.childNodes.length > 25) {
            consoleEl.removeChild(consoleEl.firstChild);
        }

        const latencyEl = this.panel?.querySelector("#debug-latency");
        if (latencyEl) latencyEl.textContent = `${latencyMs} ms`;

        this.latencyHistory = this.latencyHistory || [];
        this.latencyHistory.push(latencyMs);
        if (this.latencyHistory.length > 30) this.latencyHistory.shift();
        this.drawLatencySparkline();
    }

    drawLatencySparkline() {
        const canvas = this.panel?.querySelector("#kyo-latency-sparkline");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        
        const history = this.latencyHistory || [];
        if (history.length < 2) return;
        
        const width = canvas.width = canvas.offsetWidth || 350;
        const height = canvas.height = canvas.offsetHeight || 40;
        
        ctx.clearRect(0, 0, width, height);
        
        const maxVal = Math.max(...history, 500); // at least 500ms scale
        const minVal = Math.min(...history, 50);
        const range = maxVal - minVal || 1;
        
        // Grid lines
        ctx.strokeStyle = "rgba(255,255,255,0.03)";
        ctx.lineWidth = 1;
        for (let y = 10; y < height; y += 10) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        // Style based on active theme
        const activeTheme = Storage.getRaw("theme") || "cyberpunk";
        let strokeColor = "#a855f7"; // purple
        let fillColor = "rgba(168, 85, 247, 0.1)";
        if (activeTheme === "discord") {
            strokeColor = "#5865f2";
            fillColor = "rgba(88, 101, 242, 0.1)";
        } else if (activeTheme === "matrix") {
            strokeColor = "#00ff00";
            fillColor = "rgba(0, 255, 0, 0.05)";
        } else if (activeTheme === "crimsonred") {
            strokeColor = "#ef4444";
            fillColor = "rgba(239, 68, 68, 0.1)";
        } else if (activeTheme === "gotham" || activeTheme === "amoled") {
            strokeColor = "#ffffff";
            fillColor = "rgba(255, 255, 255, 0.05)";
        }
        
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        
        ctx.beginPath();
        const stepX = width / (history.length - 1);
        
        history.forEach((val, i) => {
            const x = i * stepX;
            const y = height - ((val - minVal) / range) * (height - 10) - 5;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                const prevVal = history[i - 1];
                const prevX = (i - 1) * stepX;
                const prevY = height - ((prevVal - minVal) / range) * (height - 10) - 5;
                ctx.bezierCurveTo(prevX + stepX / 2, prevY, prevX + stepX / 2, y, x, y);
            }
        });
        ctx.stroke();
        
        // Fill area under Bezier curve with nice theme-based gradient
        const fillPath = new Path2D();
        history.forEach((val, i) => {
            const x = i * stepX;
            const y = height - ((val - minVal) / range) * (height - 10) - 5;
            if (i === 0) {
                fillPath.moveTo(x, y);
            } else {
                const prevVal = history[i - 1];
                const prevX = (i - 1) * stepX;
                const prevY = height - ((prevVal - minVal) / range) * (height - 10) - 5;
                fillPath.bezierCurveTo(prevX + stepX / 2, prevY, prevX + stepX / 2, y, x, y);
            }
        });
        fillPath.lineTo((history.length - 1) * stepX, height);
        fillPath.lineTo(0, height);
        fillPath.closePath();
        
        const fillGrad = ctx.createLinearGradient(0, 0, 0, height);
        // Fade from colored to completely transparent
        fillGrad.addColorStop(0, strokeColor.replace(")", ", 0.25)").replace("rgb", "rgba"));
        fillGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
        
        ctx.fillStyle = fillGrad;
        ctx.fill(fillPath);
    }

    drawAchievementsRing() {
        const canvas = this.panel?.querySelector("#kyo-circular-progress");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        
        const unlockedCount = this.panel.querySelectorAll(".kyo-achievement-card.unlocked").length;
        const totalCount = 18;
        const pct = Math.min(1.0, unlockedCount / totalCount);
        
        const width = canvas.width = 70;
        const height = canvas.height = 70;
        ctx.clearRect(0, 0, width, height);
        
        ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(35, 35, 28, 0, Math.PI * 2);
        ctx.stroke();
        
        const grad = ctx.createLinearGradient(0, 0, 70, 70);
        grad.addColorStop(0, "#7f00ff");
        grad.addColorStop(1, "#ff007f");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(35, 35, 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
        ctx.stroke();
        
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${unlockedCount}/${totalCount}`, 35, 30);
        
        ctx.fillStyle = "#888888";
        ctx.font = "bold 8px sans-serif";
        ctx.fillText("BAŞARIM", 35, 43);
    }

    escapeHtml(str) {
        if (!str) return "";
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    generateHtmlBackup(channelId, channelName, messages) {
        const escapedChannel = this.escapeHtml(channelName);
        const rows = messages.map(msg => {
            const time = new Date(msg.timestamp).toLocaleString();
            const authorName = msg.author ? (msg.author.global_name || msg.author.username) : "Sen";
            const avatarChar = authorName.charAt(0).toUpperCase();
            
            let attachmentsHtml = "";
            if (msg.attachments && msg.attachments.length > 0) {
                msg.attachments.forEach(att => {
                    const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(att.filename);
                    if (isImg) {
                        attachmentsHtml += `<div class="attachment"><img src="${att.url}" alt="${this.escapeHtml(att.filename)}" /></div>`;
                    } else {
                        attachmentsHtml += `<div class="attachment"><a href="${att.url}" target="_blank">${this.escapeHtml(att.filename)}</a></div>`;
                    }
                });
            }
            
            return `
            <div class="message-group">
                <div class="avatar">${avatarChar}</div>
                <div class="message-content">
                    <div class="message-header">
                        <span class="username">${this.escapeHtml(authorName)}</span>
                        <span class="timestamp">${time}</span>
                    </div>
                    <div class="body">${this.escapeHtml(msg.content || "")}</div>
                    ${attachmentsHtml}
                </div>
            </div>`;
        }).join("");

        return `<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <title>Discord Sohbet Yedeği - ${escapedChannel}</title>
    <style>
        body {
            background-color: #313338;
            color: #dbdee1;
            font-family: 'gg sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 20px;
        }
        .header {
            border-bottom: 1px solid #3f4147;
            padding-bottom: 15px;
            margin-bottom: 20px;
        }
        .header h1 {
            margin: 0 0 5px 0;
            font-size: 20px;
            color: #f2f3f5;
        }
        .header p {
            margin: 0;
            font-size: 14px;
            color: #949ba4;
        }
        .message-group {
            display: flex;
            margin-bottom: 16px;
            padding-left: 4px;
        }
        .avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background-color: #5865f2;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 18px;
            margin-right: 16px;
            flex-shrink: 0;
        }
        .message-content {
            display: flex;
            flex-direction: column;
        }
        .message-header {
            display: flex;
            align-items: baseline;
            margin-bottom: 4px;
        }
        .username {
            color: #f2f3f5;
            font-weight: 500;
            font-size: 16px;
            margin-right: 8px;
        }
        .timestamp {
            font-size: 12px;
            color: #949ba4;
        }
        .body {
            font-size: 15px;
            line-height: 1.375;
            white-space: pre-wrap;
            word-break: break-word;
        }
        .attachment {
            margin-top: 8px;
            background: #2b2d31;
            border: 1px solid #1e1f22;
            border-radius: 8px;
            padding: 10px;
            display: inline-block;
            max-width: 400px;
        }
        .attachment img {
            max-width: 100%;
            border-radius: 4px;
            max-height: 300px;
        }
        .attachment a {
            color: #00a8fc;
            text-decoration: none;
            font-size: 14px;
        }
        .attachment a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1># ${escapedChannel}</h1>
        <p>Discord Sohbet Yedeği | Toplam ${messages.length} mesaj yedeği</p>
    </div>
    <div class="chat-container">
        ${rows}
    </div>
</body>
</html>`;
    }

    createDeleteSession(mode, ids) {
        const sessionId = crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2);
        this.activeDeleteSession = {
            id: sessionId,
            mode: mode, // "single" | "selected" | "full"
            selectedIds: ids,
            total: ids.length,
            deleted: 0,
            failed: 0,
            rateLimits: 0,
            retries: 0,
            startedAt: Date.now(),
            finishedAt: null,
            status: "running", // idle | running | paused | completed | aborted
            timeline: []
        };
        this.logSession("info", `Temizlik oturumu başlatıldı. Mod: ${mode}, Toplam Kanal: ${ids.length}`, "start");
        this.updateDeleteSessionProgress();
    }

    logSession(level, message, event = "info", details = {}) {
        if (!this.activeDeleteSession) return;
        const logId = crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2);
        
        if (this.activeDeleteSession.timeline.length >= 1000) {
            this.activeDeleteSession.timeline.shift();
        }

        this.activeDeleteSession.timeline.push({
            id: logId,
            ts: Date.now(),
            level: level, // "info" | "warning" | "debug" | "success"
            event: event, // e.g. "delete", "start", "rate_limit", "pause", "resume", "abort", "error"
            message: message,
            channelId: details.channelId || null,
            messageId: details.messageId || null,
            extra: details.extra || {}
        });
        this.renderTimeline();
    }

    renderTimeline() {
        const feed = this.progressBarElements?.consoleFeed;
        if (!feed || !this.activeDeleteSession) return;

        const fragment = document.createDocumentFragment();
        const maxLogs = 200;
        const timelineEvents = this.activeDeleteSession.timeline;
        
        if (timelineEvents.length === 0) {
            feed.innerHTML = this.renderEmptyState("◈", "TIMELINE DECRYPTED", "Awaiting process initialization...");
            return;
        }

        const startIdx = Math.max(0, timelineEvents.length - maxLogs);
        
        const TIMELINE_META = {
            success: { icon: "✓", label: "SUCCESS", class: "kyo-log-success" },
            limit:   { icon: "⚡", label: "LIMIT", class: "kyo-log-warning" },
            warning: { icon: "⚠", label: "WARN", class: "kyo-log-warning" },
            error:   { icon: "✖", label: "ERROR", class: "kyo-log-error" },
            system:  { icon: "◈", label: "SYSTEM", class: "kyo-log-system" },
            info:    { icon: "ℹ", label: "INFO", class: "kyo-log-info" },
            debug:   { icon: "⚙", label: "DEBUG", class: "kyo-log-debug" }
        };

        for (let i = startIdx; i < timelineEvents.length; i++) {
            const ev = timelineEvents[i];
            const meta = TIMELINE_META[ev.level] || TIMELINE_META.info;
            
            const line = document.createElement("div");
            line.className = `kyo-console-line ${meta.class}`;
            
            const timeStr = new Date(ev.ts).toTimeString().split(' ')[0];
            
            let html = this.escapeHtml(ev.message);
            html = html.replace(/\b(GET)\b/g, '<span class="kyo-log-get">$1</span>');
            html = html.replace(/\b(POST)\b/g, '<span class="kyo-log-post">$1</span>');
            html = html.replace(/\b(DELETE)\b/g, '<span class="kyo-log-delete">$1</span>');
            html = html.replace(/\b(200)\b/g, '<span class="kyo-log-success">$1</span>');
            html = html.replace(/\b(429)\b/g, '<span class="kyo-log-warning">$1</span>');
            
            line.innerHTML = `
                <span class="kyo-log-time">[${timeStr}]</span>
                <span class="kyo-log-badge">[${meta.icon} ${meta.label}]</span>
                <span class="kyo-log-message">${html}</span>
            `;
            fragment.appendChild(line);
        }

        const shouldStick = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 20;
        
        feed.innerHTML = "";
        feed.appendChild(fragment);

        if (shouldStick || feed.scrollTop === 0) {
            feed.scrollTop = feed.scrollHeight;
        }
    }

    updateDeleteSessionProgress() {
        if (!this.activeDeleteSession) return;
        this.activeDeleteSession.status = this.isPaused ? "paused" : "running";
        
        // Save new active session to Storage
        Storage.set("active_delete_session", this.activeDeleteSession);
        
        // Backward-compatible sync with existing session state wrapper for resume banner
        this.saveSessionState(
            this.currentChannelSweepId || (this.activeDeleteSession.selectedIds[this.currentChannelSweepIndex || 0]),
            this.currentChannelSweepIndex || 0,
            this.activeDeleteSession.selectedIds.length,
            this.activeDeleteSession.selectedIds,
            {
                total: this.activeDeleteSession.total,
                deleted: this.activeDeleteSession.deleted,
                failed: this.activeDeleteSession.failed
            },
            this.currentSweepLimit || Infinity,
            this.currentSweepOptions || {},
            this.currentSweepAiRules || null
        );
    }

    finishDeleteSession(status = "completed") {
        if (!this.activeDeleteSession) return;
        this.activeDeleteSession.finishedAt = Date.now();
        this.activeDeleteSession.status = status;
        this.logSession(status === "completed" ? "success" : "warning", `Session finished with status: ${status}`, status);
        
        // Save to history list
        let history = Storage.get("delete_session_history") || [];
        if (!Array.isArray(history)) history = [];
        history.unshift(this.cloneForStorage(this.activeDeleteSession));
        history.splice(25);
        Storage.set("delete_session_history", history);
        
        // Clear current active session state
        Storage.remove("active_delete_session");
        this.clearSessionState();
        
        this.activeDeleteSession = null;
    }

    cloneForStorage(obj) {
        if (typeof structuredClone === "function") {
            return structuredClone(obj);
        }
        return JSON.parse(JSON.stringify(obj));
    }

    abortDeleteSession() {
        if (!this.activeDeleteSession) return;
        this.finishDeleteSession("aborted");
    }

    saveSessionState(channelId, index, totalChannels, targetChannelIds, stats, limit, advOptions, aiRules) {
        const state = {
            channelId,
            index,
            totalChannels,
            targetChannelIds,
            stats,
            limit,
            advOptions,
            aiRules,
            timestamp: Date.now()
        };
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ kyo_session_state: JSON.stringify(state) });
        } else {
            Storage.set("session_state", state);
        }
    }

    async getSessionState() {
        return new Promise(resolve => {
            if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(["kyo_session_state"], (result) => {
                    if (result.kyo_session_state) {
                        try {
                            resolve(JSON.parse(result.kyo_session_state));
                        } catch (e) {
                            resolve(null);
                        }
                    } else {
                        resolve(null);
                    }
                });
            } else {
                const saved = Storage.get("session_state");
                if (saved) {
                    resolve(saved);
                } else {
                    resolve(null);
                }
            }
        });
    }

    clearSessionState() {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
            chrome.storage.local.remove(["kyo_session_state"]);
        } else {
            Storage.remove("session_state");
        }
        const resumeContainer = this.panel?.querySelector("#kyo-resume-container");
        if (resumeContainer) resumeContainer.innerHTML = "";
    }

    async renderResumeBanner() {
        const state = await this.getSessionState();
        if (!state) return;
        
        const resumeContainer = this.panel?.querySelector("#kyo-resume-container");
        if (!resumeContainer) return;
        
        let channelName = "Bilinmeyen Kanal";
        try {
            const channels = await this.api.getDMChannels();
            const ch = channels.find(c => c.id === state.channelId);
            if (ch) {
                channelName = ch.name || ch.recipients?.map(r => r.username).join(", ") || "Grup DM";
            }
        } catch(e) {}
        
        resumeContainer.innerHTML = `
            <div class="kyo-resume-card">
                <div class="kyo-resume-title">İptal Edilen Oturum Bulundu</div>
                <div class="kyo-resume-info">Kanal: <strong>${channelName}</strong></div>
                <div class="kyo-resume-info">İlerleme: <strong>${state.index} / ${state.totalChannels}</strong> (${state.stats?.deleted || 0} silinen)</div>
                <div style="display: flex; gap: 8px; margin-top: 8px;">
                    <button class="kyo-resume-btn primary" id="kyo-session-resume-btn">Devam Et</button>
                    <button class="kyo-resume-btn secondary" id="kyo-session-dismiss-btn">Yoksay</button>
                </div>
            </div>
        `;
        
        resumeContainer.querySelector("#kyo-session-resume-btn")?.addEventListener("click", () => {
            this.sound.play("start");
            this.resumeSession(state);
        });
        
        resumeContainer.querySelector("#kyo-session-dismiss-btn")?.addEventListener("click", () => {
            this.sound.play("click");
            this.clearSessionState();
        });
    }

    async resumeSession(state) {
        this.isDeleting = true;
        this.shouldStop = false;
        this.isPaused = false;
        this.deleteStatus = state.stats || { total: 0, deleted: 0, failed: 0 };
        this.deletedLog = [];
        
        this.panel.style.display = "none";
        this.showProgressBar();
        this.clearSessionState();
        
        try {
            const channels = await this.api.getDMChannels();
            
            for (let i = state.index; i < state.targetChannelIds.length && !this.shouldStop; i++) {
                const channelId = state.targetChannelIds[i];
                const channelObj = channels.find(ch => ch.id === channelId);
                const recipientName = channelObj?.recipients?.map(r => r.username).join(", ") || "Grup DM";
                
                this.updateProgressTitle(`DM ${i + 1}/${state.targetChannelIds.length}: ${recipientName}`);
                
                window.history.pushState(null, null, "/channels/@me/" + channelId);
                window.dispatchEvent(new PopStateEvent("popstate"));
                
                await this.api.delay(1500);
                
                const limitVal = state.limit !== undefined ? state.limit : Infinity;
                const advOpts = state.advOptions || { keepPinned: true, ghostMode: true };
                const aiRulesVal = state.aiRules || null;

                this.saveSessionState(channelId, i, state.targetChannelIds.length, state.targetChannelIds, this.deleteStatus, limitVal, advOpts, aiRulesVal);
                
                if (advOpts.backupBefore) {
                    await this.backupChannelMessages(channelId, limitVal, aiRulesVal, advOpts, recipientName);
                }
                await this.sweepChannel(channelId, limitVal, aiRulesVal, recipientName, advOpts);
            }
            
            this.hideProgressBar();
            this.sound.play("success");
            this.clearSessionState();
            
            this.modal.show(
                this.i18n("modalDeletionComplete"),
                this.shouldStop ? "Oturum durduruldu. Kaldığınız yer kaydedildi." : this.i18n("modalMultiDMSuccess"),
                [
                    {
                        text: this.i18n("downloadReportBtn"),
                        primary: true,
                        onClick: () => this.downloadReport()
                    },
                    {
                        text: this.i18n("modalOk"),
                        primary: false,
                        onClick: () => {}
                    }
                ],
                {
                    icon: "success",
                    stats: {
                        deleted: this.deleteStatus.deleted,
                        failed: this.deleteStatus.failed,
                        total: this.deleteStatus.total
                    }
                }
            );
        } catch (err) {
            this.hideProgressBar();
            await this.modal.alert(this.i18n("modalError"), this.i18n("modalErrorMessage"), { icon: "error" });
        } finally {
            this.sendFinishNotification();
            this.isDeleting = false;
            this.panel.style.display = "block";
        }
    }

    triggerPanicStop() {
        if (!this.isDeleting) return;
        this.shouldStop = true;
        this.isPaused = false;
        this.unlockAchievement("ach-panic-button");
        
        this.sound.play("stealth");
        this.appendConsoleLog("[PANIC] Acil Durdurma Tetiklendi! Tüm API istekleri iptal ediliyor...", "error");
        
        const progressTitle = this.progressBar?.querySelector("#kyo-progress-title-text");
        if (progressTitle) {
            progressTitle.textContent = "ACİL DURDURULDU (Panic Mode)";
            progressTitle.style.color = "#ff3333";
        }
    }

    async checkDuplicateAttachments() {
        const currentChannelId = this.api.getCurrentChannelId();
        if (!currentChannelId) return;
        
        const listEl = this.panel?.querySelector("#kyo-duplicate-list");
        const container = this.panel?.querySelector("#kyo-duplicate-finder-section");
        if (listEl) listEl.innerHTML = "Dosyalar taranıyor...";
        
        try {
            const messages = await this.api.fetchMessagesBatch(currentChannelId, null, 100);
            const attachmentMap = new Map();
            const duplicates = [];
            
            messages.forEach(msg => {
                if (msg.attachments && msg.attachments.length > 0) {
                    msg.attachments.forEach(att => {
                        const key = `${att.filename}_${att.size}`;
                        if (attachmentMap.has(key)) {
                            duplicates.push({
                                messageId: msg.id,
                                channelId: currentChannelId,
                                filename: att.filename,
                                size: att.size,
                                url: att.url
                            });
                        } else {
                            attachmentMap.set(key, msg.id);
                        }
                    });
                }
            });
            
            if (duplicates.length > 0) {
                if (container) container.style.display = "block";
                if (listEl) {
                    listEl.innerHTML = duplicates.map(d => `
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <span>${d.filename} (${(d.size/1024).toFixed(1)} KB)</span>
                            <span style="color:#f87171;">Kopya</span>
                        </div>
                    `).join("");
                }
                this.duplicateQueue = duplicates;
            } else {
                if (listEl) listEl.innerHTML = "Kopya dosya/ek bulunamadı.";
            }
        } catch(e) {
            if (listEl) listEl.innerHTML = "Hata oluştu.";
        }
    }

    async deleteDuplicateAttachments() {
        if (!this.duplicateQueue || this.duplicateQueue.length === 0) {
            await this.modal.alert("Bilgi", "Silinecek kopya dosya bulunamadı.", { icon: "warning" });
            return;
        }
        
        const confirm = await this.modal.confirm("Kopyaları Sil", `${this.duplicateQueue.length} adet kopya dosya silinecek. Emin misiniz?`, { icon: "warning" });
        if (!confirm) return;
        
        let deleted = 0;
        for (const item of this.duplicateQueue) {
            const targetChanId = item.channelId || this.api.getCurrentChannelId();
            const success = await this.api.deleteMessage(targetChanId, item.messageId);
            if (success) deleted++;
            await this.api.delay(1200);
        }
        
        this.duplicateQueue = [];
        await this.modal.alert("Tamamlandı", `${deleted} adet kopya dosya başarıyla silindi.`, { icon: "success" });
        this.checkDuplicateAttachments();
    }

    async loadAnalyticsDashboard() {
        this.drawAchievementsRing();
        const heatmapList = this.panel?.querySelector("#kyo-heatmap-list");
        const timelineList = this.panel?.querySelector("#kyo-timeline-list");
        const wordsList = this.panel?.querySelector("#kyo-words-list");
        
        if (heatmapList) heatmapList.innerHTML = `<div class="kyo-spinner" style="width: 20px; height: 20px; margin: 10px auto;"></div>`;
        if (timelineList) timelineList.innerHTML = `<div class="kyo-spinner" style="width: 20px; height: 20px; margin: 10px auto;"></div>`;
        if (wordsList) wordsList.innerHTML = `<div class="kyo-spinner" style="width: 20px; height: 20px; margin: 10px auto;"></div>`;
        
        try {
            const currentChannelId = this.api.getCurrentChannelId();
            let realMessages = [];
            let currentDMName = "Bu Sohbet";
            
            if (currentChannelId) {
                realMessages = await this.api.fetchMessagesBatch(currentChannelId, null, 100) || [];
                const channels = await this.api.getDMChannels();
                const activeCh = channels ? channels.find(c => c.id === currentChannelId) : null;
                if (activeCh) {
                    currentDMName = activeCh.name || activeCh.recipients?.map(r => r.username).join(", ") || "Sohbet";
                }
            }
            
            const currentUserId = this.api.getCurrentUserId();
            const wordCounts = {};
            const emojiCounts = {};
            const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{1F1E0}-\u{1F1FF}]|<a?:[a-zA-Z0-9_]+:[0-9]+>/gu;
            
            realMessages.forEach(msg => {
                const content = msg.content || "";
                const emojis = content.match(emojiRegex);
                if (emojis) {
                    emojis.forEach(e => {
                        emojiCounts[e] = (emojiCounts[e] || 0) + 1;
                    });
                }
                
                const words = content.toLowerCase()
                    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"")
                    .split(/\s+/);
                
                words.forEach(w => {
                    if (w.length > 2 && !["bir", "ve", "ama", "de", "da", "için", "en", "bu", "ne", "o", "ki", "ile", "mu", "mı"].includes(w)) {
                        wordCounts[w] = (wordCounts[w] || 0) + 1;
                    }
                });
            });
            
            const sortedWords = Object.entries(wordCounts).sort((a,b) => b[1] - a[1]).slice(0, 10);
            const sortedEmojis = Object.entries(emojiCounts).sort((a,b) => b[1] - a[1]).slice(0, 5);
            
            if (wordsList) {
                wordsList.innerHTML = "";
                const mergedCloud = [...sortedEmojis, ...sortedWords].slice(0, 15);
                if (mergedCloud.length === 0) {
                    wordsList.innerHTML = `<div style="font-size:10px; color:#888;">Kelime analizi için yeterli mesaj bulunamadı.</div>`;
                } else {
                    mergedCloud.forEach(([word, count]) => {
                        const fontSize = Math.min(18, Math.max(9, 9 + count * 2));
                        const span = document.createElement("span");
                        span.style.fontSize = `${fontSize}px`;
                        span.style.fontWeight = fontSize > 12 ? "bold" : "normal";
                        span.style.color = fontSize > 14 ? "#a855f7" : (fontSize > 11 ? "#60a5fa" : "#9ca3af");
                        span.style.padding = "2px 6px";
                        span.style.background = "rgba(255,255,255,0.03)";
                        span.style.borderRadius = "4px";
                        span.style.cursor = "default";
                        span.title = `${count} kez kullanıldı`;
                        span.textContent = `${word} (${count})`;
                        wordsList.appendChild(span);
                    });
                }
            }
            
            if (heatmapList) {
                heatmapList.innerHTML = "";
                let usersData = [];
                if (realMessages.length > 0) {
                    const userCounts = {};
                    realMessages.forEach(msg => {
                        if (msg.author) {
                            const name = msg.author.global_name || msg.author.username || "Bilinmeyen Kullanıcı";
                            userCounts[name] = (userCounts[name] || 0) + 1;
                        }
                    });
                    
                    const colors = ["#a855f7", "#60a5fa", "#34d399", "#f43f5e", "#fbbf24", "#38bdf8", "#ec4899"];
                    usersData = Object.entries(userCounts).map(([name, count], index) => ({
                        name,
                        count,
                        color: colors[index % colors.length]
                    })).sort((a, b) => b.count - a.count).slice(0, 5);
                } else {
                    usersData = [
                        { name: "Veri Yok", count: 0, color: "#a855f7" }
                    ];
                }
                
                const maxVal = usersData[0].count || 1;
                
                usersData.forEach(user => {
                    const pct = Math.round((user.count / maxVal) * 100);
                    const row = document.createElement("div");
                    row.style.marginBottom = "8px";
                    row.innerHTML = `
                        <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px; color:#ccc;">
                            <span>${this.escapeHtml(user.name)}</span>
                            <strong>${user.count.toLocaleString()} mesaj</strong>
                        </div>
                        <div style="width:100%; height:8px; background:rgba(255,255,255,0.05); border-radius:4px; overflow:hidden;">
                            <div style="width:${pct}%; height:100%; background:${user.color}; border-radius:4px; transition: width 0.8s ease;"></div>
                        </div>
                    `;
                    heatmapList.appendChild(row);
                });
            }
            
            if (timelineList) {
                timelineList.innerHTML = "";
                let years = [];
                if (realMessages.length > 0) {
                    const yearCounts = {};
                    realMessages.forEach(msg => {
                        if (msg.timestamp) {
                            const year = new Date(msg.timestamp).getFullYear().toString();
                            yearCounts[year] = (yearCounts[year] || 0) + 1;
                        }
                    });
                    years = Object.entries(yearCounts).map(([year, count]) => ({
                        year,
                        count
                    })).sort((a, b) => a.year.localeCompare(b.year));
                } else {
                    years = [
                        { year: new Date().getFullYear().toString(), count: 0 }
                    ];
                }
                
                const maxYearVal = Math.max(...years.map(y => y.count)) || 1;
                
                years.forEach(y => {
                    const pct = Math.round((y.count / maxYearVal) * 100);
                    const row = document.createElement("div");
                    row.style.display = "flex";
                    row.style.alignItems = "center";
                    row.style.marginBottom = "6px";
                    row.style.fontSize = "11px";
                    row.innerHTML = `
                        <span style="width:40px; color:#888;">${y.year}</span>
                        <div style="flex-grow:1; height:12px; background:rgba(255,255,255,0.05); border-radius:3px; overflow:hidden; margin:0 8px;">
                            <div style="width:${pct}%; height:100%; background:linear-gradient(90deg, #7f00ff, #00f0ff); border-radius:3px; transition: width 1s ease;"></div>
                        </div>
                        <span style="width:50px; text-align:right; font-weight:bold; color:#ccc;">${y.count.toLocaleString()}</span>
                    `;
                    timelineList.appendChild(row);
                });
            }

            // Hour distribution chart calculation
            const hoursChart = this.panel?.querySelector("#kyo-hours-chart");
            if (hoursChart) {
                hoursChart.innerHTML = "";
                const hourCounts = new Array(24).fill(0);
                realMessages.forEach(msg => {
                    if (msg.timestamp) {
                        const hr = new Date(msg.timestamp).getHours();
                        hourCounts[hr] = (hourCounts[hr] || 0) + 1;
                    }
                });
                const maxHrVal = Math.max(...hourCounts) || 1;
                for (let h = 0; h < 24; h++) {
                    const count = hourCounts[h];
                    const pct = Math.round((count / maxHrVal) * 100);
                    
                    const barWrapper = document.createElement("div");
                    barWrapper.className = "kyo-hour-bar-wrapper";
                    barWrapper.innerHTML = `
                        <div class="kyo-hour-bar" style="height: ${pct}%;" title="${h}:00 - ${count} mesaj"></div>
                        <div class="kyo-hour-label">${h.toString().padStart(2, "0")}</div>
                    `;
                    hoursChart.appendChild(barWrapper);
                }
            }

            // Density Heatmap (7 days × 24 hours canvas)
            const heatmapCanvas = this.panel?.querySelector("#kyo-density-heatmap");
            if (heatmapCanvas) {
                const dpr = window.devicePixelRatio || 1;
                const cw = heatmapCanvas.clientWidth || 360;
                const ch = heatmapCanvas.clientHeight || 100;
                heatmapCanvas.width = cw * dpr;
                heatmapCanvas.height = ch * dpr;
                const hCtx = heatmapCanvas.getContext("2d");
                if (hCtx) {
                    hCtx.scale(dpr, dpr);
                    // Build a 7×24 matrix (day × hour)
                    const matrix = Array.from({ length: 7 }, () => new Array(24).fill(0));
                    realMessages.forEach(msg => {
                        if (msg.timestamp) {
                            const d = new Date(msg.timestamp);
                            const day = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
                            const hour = d.getHours();
                            matrix[day][hour]++;
                        }
                    });
                    const maxVal = Math.max(1, ...matrix.flat());
                    const cellW = cw / 24;
                    const cellH = ch / 7;
                    const accentColor = getComputedStyle(this.panel).getPropertyValue("--kyo-accent").trim() || "#7f00ff";
                    
                    for (let day = 0; day < 7; day++) {
                        for (let hour = 0; hour < 24; hour++) {
                            const intensity = matrix[day][hour] / maxVal;
                            const alpha = Math.max(0.04, intensity);
                            hCtx.fillStyle = intensity > 0 ? this.hexToRgba(accentColor, alpha) : "rgba(255,255,255,0.02)";
                            hCtx.fillRect(hour * cellW + 1, day * cellH + 1, cellW - 2, cellH - 2);
                            // Round corners effect via arcs for non-zero cells
                            if (intensity > 0.3) {
                                hCtx.fillStyle = this.hexToRgba(accentColor, intensity * 0.3);
                                hCtx.shadowColor = accentColor;
                                hCtx.shadowBlur = 4;
                                hCtx.fillRect(hour * cellW + 2, day * cellH + 2, cellW - 4, cellH - 4);
                                hCtx.shadowBlur = 0;
                            }
                        }
                    }
                }
            }

            // Sentiment heuristic calculation
            let positiveScore = 0;
            let energeticScore = 0;
            let inquisitiveScore = 0;
            let seriousScore = 0;

            const positiveWords = ["harika", "süper", "iyi", "lol", "xd", "helal", "güzel", "tebrik", "eline", "sağlık", "haha", "teşekkür", "sağol"];
            const energeticWords = ["hadi", "gel", "koş", "girelim", "oyun", "dc", "gir", "asdf", "kral", "reiz", "efsane"];
            const inquisitiveWords = ["neden", "niye", "nasıl", "kim", "nerde", "ne zaman", "kaç", "mu", "mi", "mı", "mü"];
            
            realMessages.forEach(msg => {
                const text = (msg.content || "").toLowerCase();
                if (/[?❓🤔🧐]/.test(text)) inquisitiveScore += 2;
                if (/[😂👍❤️😊🎉]/gu.test(text)) positiveScore += 2;
                if (/[🔥🚀⚡🎮👾]/gu.test(text)) energeticScore += 2;
                
                positiveWords.forEach(w => { if (text.includes(w)) positiveScore++; });
                energeticWords.forEach(w => { if (text.includes(w)) energeticScore++; });
                inquisitiveWords.forEach(w => { if (text.includes(w)) inquisitiveScore++; });
            });

            seriousScore = Math.max(1, realMessages.length * 0.1); 

            let sentimentType = "serious";
            let sentimentLabel = "Ciddi 📝";
            
            const maxScore = Math.max(positiveScore, energeticScore, inquisitiveScore, seriousScore);
            if (maxScore === positiveScore && positiveScore > 0) {
                sentimentType = "positive";
                sentimentLabel = "Pozitif / Sıcak 😊";
            } else if (maxScore === energeticScore && energeticScore > 0) {
                sentimentType = "energetic";
                sentimentLabel = "Enerjik / Hızlı ⚡";
            } else if (maxScore === inquisitiveScore && inquisitiveScore > 0) {
                sentimentType = "inquisitive";
                sentimentLabel = "Meraklı / Soru Dolu 🤔";
            }
            
            const sentimentBadge = this.panel?.querySelector("#dash-sentiment");
            if (sentimentBadge) {
                sentimentBadge.className = `kyo-sentiment-badge ${sentimentType}`;
                sentimentBadge.textContent = sentimentLabel;
            }

            this.cachedAnalyticsMessages = realMessages;

            const activeDMs = await this.api.getDMChannels();
            const relationships = await this.api.getRelationshipDMChannels();
            
            const dashDMs = this.panel?.querySelector("#dash-dms");
            const dashMessages = this.panel?.querySelector("#dash-messages");
            const dashHidden = this.panel?.querySelector("#dash-hidden");
            const dashRuntime = this.panel?.querySelector("#dash-runtime");
            
            if (dashDMs) dashDMs.textContent = activeDMs.length.toString();
            if (dashHidden) {
                const activeRecipientIds = new Set();
                activeDMs.forEach(ch => {
                    if (ch.type === 1 && ch.recipients) {
                        ch.recipients.forEach(r => activeRecipientIds.add(r.id));
                    }
                });
                const hiddenCount = relationships.filter(rel => rel.user && !activeRecipientIds.has(rel.id)).length;
                dashHidden.textContent = hiddenCount.toString();
            }
            
            const stats = await this.loadLifetimeStats();
            if (dashMessages) {
                dashMessages.textContent = (stats.deleted + realMessages.length).toLocaleString();
            }
            
            if (dashRuntime) {
                const hours = Math.round(92 + (stats.deleted / 500));
                dashRuntime.textContent = `${hours} saat`;
            }
            
            this.checkAndUnlockAchievements(stats.deleted);
            
        } catch (e) {
            console.error("Error loading analytics:", e);
        }
    }

    checkAndUnlockAchievements(deletedCount) {
        try {
            const persisted = Storage.get("unlocked_achievements") || [];
            persisted.forEach(id => {
                const card = this.panel?.querySelector(`#${id}`);
                if (card && !card.classList.contains("unlocked")) {
                    card.classList.add("unlocked");
                }
            });
        } catch (e) {
            console.error("Error loading persisted achievements:", e);
        }

        if (deletedCount > 0) {
            this.unlockAchievement("ach-first-cleanup");
        }
        if (deletedCount >= 1000) {
            this.unlockAchievement("ach-mass-cleaner");
        }
        if (deletedCount >= 10000) {
            this.unlockAchievement("ach-digital-ghost");
        }

        // Night Owl: Deletion between 00:00 and 05:00
        const hrs = new Date().getHours();
        if (deletedCount > 0 && hrs >= 0 && hrs < 5) {
            this.unlockAchievement("ach-night-owl");
        }

        // Speed Demon: Delay Ms <= 500
        if (this.currentSweepOptions && this.currentSweepOptions.delayMs <= 500) {
            this.unlockAchievement("ach-speed-demon");
        }

        // Backup Master
        if (Storage.getRaw("backup_master_triggered") === "true") {
            this.unlockAchievement("ach-backup-master");
        }

        // Multi Sweep
        if (this.currentSweepChannelsCount >= 5) {
            this.unlockAchievement("ach-multi-sweep");
        }

        // Ghost Protocol
        const ghostCount = parseInt(Storage.getRaw("ghost_deleted_count") || "0", 10);
        if (ghostCount >= 500) {
            this.unlockAchievement("ach-ghost-protocol");
        }

        // Filter Master
        if (this.currentSweepOptions && this.currentSweepOptions.queryBuilder) {
            const q = this.currentSweepOptions.queryBuilder;
            const hasFilter = Object.values(q).some(val => val === true);
            if (hasFilter) {
                this.unlockAchievement("ach-filter-master");
            }
        }

        // Completionist: All other 17 achievements unlocked
        if (this.panel) {
            const unlockedCardsCount = this.panel.querySelectorAll(".kyo-achievement-card.unlocked:not(#ach-completionist)").length;
            if (unlockedCardsCount === 17) {
                this.unlockAchievement("ach-completionist");
            }
        }
        this.drawAchievementsRing();
    }

    unlockAchievement(id) {
        const card = this.panel?.querySelector(`#${id}`);
        if (card && !card.classList.contains("unlocked")) {
            card.classList.add("unlocked");
            this.drawAchievementsRing();
            this.sound.play("success");
            const name = card.querySelector(".kyo-achievement-name")?.textContent || "Başarım";
            const desc = card.querySelector(".kyo-achievement-desc")?.textContent || "";
            this.appendConsoleLog(`[BAŞARIM] Tebrikler! "${name}" başarımı açıldı!`, "success");
            this.showAchievementToast(name, desc);

            // Persist the unlocked achievement
            try {
                let unlocked = Storage.get("unlocked_achievements") || [];
                if (!unlocked.includes(id)) {
                    unlocked.push(id);
                    Storage.set("unlocked_achievements", unlocked);
                }
            } catch (e) {
                console.error("Error saving persisted achievements:", e);
            }

            // Check completionist if this wasn't completionist itself
            if (id !== "ach-completionist" && this.panel) {
                const unlockedCardsCount = this.panel.querySelectorAll(".kyo-achievement-card.unlocked:not(#ach-completionist)").length;
                if (unlockedCardsCount === 17) {
                    this.unlockAchievement("ach-completionist");
                }
            }
        }
    }

    showAchievementToast(name, desc) {
        const toast = document.createElement("div");
        toast.className = "kyo-achievement-toast";
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(13, 14, 21, 0.95);
            border: 2px solid #eab308;
            box-shadow: 0 0 20px rgba(234, 179, 8, 0.4);
            border-radius: 12px;
            padding: 14px 18px;
            display: flex;
            align-items: center;
            gap: 14px;
            z-index: 1000000;
            font-family: sans-serif;
            color: white;
            transform: translateX(120%);
            transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            backdrop-filter: blur(8px);
        `;
        toast.innerHTML = `
            <div style="font-size: 28px;">🏆</div>
            <div>
                <div style="font-size: 10px; color: #eab308; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px;">Başarım Açıldı!</div>
                <div style="font-size: 13px; font-weight: bold; color: #fff; margin-bottom: 1px;">${this.escapeHtml(name)}</div>
                <div style="font-size: 11px; color: #aaa;">${this.escapeHtml(desc)}</div>
            </div>
        `;
        document.body.appendChild(toast);
        
        // Trigger slide-in
        setTimeout(() => {
            toast.style.transform = "translateX(0)";
        }, 100);
        
        // Slide out and remove
        setTimeout(() => {
            toast.style.transform = "translateX(120%)";
            setTimeout(() => {
                toast.remove();
            }, 500);
        }, 4000);
    }

    async exportActivityReport() {
        const stats = await this.loadLifetimeStats();
        const activeDMs = await this.api.getDMChannels();
        let username = "Discord Kullanıcısı";
        try {
            const user = await this.api.getCurrentUser();
            if (user) username = user.username;
        } catch(e) {}

        const messages = this.cachedAnalyticsMessages || [];

        // Hour distribution
        const hourCounts = new Array(24).fill(0);
        messages.forEach(msg => {
            if (msg.timestamp) {
                const hr = new Date(msg.timestamp).getHours();
                hourCounts[hr]++;
            }
        });
        const maxHourVal = Math.max(...hourCounts) || 1;

        // Word cloud data
        const wordCounts = {};
        const emojiCounts = {};
        const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{1F1E0}-\u{1F1FF}]|<a?:[a-zA-Z0-9_]+:[0-9]+>/gu;
        messages.forEach(msg => {
            const content = msg.content || "";
            const emojis = content.match(emojiRegex);
            if (emojis) {
                emojis.forEach(e => {
                    emojiCounts[e] = (emojiCounts[e] || 0) + 1;
                });
            }
            const words = content.toLowerCase()
                .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"")
                .split(/\s+/);
            words.forEach(w => {
                if (w.length > 2 && !["bir", "ve", "ama", "de", "da", "için", "en", "bu", "ne", "o", "ki", "ile", "mu", "mı"].includes(w)) {
                    wordCounts[w] = (wordCounts[w] || 0) + 1;
                }
            });
        });
        const topWords = Object.entries(wordCounts).sort((a,b) => b[1] - a[1]).slice(0, 10);
        const topEmojis = Object.entries(emojiCounts).sort((a,b) => b[1] - a[1]).slice(0, 5);
        const wordCloud = [...topEmojis, ...topWords].slice(0, 15);

        // Top conversations
        const channelCounts = {};
        messages.forEach(msg => {
            if (msg.author) {
                const name = msg.author.global_name || msg.author.username || "Bilinmeyen Kullanıcı";
                channelCounts[name] = (channelCounts[name] || 0) + 1;
            }
        });
        const topPeople = Object.entries(channelCounts).sort((a,b) => b[1] - a[1]).slice(0, 5);

        // Sentiment heuristic
        let positiveScore = 0;
        let energeticScore = 0;
        let inquisitiveScore = 0;
        messages.forEach(msg => {
            const text = (msg.content || "").toLowerCase();
            if (/[?❓🤔🧐]/.test(text)) inquisitiveScore += 2;
            if (/[😂👍❤️😊🎉]/.test(text)) positiveScore += 2;
            if (/[🔥🚀⚡🎮👾]/.test(text)) energeticScore += 2;
        });
        const maxScore = Math.max(positiveScore, energeticScore, inquisitiveScore, messages.length * 0.1);
        let sentimentType = "serious";
        let sentimentLabel = "Ciddi 📝";
        if (maxScore === positiveScore && positiveScore > 0) {
            sentimentType = "positive";
            sentimentLabel = "Pozitif 😊";
        } else if (maxScore === energeticScore && energeticScore > 0) {
            sentimentType = "energetic";
            sentimentLabel = "Enerjik ⚡";
        } else if (maxScore === inquisitiveScore && inquisitiveScore > 0) {
            sentimentType = "inquisitive";
            sentimentLabel = "Meraklı 🤔";
        }

        const unlocked = Storage.get("unlocked_achievements") || [];

        // Achievements DB
        const allAchievements = [
            { id: "ach-first-cleanup", name: "İlk Adım", desc: "İlk mesaj silindi.", icon: "🏅" },
            { id: "ach-mass-cleaner", name: "Kitle İmha", desc: "1,000+ mesaj silindi.", icon: "⚡" },
            { id: "ach-digital-ghost", name: "Dijital Hayalet", desc: "10,000+ mesaj silindi.", icon: "👻" },
            { id: "ach-investigator", name: "Araştırmacı", desc: "Gizli DM açıldı.", icon: "🔍" },
            { id: "ach-archivist", name: "Arşivci", desc: "HTML + JSON yedeği alındı.", icon: "📚" },
            { id: "ach-shop-supporter", name: "Kaptan Destekçisi", desc: "Kaptanbey0 mağazasından destek oldun.", icon: "👑" }
        ];

        const achievementsListHTML = allAchievements.map(ach => {
            const isUnlocked = unlocked.includes(ach.id) || (ach.id === "ach-first-cleanup" && stats.deleted > 0) || (ach.id === "ach-mass-cleaner" && stats.deleted >= 1000) || (ach.id === "ach-digital-ghost" && stats.deleted >= 10000);
            return `
                <div class="ach-card ${isUnlocked ? 'unlocked' : 'locked'}">
                    <div class="ach-icon">${ach.icon}</div>
                    <div class="ach-details">
                        <div class="ach-name">${ach.name}</div>
                        <div class="ach-desc">${ach.desc}</div>
                    </div>
                </div>
            `;
        }).join("");

        const topPeopleHTML = topPeople.length > 0 ? topPeople.map(([name, count]) => {
            const maxVal = topPeople[0][1] || 1;
            const pct = Math.round((count / maxVal) * 100);
            return `
                <div class="person-row">
                    <div class="person-info">
                        <span>${name}</span>
                        <strong>${count} mesaj</strong>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${pct}%;"></div>
                    </div>
                </div>
            `;
        }).join("") : `<div class="empty-text">Veri Yok</div>`;

        const hourBarsHTML = hourCounts.map((count, hr) => {
            const pct = Math.round((count / maxHourVal) * 100);
            return `
                <div class="hour-bar-wrapper" title="${hr}:00 - ${count} mesaj">
                    <div class="hour-bar" style="height: ${pct}%;"></div>
                    <div class="hour-label">${hr.toString().padStart(2, "0")}</div>
                </div>
            `;
        }).join("");

        const wordCloudHTML = wordCloud.length > 0 ? wordCloud.map(([word, count]) => {
            const fontSize = Math.min(22, Math.max(10, 10 + count * 2));
            return `<span class="cloud-word" style="font-size: ${fontSize}px;" title="${count} kez">${word}</span>`;
        }).join("") : `<div class="empty-text">Veri Yok</div>`;

        const htmlReport = `<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kaptan Cleaner - Discord Aktivite Raporu</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=Space+Grotesk:wght@400;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #0d0e15;
            --card-bg: rgba(20, 21, 33, 0.85);
            --accent: #7f00ff;
            --accent-glow: rgba(127, 0, 255, 0.4);
            --text: #ffffff;
            --border: rgba(255, 255, 255, 0.08);
        }
        body.theme-amoledgold {
            --bg: #000000;
            --card-bg: rgba(0, 0, 0, 0.95);
            --accent: #d4af37;
            --accent-glow: rgba(212, 175, 55, 0.45);
            --text: #ffdf00;
            --border: #d4af37;
        }
        body.theme-cyberpunk {
            --bg: #0f0f14;
            --card-bg: rgba(15, 15, 20, 0.9);
            --accent: #fcee0a;
            --accent-glow: rgba(254, 85, 153, 0.5);
            --text: #39ff14;
            --border: #fcee0a;
        }
        body.theme-discord {
            --bg: #2f3136;
            --card-bg: rgba(47, 49, 54, 0.95);
            --accent: #5865F2;
            --accent-glow: rgba(88, 101, 242, 0.35);
            --text: #ffffff;
            --border: rgba(255, 255, 255, 0.08);
        }
        body.theme-neonpurple {
            --bg: #140a23;
            --card-bg: rgba(20, 10, 35, 0.95);
            --accent: #bb86fc;
            --accent-glow: rgba(187, 134, 252, 0.4);
            --text: #03dac6;
            --border: #bb86fc;
        }
        body {
            background: var(--bg);
            color: var(--text);
            font-family: 'Outfit', sans-serif;
            margin: 0;
            padding: 40px 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            min-height: 100vh;
            transition: all 0.4s ease;
        }
        .theme-switcher {
            display: flex;
            gap: 10px;
            margin-bottom: 25px;
            background: rgba(255, 255, 255, 0.03);
            padding: 6px;
            border-radius: 30px;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .theme-btn {
            background: transparent;
            border: none;
            color: #888;
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .theme-btn.active, .theme-btn:hover {
            background: var(--accent);
            color: #000;
            box-shadow: 0 0 10px var(--accent-glow);
        }
        .card {
            background: var(--card-bg);
            border: 2px solid var(--border);
            box-shadow: 0 0 30px var(--accent-glow), 0 15px 40px rgba(0, 0, 0, 0.8);
            border-radius: 16px;
            width: 100%;
            max-width: 600px;
            padding: 30px;
            position: relative;
            overflow: hidden;
            backdrop-filter: blur(15px);
        }
        h1 {
            text-align: center;
            font-size: 26px;
            font-family: 'Space Grotesk', sans-serif;
            font-weight: 700;
            color: var(--text);
            text-shadow: 0 0 15px var(--accent-glow);
            margin: 0 0 25px 0;
            text-transform: uppercase;
            letter-spacing: 2px;
        }
        .user-profile {
            display: flex;
            align-items: center;
            gap: 15px;
            border-bottom: 1px solid rgba(255,255,255,0.08);
            padding-bottom: 20px;
            margin-bottom: 25px;
        }
        .avatar-placeholder {
            width: 50px;
            height: 50px;
            background: var(--accent);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 22px;
            color: #000;
        }
        .username {
            font-size: 18px;
            font-weight: 800;
            font-family: 'Space Grotesk', sans-serif;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin-bottom: 25px;
        }
        .stat-box {
            background: rgba(255,255,255,0.015);
            border: 1px solid rgba(255,255,255,0.04);
            border-radius: 10px;
            padding: 15px;
            text-align: center;
        }
        .stat-value {
            font-size: 24px;
            font-weight: bold;
            color: var(--text);
            text-shadow: 0 0 10px var(--accent-glow);
        }
        .stat-label {
            font-size: 10px;
            color: #888;
            margin-top: 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .section-title {
            font-size: 13px;
            font-weight: 800;
            color: var(--text);
            margin-top: 25px;
            margin-bottom: 12px;
            border-left: 3px solid var(--accent);
            padding-left: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .chart-container {
            background: rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.04);
            border-radius: 8px;
            padding: 12px;
        }
        .hours-chart {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            height: 70px;
        }
        .hour-bar-wrapper {
            display: flex;
            flex-direction: column;
            align-items: center;
            flex: 1;
            height: 100%;
            justify-content: flex-end;
        }
        .hour-bar {
            width: 65%;
            background: var(--accent);
            border-radius: 2px 2px 0 0;
            min-height: 2px;
            transition: all 0.3s ease;
        }
        .hour-bar:hover {
            filter: brightness(1.3);
            box-shadow: 0 0 8px var(--accent-glow);
        }
        .hour-label {
            font-size: 8px;
            color: #666;
            margin-top: 4px;
        }
        .word-cloud {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            justify-content: center;
            padding: 10px 0;
        }
        .cloud-word {
            padding: 3px 8px;
            background: rgba(255,255,255,0.03);
            border-radius: 4px;
            color: #aaa;
            transition: all 0.2s ease;
            cursor: default;
        }
        .cloud-word:hover {
            color: var(--text);
            background: rgba(255, 255, 255, 0.08);
            transform: scale(1.05);
        }
        .person-row {
            margin-bottom: 10px;
        }
        .person-info {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            margin-bottom: 3px;
            color: #ccc;
        }
        .progress-bar {
            width: 100%;
            height: 6px;
            background: rgba(255, 255, 255, 0.04);
            border-radius: 3px;
            overflow: hidden;
        }
        .progress-fill {
            height: 100%;
            background: var(--accent);
            border-radius: 3px;
        }
        .achievements-list {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
        }
        .ach-card {
            background: rgba(255,255,255,0.015);
            border: 1px solid rgba(255,255,255,0.04);
            border-radius: 8px;
            padding: 10px;
            display: flex;
            align-items: center;
            gap: 10px;
            transition: all 0.3s ease;
        }
        .ach-card.unlocked {
            border-color: var(--accent);
            background: rgba(127, 0, 255, 0.03);
            box-shadow: inset 0 0 10px rgba(127, 0, 255, 0.05);
        }
        body.theme-amoledgold .ach-card.unlocked {
            background: rgba(212, 175, 55, 0.03);
            box-shadow: inset 0 0 10px rgba(212, 175, 55, 0.05);
        }
        .ach-card.locked {
            opacity: 0.35;
        }
        .ach-icon {
            font-size: 20px;
        }
        .ach-name {
            font-size: 11px;
            font-weight: bold;
        }
        .ach-desc {
            font-size: 9px;
            color: #888;
            margin-top: 1px;
        }
        .footer {
            text-align: center;
            margin-top: 35px;
            font-size: 11px;
            color: #555;
        }
        .action-bar {
            display: flex;
            justify-content: center;
            margin-top: 25px;
        }
        .print-btn {
            background: var(--accent);
            color: #000;
            border: none;
            padding: 8px 18px;
            border-radius: 8px;
            font-weight: bold;
            font-size: 12px;
            cursor: pointer;
            box-shadow: 0 4px 15px var(--accent-glow);
            transition: all 0.2s ease;
        }
        .print-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px var(--accent-glow);
        }
        .empty-text {
            font-size: 11px;
            color: #666;
            text-align: center;
            padding: 8px 0;
        }
    </style>
</head>
<body class="theme-amoledgold">
    <div class="theme-switcher">
        <button class="theme-btn" id="btn-discord" onclick="setTheme('discord')">Discord</button>
        <button class="theme-btn" id="btn-cyberpunk" onclick="setTheme('cyberpunk')">Cyberpunk</button>
        <button class="theme-btn active" id="btn-amoledgold" onclick="setTheme('amoledgold')">AMOLED Gold</button>
        <button class="theme-btn" id="btn-neonpurple" onclick="setTheme('neonpurple')">Neon Purple</button>
    </div>

    <div class="card">
        <h1>Kaptan Cleaner Raporu</h1>
        <div class="user-profile">
            <div class="avatar-placeholder">⚓</div>
            <div>
                <div class="username">@${this.escapeHtml(username)}</div>
                <div style="font-size: 11px; color: #888;">Sohbet Havası: <strong style="color:var(--text); text-shadow:0 0 5px var(--accent-glow);">${sentimentLabel}</strong></div>
            </div>
        </div>

        <div class="stats-grid">
            <div class="stat-box">
                <div class="stat-value">${stats.deleted.toLocaleString()}</div>
                <div class="stat-label">Silinen Mesaj</div>
            </div>
            <div class="stat-box">
                <div class="stat-value">${activeDMs.length}</div>
                <div class="stat-label">Aktif Konuşmalar</div>
            </div>
            <div class="stat-box">
                <div class="stat-value">${(stats.bytes/(1024*1024)).toFixed(1)} MB</div>
                <div class="stat-label">Disk Alanı</div>
            </div>
            <div class="stat-box">
                <div class="stat-value">V4.0.0</div>
                <div class="stat-label">Sürüm</div>
            </div>
        </div>

        <div class="section-title">En Çok Konuştuğun Kişiler</div>
        <div class="chart-container">
            ${topPeopleHTML}
        </div>

        <div class="section-title">Saatlik Aktiflik Dağılımı</div>
        <div class="chart-container">
            <div class="hours-chart">
                ${hourBarsHTML}
            </div>
        </div>

        <div class="section-title">En Çok Kullandığın Kelimeler</div>
        <div class="chart-container">
            <div class="word-cloud">
                ${wordCloudHTML}
            </div>
        </div>

        <div class="section-title">Başarımlar</div>
        <div class="achievements-list">
            ${achievementsListHTML}
        </div>

        <div class="action-bar">
            <button class="print-btn" onclick="synth.playSuccess(); window.print();">Raporu Yazdır / Kaydet</button>
        </div>

        <div class="footer">
            Kaptan DM Cleaner &copy; ${new Date().getFullYear()}
        </div>
    </div>

    <script>
        class ReportSynth {
            constructor() {
                this.ctx = null;
            }
            init() {
                if (!this.ctx) {
                    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
                }
            }
            playClick() {
                this.init();
                if (!this.ctx) return;
                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.type = "sine";
                osc.frequency.setValueAtTime(800, now);
                gain.gain.setValueAtTime(0.04, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
                osc.start(now);
                osc.stop(now + 0.04);
            }
            playSuccess() {
                this.init();
                if (!this.ctx) return;
                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.type = "triangle";
                osc.frequency.setValueAtTime(523.25, now);
                osc.frequency.setValueAtTime(659.25, now + 0.1);
                osc.frequency.setValueAtTime(783.99, now + 0.2);
                gain.gain.setValueAtTime(0.06, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
                osc.start(now);
                osc.stop(now + 0.45);
            }
        }
        const synth = new ReportSynth();

        function setTheme(theme) {
            synth.playClick();
            document.body.className = 'theme-' + theme;
            document.querySelectorAll('.theme-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            document.getElementById('btn-' + theme).classList.add('active');
        }
    </script>
</body>
</html>`;
        
        const blob = new Blob([htmlReport], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `kaptan_activity_report_${username}.html`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

async function runExtension() {
    const api = new DiscordAPI();
    let panel = null;

    const shouldInject = () => api.isDMsSection() || api.isGuildChannel();

    if (shouldInject()) {
        panel = new DeletePanel(api);
        panel.inject();
    }

    // Wait until document finishes loading
    await new Promise(resolve => {
        if (document.readyState === "complete") {
            resolve(null);
        } else {
            window.addEventListener("load", () => resolve(null), { once: true });
        }
    });

    // Detect webpackChunk
    let webpackLoaded = false;
    let attempts = 0;
    while (!webpackLoaded && attempts < 50) {
        if (window.webpackChunkdiscord_app) {
            webpackLoaded = true;
            break;
        }
        await new Promise(r => setTimeout(r, 100));
        attempts++;
    }

    // Small artificial delay for premium loading experience
    await new Promise(r => setTimeout(r, 1200));

    if (panel) panel.updateLoadingStep(`${chrome.i18n.getMessage("stepVerifyingToken")}`);

    const token = await api.getTokenFromDiscord();
    if (!token) {
        panel?.showAuthError();
        return;
    }
    api.token = token;

    if (panel) panel.updateLoadingStep(`${chrome.i18n.getMessage("stepListingChats")}`);
    const user = await api.getCurrentUser();
    if (!user) {
        panel?.showAuthError();
        return;
    }
    api.currentUserId = user.id;

    if (panel) panel.updateLoadingStep(`${chrome.i18n.getMessage("stepSettingUpAI")}`);
    await api.delay(800);

    if (panel) panel.updateLoadingStep(`${chrome.i18n.getMessage("stepKaptanReady")}`);
    await api.delay(600);

    panel?.showAuthenticated();

    // Monitor url changes since Discord uses PopState routing
    let lastUrl = window.location.href;
    const observer = new MutationObserver(() => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;

            const existingPanel = document.getElementById("kyo-delete-panel");
            if (!shouldInject()) {
                // If we moved to a page where the panel shouldn't exist, remove it (if not currently deleting)
                if (existingPanel && (!panel || !panel.isDeleting)) {
                    existingPanel.remove();
                    panel = null;
                }
            } else {
                // If we are in an inject-ready page but the panel was removed/doesn't exist, create it
                if (!existingPanel) {
                    setTimeout(async () => {
                        if (!document.getElementById("kyo-delete-panel") && shouldInject()) {
                            panel = new DeletePanel(api);
                            panel.inject();
                            
                            // If we already verified token and user info, immediately show panel without slow animations
                            if (api.token && api.currentUserId) {
                                panel.showAuthenticated();
                            } else {
                                panel.updateLoadingStep(`${chrome.i18n.getMessage("stepVerifyingToken")}`);
                                await api.delay(400);
                                panel.updateLoadingStep(`${chrome.i18n.getMessage("stepLoadingProfile")}`);
                                
                                if (await api.initialize()) {
                                    panel.updateLoadingStep(`${chrome.i18n.getMessage("stepKaptanReady")}`);
                                    await api.delay(400);
                                    panel.showAuthenticated();
                                } else {
                                    panel.showAuthError();
                                }
                            }
                        }
                    }, 500);
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// Run only on discord.com app page
if (window.location.hostname.includes("discord.com")) {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", runExtension);
    } else {
        runExtension();
    }
}