// ==UserScript==
// @name         YTCWBypass
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  Bypass YouTube's restrictive "Sensitive Content" prompts with a smart, zero-click auto-skipper.
// @author       Dormy
// @match        *://www.youtube.com/*
// @icon         https://i.ibb.co/wF0jwp7w/youtube-logo.png
// @license      MIT
// @grant        none
// ==/UserScript==
 
(function() {
    'use strict';
 
    // Global Time Lock to prevent the "Multiple Reload" bug
    let lastClickTime = 0;
    const COOLDOWN_MS = 3000; // 3 seconds
 
    function findWarningButton() {
        // 1. Check for the standard video "I understand" button (aria-label is most reliable)
        const standardBtn = document.querySelector('button[aria-label="I understand and wish to proceed"]');
        if (standardBtn) return standardBtn;
 
        // 2. Check for the YouTube Shorts / New UI interstitial
        // The container provided in the HTML snippet
        const interstitial = document.querySelector('yt-interstitial-view-model');
        if (interstitial) {
            // Find all links (a) and buttons inside the warning container
            const clickables = interstitial.querySelectorAll('a, button');
            for (const el of clickables) {
                // Look for the "Continue" text specifically
                if (el.textContent && el.textContent.trim() === 'Continue') {
                    // Ensure the button is actually visible
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        return el;
                    }
                }
            }
        }
 
        // 3. Fallback: Generic text search if the specific container isn't found
        const pageText = document.body.innerText || "";
        if (pageText.toLowerCase().includes("inappropriate for some users") || 
            pageText.toLowerCase().includes("viewer discretion")) {
            
            const buttons = document.querySelectorAll('button, a, [role="button"], yt-button-shape');
            for (let btn of buttons) {
                if (btn.innerText && btn.innerText.trim() === 'Continue') {
                    const rect = btn.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        return btn;
                    }
                }
            }
        }
 
        return null;
    }
 
    const observer = new MutationObserver(() => {
        // If we clicked a button recently, do nothing (Prevents the reload bug)
        if (Date.now() - lastClickTime < COOLDOWN_MS) return;
 
        // Look for the warning button
        const proceedButton = findWarningButton();
        
        if (proceedButton) {
            // Activate the time lock immediately
            lastClickTime = Date.now();
            
            // Click it
            proceedButton.click();
            
            console.log("[YTCWBypass] Warning bypassed (Shorts/Video). Cooldown activated.");
        }
    });
 
    // Start observing the page for changes
    observer.observe(document.body, { 
        childList: true, 
        subtree: true 
    });
 
})();