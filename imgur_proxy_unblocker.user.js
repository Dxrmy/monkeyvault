// ==UserScript==
// @name         Imgur Proxy Auto-Loader
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Unblocks Imgur images via DuckDuckGo and redirects Imgur pages to CroxyProxy while hiding the proxy header.
// @author       Dormy
// @match        *://*/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // =========================================================================
    // CONFIGURATION
    // =========================================================================
    const PAGE_PROXY_PREFIX = 'https://www.croxyproxy.com/_proxytop/?url=';
    const IMAGE_PROXY_PREFIX = 'https://external-content.duckduckgo.com/iu/?u=';
    // Keeping the array for legacy compatibility in the findWorkingProxy function
    const PROXIES = [IMAGE_PROXY_PREFIX]; 

    if (PROXIES.length === 0) return; // Exit if no proxies are configured

    // =========================================================================
    // REDIRECTION LOGIC
    // =========================================================================
    function handlePageRedirect() {
        const url = window.location.href;
        const hostname = window.location.hostname;
        const isImgur = hostname.includes('imgur.com');
        
        if (!isImgur) return;

        // Skip if we are already on a proxy (handles recursion)
        if (url.includes(PAGE_PROXY_PREFIX) || url.includes(IMAGE_PROXY_PREFIX)) return;
        
        const isDirectImage = url.match(/\.(jpeg|jpg|gif|png|webp)$/i) || hostname.startsWith('i.');
        
        if (isDirectImage) {
            console.log("[Imgur Proxy] Redirecting direct image to DDG proxy...");
            window.location.replace(IMAGE_PROXY_PREFIX + encodeURIComponent(url));
        } else {
            console.log("[Imgur Proxy] Redirecting page to CroxyProxy...");
            window.location.replace(PAGE_PROXY_PREFIX + encodeURIComponent(url));
        }
    }

    // Run redirection check immediately
    handlePageRedirect();

    // =========================================================================
    // UI CLEANUP LOGIC
    // =========================================================================
    function cleanupProxyUI() {
        if (window.location.hostname.includes('croxyproxy.com')) {
            const style = document.createElement('style');
            style.innerHTML = `
                #cp_header { display: none !important; }
                body { padding-top: 0 !important; margin-top: 0 !important; }
            `;
            document.head.appendChild(style);
            console.log("[Imgur Proxy] CroxyProxy UI cleaned.");
        }
    }

    // Run cleanup immediately
    cleanupProxyUI();

    // Keep track of images currently being processed to avoid duplicate network requests
    const processing = new WeakSet();
    // Cache successful URLs so identical images on the page load instantly
    const successCache = new Map();

    // Core function: Test proxies recursively in the background
    function findWorkingProxy(originalUrl, proxyIndex, callback) {
        if (proxyIndex >= PROXIES.length) {
            console.error(`[Imgur Proxy] All proxies failed to load: ${originalUrl}`);
            return;
        }

        const proxyPrefix = PROXIES[proxyIndex];
        const testUrl = proxyPrefix + encodeURIComponent(originalUrl);
        
        // Create an off-screen image element to test the load
        const tempImg = new Image();
        
        tempImg.onload = function() {
            // SUCCESS! The image loaded. Pass the working URL back.
            callback(testUrl);
        };
        
        tempImg.onerror = function() {
            // FAILED! Log it and try the next proxy in the comma-separated list.
            console.warn(`[Imgur Proxy] Proxy failed (${proxyPrefix}). Trying next...`);
            findWorkingProxy(originalUrl, proxyIndex + 1, callback);
        };

        // Trigger the background network request
        tempImg.src = testUrl;
    }

    // Function to handle DOM elements
    function processImage(img) {
        let src = img.src || '';
        
        // Only target Imgur images
        if (!src.includes('imgur.com')) return;

        // Skip if already being processed or already proxied (prevents recursion)
        if (processing.has(img) || src.includes(IMAGE_PROXY_PREFIX) || src.includes(PAGE_PROXY_PREFIX)) {
            return;
        }

        processing.add(img);

        // Strip responsive sizes so the browser doesn't override our proxied image
        if (img.hasAttribute('srcset')) img.removeAttribute('srcset');
        if (img.hasAttribute('sizes')) img.removeAttribute('sizes');

        // If we've already found a working proxy for this specific image, use it immediately
        if (successCache.has(src)) {
            img.src = successCache.get(src);
            return;
        }

        // Start the background testing process
        findWorkingProxy(src, 0, function(workingUrl) {
            successCache.set(src, workingUrl); // Save to cache
            
            // Only now, after the image has ACTUALLY loaded, do we replace it on the page
            img.src = workingUrl;       
        });
    }

    // Scan the page for images
    function scanDOM(root = document) {
        if (!root.querySelectorAll) return; // Ensure it's a valid DOM node

        // 1. Process standard images
        const images = root.querySelectorAll('img[src*="imgur.com"]');
        images.forEach(processImage);

        // 2. Handle <source> tags in <picture> elements
        const sources = root.querySelectorAll('source[srcset*="imgur.com"]');
        sources.forEach(source => {
            const parentPicture = source.closest('picture');
            if (parentPicture) {
                const img = parentPicture.querySelector('img');
                if (img) {
                    // Extract the base Imgur URL and let processImage handle it
                    let originalUrl = source.srcset.split(',')[0].trim().split(' ')[0];
                    if (originalUrl.includes('imgur.com')) {
                        img.src = originalUrl; 
                        processImage(img);
                    }
                }
            }
            // Remove the source tag so it stops interfering with the <img> tag
            source.remove(); 
        });
    }

    // Run immediately on page load
    scanDOM();

    // Observe the DOM for dynamically loaded content (e.g., Infinite scrolling)
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        scanDOM(node);
                    }
                });
            }
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });

})();

