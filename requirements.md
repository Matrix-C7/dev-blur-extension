# Requirements Tracker

| # | Requirement | Submitted | Status | Completed |
|---|-------------|-----------|--------|-----------|
| 1 | Chrome extension that blurs images and videos on websites, like the public blur extensions | 2026-11-04 | Done | 2026-11-04 |
| 2 | Must work correctly in the Shopify admin theme editor (public versions blur the whole page there) | 2026-11-04 | In progress – fix applied, needs user verification | |
| 3 | Blur only images, background images and videos — never SVGs or icons | 2026-11-04 | Done | 2026-11-04 |
| 4 | Bug: no blur at all in the Shopify theme editor (`admin.shopify.com/store/<store>/themes/<id>/editor`) — added self-healing styles when the editor re-renders the preview, injection into already-open tabs, rescan when stylesheets load | 2026-11-04 | Fix applied – needs user verification | |
| 5 | Make the popup UI smarter and more professional | 2026-11-04 | Done | 2026-11-04 |
| 6 | Shortcuts: Alt+L toggles blur on/off (press again to switch back); Alt+K toggles blur for the current site | 2026-11-04 | Done | 2026-11-04 |
| 7 | Show ON/OFF status on the extension toolbar icon by icon colour only — blue = on, grey = off, per tab (no text badge) | 2026-11-04 | Done | 2026-11-04 |
| 8 | Bug: Alt+K / Alt+L shortcuts not working — Chrome keeps old bindings on reload; added in-page key fallback (incl. theme editor iframe) and a popup warning when Chrome's binding differs | 2026-11-04 | Fix applied – needs user verification | |
