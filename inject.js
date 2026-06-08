(function() {
    "use strict";

    let tokenFound = false;

    function dispatchToken(token) {
        if (!tokenFound) {
            tokenFound = true;
            window.__DISCORD_TOKEN__ = token;
            document.dispatchEvent(new CustomEvent("kyo-token-found", { detail: token }));
        }
    }

    function tryExtractToken() {
        if (tokenFound) return true;

        // Webpack Chunk Method (Modern Discord)
        if (window.webpackChunkdiscord_app) {
            try {
                // Use a unique namespace to avoid collisions in Webpack
                window.webpackChunkdiscord_app.push([["kaptan_extractor"], {}, (webpackRequire) => {
                    if (tokenFound) return;
                    try {
                        const modules = [];
                        for (const key in webpackRequire.c) {
                            if (webpackRequire.c[key]) {
                                modules.push(webpackRequire.c[key]);
                            }
                        }

                        for (const mod of modules) {
                            if (tokenFound) break;
                            try {
                                // Check for modern getToken functions
                                if (mod?.exports?.default?.getToken) {
                                    const t = mod.exports.default.getToken();
                                    if (t && typeof t === "string" && t.length > 50 && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(t)) {
                                        dispatchToken(t);
                                        return;
                                    }
                                }
                                if (mod?.exports?.getToken) {
                                    const t = mod.exports.getToken();
                                    if (t && typeof t === "string" && t.length > 50 && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(t)) {
                                        dispatchToken(t);
                                        return;
                                    }
                                }
                            } catch (e) {
                                continue;
                            }
                        }
                    } catch (e) {}
                }]);
            } catch (e) {}
        }

        return tokenFound;
    }

    // Try immediately
    if (tryExtractToken()) return;

    // Retry periodically during initialization
    let attempts = 0;
    const interval = setInterval(() => {
        attempts++;
        if (tryExtractToken() || attempts >= 20) {
            clearInterval(interval);
        }
    }, 500);

    // Fallback load listeners
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            setTimeout(() => tryExtractToken(), 1000);
        });
    } else {
        setTimeout(() => tryExtractToken(), 1000);
    }
})();