// ==UserScript==
// @name         SEO Slop Fader
// @namespace    https://github.com/Dxrmy/monkeyvault
// @version      1.0
// @description  Identify and visually demote AI-generated SEO slop. Keeps your search results clean, focused, and human.
// @author       Dormy
// @match        https://www.google.com/search*
// @icon         https://raw.githubusercontent.com/Dxrmy/monkeyvault/main/assets/monkey_logo.png
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Slop Fader] Script initialized. Monitoring Google results...');

    const SLOP_THRESHOLD = 2.0;
    const AI_ISMS = [
        // High-Weight Core Phrases (1.0)
        { regex: /in the fast-paced digital landscape/gi, weight: 1.0, label: "Fast-paced digital landscape" },
        { regex: /it's important to remember that/gi, weight: 1.0, label: "Generic advice preamble" },
        { regex: /in the ever-evolving world of/gi, weight: 1.0, label: "Ever-evolving world" },
        { regex: /look no further than/gi, weight: 1.0, label: "Infomercial tone" },
        { regex: /is a game-changer for/gi, weight: 1.0, label: "Game-changer cliche" },
        { regex: /the pivotal role of/gi, weight: 1.0, label: "Pivotal role" },
        { regex: /a comprehensive guide to/gi, weight: 0.8, label: "Template title" },
        
        // Mid-Weight "Delve" & "Explore" (0.5)
        { regex: /delve into/gi, weight: 0.5, label: "Delve into" },
        { regex: /embark on a journey/gi, weight: 0.5, label: "Journey metaphor" },
        { regex: /unleash the potential/gi, weight: 0.5, label: "Marketing fluff" },
        { regex: /at the forefront of/gi, weight: 0.5, label: "Forefront cliche" },
        { regex: /mastering the art of/gi, weight: 0.5, label: "Mastering the art" },
        { regex: /in summary,/gi, weight: 0.5, label: "AI structural summary" },
        { regex: /in conclusion,/gi, weight: 0.5, label: "AI structural conclusion" },
        { regex: /furthermore,/gi, weight: 0.3, label: "Transitional filler" },
        { regex: /moreover,/gi, weight: 0.3, label: "Transitional filler" },
        { regex: /not only... but also/gi, weight: 0.3, label: "Balanced AI syntax" },
        
        // Behavioral / Contextual Phrases (0.5)
        { regex: /when it comes to/gi, weight: 0.5, label: "Padding phrase" },
        { regex: /one of the most/gi, weight: 0.4, label: "Superlative padding" },
        { regex: /vital for success/gi, weight: 0.5, label: "Generic benefit" },
        { regex: /designed to help you/gi, weight: 0.5, label: "Service-oriented AI" },
        { regex: /crucial to understand/gi, weight: 0.5, label: "Didactic tone" },
        { regex: /can be challenging/gi, weight: 0.4, label: "Generic empathy" },
        { regex: /let's explore/gi, weight: 0.6, label: "ChatGPT transition" },
        { regex: /to wrap it up/gi, weight: 0.5, label: "Informal conclusion" },
        
        // Technical / "Slop" Markers (0.7)
        { regex: /harnessing the power of/gi, weight: 0.7, label: "Harnessing power" },
        { regex: /revolutionizing the way/gi, weight: 0.7, label: "Revolutionizing" },
        { regex: /transformative impact/gi, weight: 0.7, label: "Transformative" },
        { regex: /seamlessly integrate/gi, weight: 0.6, label: "Buzzword" },
        { regex: /cutting-edge solutions/gi, weight: 0.7, label: "Cutting-edge" },
        { regex: /paradigm shift/gi, weight: 0.8, label: "Corporate slop" },
        { regex: /a testament to/gi, weight: 0.6, label: "AI flourish" },
        { regex: /navigating the complexities/gi, weight: 0.7, label: "Navigating complexities" }
    ];

    GM_addStyle(`
        .slop-faded {
            opacity: 0.15 !important;
            filter: grayscale(80%);
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
        }
        .slop-faded:hover {
            opacity: 0.6 !important;
            filter: grayscale(0%);
        }
        .slop-badge {
            background: linear-gradient(135deg, #ff4b2b 0%, #ff416c 100%);
            color: white;
            padding: 3px 8px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 700;
            margin-left: 10px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            box-shadow: 0 2px 4px rgba(255, 65, 108, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.2);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            pointer-events: auto !important;
        }
        .slop-badge:hover {
            transform: scale(1.05);
            box-shadow: 0 4px 8px rgba(255, 65, 108, 0.5);
        }
        .slop-tooltip {
            position: absolute;
            background: #1a1a1a;
            color: #eee;
            padding: 12px;
            border-radius: 8px;
            font-size: 12px;
            width: 250px;
            z-index: 10000;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            border: 1px solid #333;
            line-height: 1.4;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s;
        }
        .slop-badge:hover + .slop-tooltip, .slop-tooltip:hover {
            opacity: 1;
        }
    `);

    function calculateSlopScore(text, url) {
        let score = 0;
        let findings = [];
        AI_ISMS.forEach(item => {
            const matches = text.match(item.regex);
            if (matches) {
                const weight = matches.length * item.weight;
                score += weight;
                findings.push({ label: item.label, count: matches.length, pts: weight.toFixed(1) });
            }
        });
        
        return { score, findings };
    }

    function checkLinkForSlop(url, callback) {
        GM_xmlhttpRequest({
            method: "GET",
            url: url,
            onload: function(response) {
                const result = calculateSlopScore(response.responseText, url);
                callback(result);
            },
            onerror: function(err) {
                callback({ score: 0, findings: [] });
            }
        });
    }

    function processResult(container) {
        const link = container.querySelector('a[href^="http"]:not([href*="google.com"])');
        if (!link || container.dataset.slopChecked) return;
        
        container.dataset.slopChecked = "true";
        const url = link.href;

        checkLinkForSlop(url, (result) => {
            if (result.score >= SLOP_THRESHOLD) {
                container.classList.add('slop-faded');
                const title = container.querySelector('h3');
                if (title) {
                    const badge = document.createElement('span');
                    badge.className = 'slop-badge';
                    badge.innerHTML = 'AI SLOP ⚠️';
                    
                    const tooltip = document.createElement('div');
                    tooltip.className = 'slop-tooltip';
                    
                    let html = `<strong>Slop Analysis: ${result.score.toFixed(1)} pts</strong><br><hr style="border:0;border-top:1px solid #444;margin:8px 0">`;
                    result.findings.sort((a,b) => b.pts - a.pts).slice(0, 6).forEach(f => {
                        html += `<div style="display:flex;justify-content:space-between;margin-bottom:2px">
                            <span>${f.label}</span>
                            <span style="color:#ff4b2b">+${f.pts}</span>
                        </div>`;
                    });
                    if (result.findings.length > 6) html += `<div style="font-size:10px;color:#888;margin-top:4px">...and ${result.findings.length - 6} more</div>`;
                    html += `<div style="font-size:10px;color:#888;margin-top:8px">Click badge to restore visibility</div>`;
                    
                    tooltip.innerHTML = html;
                    
                    badge.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        container.classList.remove('slop-faded');
                        badge.remove();
                        tooltip.remove();
                    };

                    title.style.display = 'flex';
                    title.style.alignItems = 'center';
                    title.appendChild(badge);
                    document.body.appendChild(tooltip);

                    badge.onmousemove = (e) => {
                        tooltip.style.left = (e.pageX + 15) + 'px';
                        tooltip.style.top = (e.pageY + 15) + 'px';
                        tooltip.style.opacity = '1';
                    };
                    badge.onmouseleave = () => {
                        tooltip.style.opacity = '0';
                    };
                }
            }
        });
    }

    function scanPage() {
        // Broad selector to find result containers
        const containers = document.querySelectorAll('div.g, div.sr_item, div.tF2Cxc, div.Ww9uTd');
        if (containers.length > 0) {
            console.log(`[Slop Fader] Scanning ${containers.length} potential results...`);
            containers.forEach(processResult);
        }
    }

    const observer = new MutationObserver((mutations) => {
        scanPage();
    });

    observer.observe(document.body, { childList: true, subtree: true });
    
    // Initial run
    console.log('[Slop Fader] Initial scan starting...');
    scanPage();
})();
