// ==UserScript==
// @name         YouTube SoundCloud-Style Timestamp Comments
// @namespace    http://tampermonkey.net/
// @version      3.5
// @description  Embeds timestamp comments directly inside YouTube's native timestamp pill alongside avatar and author (SoundCloud-style)
// @author       Dormy
// @match        *://www.youtube.com/*
// @icon         https://i.ibb.co/wF0jwp7w/youtube-logo.png
// @license      MIT
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const MARKER_CONTAINER_CLASS = 'ytp-comment-markers-container';
    const MARKER_CLASS = 'ytp-comment-marker';
    const INLINE_COMMENT_ID = 'ytp-comment-inline-badge';

    let currentVideoId = null;
    let commentCache = new Map(); // timestampInSeconds -> array of comment objects
    let observer = null;
    let inlineCommentEl = null;
    let hoveredComments = null;

    // Helper: Safely clear element children without innerHTML TrustedHTML violations
    function clearElement(el) {
        if (!el) return;
        while (el.firstChild) {
            el.removeChild(el.firstChild);
        }
    }

    function parseTimestampToSeconds(str) {
        if (!str) return null;
        str = str.trim();

        if (str.includes(':')) {
            const parts = str.split(':').map(Number);
            if (parts.some(isNaN)) return null;
            if (parts.length === 2) return parts[0] * 60 + parts[1];
            if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }

        const hMatch = str.match(/(\d+)\s*h/i);
        const mMatch = str.match(/(\d+)\s*m/i);
        const sMatch = str.match(/(\d+)\s*s/i);
        if (hMatch || mMatch || sMatch) {
            let total = 0;
            if (hMatch) total += parseInt(hMatch[1], 10) * 3600;
            if (mMatch) total += parseInt(mMatch[1], 10) * 60;
            if (sMatch) total += parseInt(sMatch[1], 10);
            return total;
        }

        return null;
    }

    function getVideoId() {
        return new URLSearchParams(window.location.search).get('v');
    }

    function getVideoDuration() {
        const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
        if (video && !isNaN(video.duration) && video.duration > 0) return video.duration;
        const mp = document.getElementById('movie_player');
        if (mp && typeof mp.getDuration === 'function') {
            const d = mp.getDuration();
            if (d && !isNaN(d) && d > 0) return d;
        }
        return null;
    }

    // Get or create the inline badge element inside the native .ytp-tooltip-progress-bar-pill
    function getInlineBadge() {
        if (inlineCommentEl && document.body.contains(inlineCommentEl)) {
            return inlineCommentEl;
        }

        const pill = document.querySelector('.ytp-tooltip-progress-bar-pill');
        if (!pill) return null;

        inlineCommentEl = document.getElementById(INLINE_COMMENT_ID);
        if (!inlineCommentEl) {
            inlineCommentEl = document.createElement('div');
            inlineCommentEl.id = INLINE_COMMENT_ID;
            inlineCommentEl.className = 'ytp-comment-inline-badge';
        }

        if (inlineCommentEl.parentElement !== pill) {
            pill.appendChild(inlineCommentEl);
        }

        return inlineCommentEl;
    }

    // Updates the compact comment displayed inside the native timestamp pill
    function updateInlineComment(comments) {
        hoveredComments = comments;
        const badge = getInlineBadge();
        if (!badge) return;

        if (!comments || comments.length === 0) {
            badge.style.display = 'none';
            clearElement(badge);
            return;
        }

        clearElement(badge);

        const primaryComment = comments[0];

        // Avatar (or YouTube colored initial fallback)
        if (primaryComment.authorThumb) {
            const avatar = document.createElement('img');
            avatar.className = 'ytp-cib-avatar';
            avatar.src = primaryComment.authorThumb;
            badge.appendChild(avatar);
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'ytp-cib-placeholder';
            placeholder.textContent = '@';
            badge.appendChild(placeholder);
        }

        // Author handle
        const authorSpan = document.createElement('span');
        authorSpan.className = 'ytp-cib-author';
        authorSpan.textContent = primaryComment.author || 'User';
        badge.appendChild(authorSpan);

        // Comment preview (strips redundant raw timestamp string from text)
        const trimmedComment = primaryComment.text.replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, '').trim();
        if (trimmedComment.length > 0) {
            const commentSpan = document.createElement('span');
            commentSpan.className = 'ytp-cib-text';
            commentSpan.textContent = trimmedComment;
            badge.appendChild(commentSpan);
        }

        // Multi-comment counter badge if multiple comments at this timestamp
        if (comments.length > 1) {
            const countBadge = document.createElement('span');
            countBadge.className = 'ytp-cib-count';
            countBadge.textContent = `+${comments.length - 1}`;
            badge.appendChild(countBadge);
        }

        badge.style.display = 'inline-flex';
    }

    function hideInlineComment() {
        hoveredComments = null;
        if (inlineCommentEl) {
            inlineCommentEl.style.display = 'none';
            clearElement(inlineCommentEl);
        }
    }

    function injectStyles() {
        if (document.getElementById('ytp-timestamp-comment-styles')) return;
        const style = document.createElement('style');
        style.id = 'ytp-timestamp-comment-styles';
        style.textContent = `
            /* Marker container inside the YouTube progress bar */
            .${MARKER_CONTAINER_CLASS} {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 55;
            }

            /* Native-style white timeline pin */
            .${MARKER_CLASS} {
                position: absolute;
                top: 50%;
                transform: translate(-50%, -50%);
                width: 3px;
                height: 8px;
                background: #f1f1f1;
                border-radius: 1.5px;
                box-shadow: 0 0 2px rgba(0, 0, 0, 0.75);
                cursor: pointer;
                pointer-events: auto;
                transition: transform 0.12s ease, background 0.12s ease, height 0.12s ease, width 0.12s ease;
                z-index: 56;
            }

            .${MARKER_CLASS}:hover {
                transform: translate(-50%, -50%) scale(1.3);
                height: 14px;
                width: 5px;
                background: #ff0033; /* YouTube red */
                box-shadow: 0 0 6px rgba(255, 0, 51, 0.9), 0 0 0 1px #fff;
                z-index: 60;
            }

            .${MARKER_CLASS}.is-cluster {
                width: 5px;
                height: 10px;
                background: #ff4e45;
            }

            /* Seamless integration inside .ytp-tooltip-progress-bar-pill */
            .ytp-tooltip-progress-bar-pill {
                display: flex !important;
                align-items: center !important;
                transition: padding 0.14s ease, max-width 0.14s ease !important;
            }

            .ytp-comment-inline-badge {
                display: none;
                align-items: center;
                gap: 7px;
                margin-left: 8px;
                padding-left: 8px;
                border-left: 1px solid rgba(255, 255, 255, 0.25);
                white-space: nowrap;
                overflow: hidden;
                max-width: 280px;
                animation: ytpBadgeFade 0.12s ease-out;
            }

            @keyframes ytpBadgeFade {
                from { opacity: 0; transform: scale(0.96); }
                to { opacity: 1; transform: scale(1); }
            }

            .ytp-cib-avatar {
                width: 18px;
                height: 18px;
                border-radius: 50%;
                flex-shrink: 0;
            }

            .ytp-cib-placeholder {
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background: #ff0033;
                color: #fff;
                font-size: 11px;
                font-weight: 700;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }

            .ytp-cib-author {
                font-size: 12px;
                font-weight: 500;
                color: #ff8200;
                flex-shrink: 0;
            }

            .ytp-cib-text {
                font-size: 12px;
                color: #f1f1f1;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 160px;
            }

            .ytp-cib-count {
                font-size: 10px;
                font-weight: 600;
                background: rgba(255, 255, 255, 0.2);
                color: #ccc;
                border-radius: 8px;
                padding: 1px 5px;
                flex-shrink: 0;
            }
        `;
        document.head.appendChild(style);
    }

    function renderMarkers() {
        const progressBar = document.querySelector('.ytp-progress-bar');
        if (!progressBar) return;

        const duration = getVideoDuration();
        if (!duration || duration <= 0) return;

        let container = progressBar.querySelector(`.${MARKER_CONTAINER_CLASS}`);
        if (!container) {
            container = document.createElement('div');
            container.className = MARKER_CONTAINER_CLASS;
            progressBar.appendChild(container);
        }

        const bucketed = new Map();
        for (const [sec, comments] of commentCache.entries()) {
            if (sec > duration) continue;
            let foundKey = null;
            for (const bKey of bucketed.keys()) {
                if (Math.abs(bKey - sec) <= 1.5) {
                    foundKey = bKey;
                    break;
                }
            }
            if (foundKey !== null) {
                bucketed.get(foundKey).push(...comments);
            } else {
                bucketed.set(sec, [...comments]);
            }
        }

        clearElement(container);

        bucketed.forEach((comments, sec) => {
            const percent = (sec / duration) * 100;
            const marker = document.createElement('div');
            marker.className = MARKER_CLASS;
            if (comments.length > 1) {
                marker.classList.add('is-cluster');
            }
            marker.style.left = `${percent}%`;

            marker.addEventListener('mouseenter', () => {
                updateInlineComment(comments);
            });

            marker.addEventListener('mouseleave', () => {
                hideInlineComment();
            });

            marker.addEventListener('click', (e) => {
                e.stopPropagation();
                const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
                if (video) {
                    video.currentTime = sec;
                    video.play();
                }
            });

            container.appendChild(marker);
        });
    }

    // Monitor progress bar scrubber mousemove to detect when cursor is hovering near a timestamp marker
    function setupScrubberTracking() {
        const progressBar = document.querySelector('.ytp-progress-bar');
        if (!progressBar || progressBar.__scTracked) return;
        progressBar.__scTracked = true;

        progressBar.addEventListener('mousemove', (e) => {
            const duration = getVideoDuration();
            if (!duration || duration <= 0 || commentCache.size === 0) return;

            const rect = progressBar.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const percent = mouseX / rect.width;
            const currentHoverSec = percent * duration;

            let matchedComments = null;
            let closestDelta = Infinity;

            for (const [sec, comments] of commentCache.entries()) {
                const delta = Math.abs(sec - currentHoverSec);
                if (delta <= 2.2 && delta < closestDelta) {
                    closestDelta = delta;
                    matchedComments = comments;
                }
            }

            if (matchedComments) {
                updateInlineComment(matchedComments);
            } else if (hoveredComments) {
                hideInlineComment();
            }
        });

        progressBar.addEventListener('mouseleave', () => {
            hideInlineComment();
        });
    }

    function harvestCommentsFromDOM() {
        const commentElements = document.querySelectorAll('ytd-comment-thread-renderer, ytd-comment-view-model');
        let newFound = false;

        commentElements.forEach(thread => {
            const allLinks = Array.from(thread.querySelectorAll('a'));
            const timestampLinks = allLinks.filter(a => {
                const href = a.getAttribute('href') || a.href || '';
                return /[?&]t=/.test(href);
            });
            if (timestampLinks.length === 0) return;

            const contentEl = thread.querySelector('#content-text, .yt-core-attributed-string');
            const authorEl = thread.querySelector('#author-text, .ytd-comment-view-model__author-text');
            const thumbEl = thread.querySelector('#author-thumbnail img, img.yt-core-image');

            const author = authorEl ? authorEl.textContent.trim() : 'Anonymous';
            const authorThumb = thumbEl ? thumbEl.src : null;
            const commentFullText = contentEl ? contentEl.textContent.trim() : '';

            timestampLinks.forEach(link => {
                const timeText = link.textContent.trim();
                const sec = parseTimestampToSeconds(timeText);
                if (sec !== null) {
                    if (!commentCache.has(sec)) {
                        commentCache.set(sec, []);
                    }
                    const list = commentCache.get(sec);
                    const alreadyExists = list.some(item => item.author === author && item.text === commentFullText);
                    if (!alreadyExists) {
                        list.push({
                            timeStr: timeText,
                            author: author,
                            authorThumb: authorThumb,
                            text: commentFullText
                        });
                        newFound = true;
                    }
                }
            });
        });

        if (newFound) {
            renderMarkers();
        }
    }

    let triggeredCommentsScroll = false;
    function triggerCommentLoading() {
        if (triggeredCommentsScroll) return;
        const commentsSec = document.querySelector('ytd-comments, #comments');
        if (commentsSec && document.querySelectorAll('ytd-comment-view-model, ytd-comment-thread-renderer').length === 0) {
            triggeredCommentsScroll = true;
            const currentY = window.scrollY;
            if (currentY < 100) {
                window.scrollBy({ top: 400, behavior: 'auto' });
                setTimeout(() => {
                    window.scrollTo({ top: currentY, behavior: 'auto' });
                }, 300);
            }
        }
    }

    function initVideo() {
        const newId = getVideoId();
        if (!newId) return;

        if (newId !== currentVideoId) {
            currentVideoId = newId;
            commentCache.clear();
            triggeredCommentsScroll = false;
            const existingContainer = document.querySelector(`.${MARKER_CONTAINER_CLASS}`);
            if (existingContainer) clearElement(existingContainer);
            hideInlineComment();
        }

        harvestCommentsFromDOM();
        renderMarkers();
        setupScrubberTracking();
        triggerCommentLoading();
    }

    function startObserver() {
        injectStyles();

        observer = new MutationObserver((mutations) => {
            let shouldHarvest = false;
            let shouldCheckProgress = false;

            for (const m of mutations) {
                if (m.addedNodes.length > 0) {
                    for (const node of m.addedNodes) {
                        if (node.nodeType === 1) {
                            const tag = node.tagName;
                            if (tag === 'YTD-COMMENT-THREAD-RENDERER' ||
                                tag === 'YTD-COMMENT-VIEW-MODEL' ||
                                tag === 'YTD-COMMENTS' ||
                                (node.classList && (node.classList.contains('comment') || node.classList.contains('ytd-comments')))) {
                                shouldHarvest = true;
                            }
                            if (node.classList && (node.classList.contains('ytp-progress-bar') || node.classList.contains('html5-video-player'))) {
                                shouldCheckProgress = true;
                            }
                        }
                    }
                }
            }

            if (shouldHarvest) {
                harvestCommentsFromDOM();
            }
            if (shouldCheckProgress || shouldHarvest) {
                renderMarkers();
                setupScrubberTracking();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        window.addEventListener('yt-navigate-finish', () => {
            setTimeout(initVideo, 600);
        });

        setInterval(() => {
            const vId = getVideoId();
            if (vId && vId === currentVideoId) {
                harvestCommentsFromDOM();
                const container = document.querySelector(`.${MARKER_CONTAINER_CLASS}`);
                if (!container || (commentCache.size > 0 && container.children.length === 0)) {
                    renderMarkers();
                }
                setupScrubberTracking();
                triggerCommentLoading();
            } else if (vId && vId !== currentVideoId) {
                initVideo();
            }
        }, 1500);

        initVideo();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObserver);
    } else {
        startObserver();
    }
})();
