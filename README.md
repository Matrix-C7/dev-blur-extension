# Image Blur (Chrome extension)

Blurs **only** photos and videos on a website:

- `<img>` (including `<picture>` / `srcset`)
- `<video>` (including its poster)
- elements with a raster CSS `background-image`

It never blurs SVGs (inline `<svg>`, `.svg` images, `data:image/svg` backgrounds), icon-sized images (configurable minimum size), iframes or the whole page.

## Why it works in the Shopify theme editor

The theme editor (`admin.shopify.com/store/<store>/themes/<id>/editor`) shows the storefront inside an **iframe**. Generic blur extensions either blur the iframe element itself, which blurs the entire preview, or only run in the top frame. This extension:

1. Runs inside **every frame** (`all_frames`, `match_about_blank`, `match_origin_as_fallback`), so it runs directly inside the preview iframe.
2. Skips `iframe`, `frame`, `object`, `embed`, `canvas`, `html` and `body` elements, so the editor layout is never blurred.
3. Watches the DOM with a `MutationObserver`. When the editor re-renders a section, the new images are blurred again.
4. Looks inside open and closed **shadow roots** (Polaris web components in the admin UI).
5. Applies "Disable on this site" based on the **top-level** site, so turning it off for `admin.shopify.com` also turns it off inside the preview iframe.

Background images are blurred with a `backdrop-filter` layer that sits behind the element's content. The text and buttons on top of a hero banner stay sharp.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.

## Usage

Open the toolbar popup to change these settings:

| Setting | Default | Notes |
| --- | --- | --- |
| On/off | On | Also **Alt+Shift+B** |
| Blur strength | 12px | 2–40px |
| Ignore images smaller than | 32px | Keeps icons and logos sharp |
| Reveal on hover | On | Works even when an overlay link covers the image |
| Blur on this site | On | Per-site toggle |

Changes apply right away. You don't need to reload the page.

## Structure

```
manifest.json
icons/                     toolbar / store icons
src/shared/settings.js     defaults + chrome.storage helpers
src/content/content.js     detection + blurring (runs in every frame)
src/background/service-worker.js   keyboard shortcut + OFF badge
src/popup/                 settings UI
requirements.md            feature request tracker
```
