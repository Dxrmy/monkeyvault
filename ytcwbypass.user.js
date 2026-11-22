// ==UserScript==
// @name         YTCWBypass
// @namespace    http://tampermonkey.net/
// @version      3.5
// @description  Bypass YouTube's restrictive "Sensitive Content" & Content Warning prompts with a smart, zero-click auto-skipper across Standard Videos and Shorts.
// @author       Dormy
// @match        *://www.youtube.com/*
// @icon         https://i.ibb.co/wF0jwp7w/youtube-logo.png
// @license      MIT
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // Global Time Lock to prevent the "Multiple Reload" bug
    let lastClickTime = parseInt(sessionStorage.getItem('ytcw_last_click') || '0', 10);
    const COOLDOWN_MS = 2500; // 2.5 seconds

    function clickElement(el) {
        if (!el) return false;
        try {
            // Find inner native button if element is a custom wrapper component
            const target = el.matches('button, a') ? el : (el.querySelector('button, a') || el);
            target.click();
            return true;
        } catch (e) {
            console.error('[YTCWBypass] Error clicking element:', e);
            return false;
        }
    }

    function findWarningButton() {
        // 1. Standard YouTube watch page "I understand and wish to proceed" button
        const standardBtn = document.querySelector('button[aria-label="I understand and wish to proceed"]');
        if (standardBtn) return standardBtn;

        // 2. Button elements matching exact or partial text for the standard warning
        const allButtons = document.querySelectorAll('button, yt-button-shape, ytd-button-renderer');
        for (const btn of allButtons) {
            const txt = (btn.textContent || '').trim().toLowerCase();
            if (txt.includes('i understand and wish to proceed') || (txt.includes('understand') && txt.includes('proceed'))) {
                const rect = btn.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    return btn;
                }
            }
        }

        // 3. YouTube Shorts & Modern Interstitial (yt-interstitial-view-model / ytd-player-error-message-renderer)
        const interstitial = document.querySelector('yt-interstitial-view-model, ytd-player-error-message-renderer, ytd-watch-flexy[player-unavailable]');
        if (interstitial) {
            const clickables = interstitial.querySelectorAll('a, button, yt-button-shape');
            for (const el of clickables) {
                const txt = (el.textContent || '').trim().toLowerCase();
                if (txt === 'continue' || txt === 'i understand' || txt.includes('proceed')) {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        return el;
                    }
                }
            }
        }

        // 4. Fallback: Search for warning text in container headers/dialogs
        const pageText = (document.body ? document.body.innerText : '') || '';
        if (pageText.toLowerCase().includes('inappropriate for some users') ||
            pageText.toLowerCase().includes('viewer discretion') ||
            pageText.toLowerCase().includes('warning') ||
            pageText.toLowerCase().includes('content warning')) {

            const candidates = document.querySelectorAll('button, a, [role="button"], yt-button-shape');
            for (const btn of candidates) {
                const txt = (btn.textContent || '').trim().toLowerCase();
                if (txt === 'continue' || txt === 'i understand and wish to proceed' || txt === 'i understand') {
                    const rect = btn.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        return btn;
                    }
                }
            }
        }

        return null;
    }

    function checkAndBypass() {
        if (Date.now() - lastClickTime < COOLDOWN_MS) return;

        const proceedButton = findWarningButton();
        if (proceedButton && !proceedButton.dataset.ytcwClicked) {
            proceedButton.dataset.ytcwClicked = 'true';

            lastClickTime = Date.now();
            sessionStorage.setItem('ytcw_last_click', lastClickTime.toString());

            const success = clickElement(proceedButton);
            if (success) {
                console.log('[YTCWBypass] Warning bypassed (Shorts/Video). Cooldown activated.');
            }
        }
    }

    // Run observer when DOM is ready
    function init() {
        const observer = new MutationObserver(() => {
            checkAndBypass();
        });

        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true
        });

        // Fast periodic poll during initial page load to catch fast-rendered warnings
        const intervalId = setInterval(checkAndBypass, 500);
        setTimeout(() => clearInterval(intervalId), 10000);

        // YouTube SPA navigation listener
        window.addEventListener('yt-navigate-finish', () => {
            setTimeout(checkAndBypass, 200);
        });

        checkAndBypass();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
