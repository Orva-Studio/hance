# Halation Landing Page: Media Assets Needed

## 📹 Video Assets Required

### 1. **Hero Before/After Comparison Video** (CRITICAL)
**Current placeholder:** `[VIDEO PLACEHOLDER]` in hero section (2-column layout)

**Specs:**
- Duration: 5–10 seconds
- Format: WebM (preferred for web) or MP4 fallback
- Resolution: 1600×900 (or 1920×1080, will scale)
- Aspect ratio: 16:9
- Codec: VP8/VP9 (WebM) or H.264 (MP4)
- File size: <10MB for WebM, <20MB for MP4
- Delivery: Save as:
  - `/public/halation-before.webm` (before ungraded)
  - `/public/halation-after.webm` (after halation applied)

**Content:**
- Scene: Backlit subject or bright light source (street light, window, etc.)
- Duration: Loop continuously
- Audio: Optional (keep silent for web)
- Before frame: Clean, ungraded footage
- After frame: Same footage with warm orange halation glow around highlights

**Why this matters:** Video boosts SEO and keeps users on page longer

**Tools to create:**
- Export clips from DaVinci Resolve/Premiere (before ungraded, after with halation)
- Use FFmpeg to optimize: `ffmpeg -i input.mp4 -c:v libvpx-vp9 output.webm`
- Or use Hance itself to add the halation!

---

## 🖼️ Image Assets Required

### 2. **Use Case Images** (4–6 images)
**Current placeholders:** `[IMAGE PLACEHOLDER]` in "Best Use Cases" section

**Images needed:**

#### A. Backlit Portrait
- Description: Person backlit with sun/light behind, halation glow around head
- Style: Warm, cinematic
- Format: JPG or WebP
- Size: 800×450px (16:9)
- File: `/public/halation-use-case-portrait.jpg`

#### B. Sunset/Golden Hour
- Description: Golden hour landscape with warm halation on sun/sky
- Style: Cinematic, warm tones
- Format: JPG or WebP
- Size: 800×450px (16:9)
- File: `/public/halation-use-case-sunset.jpg`

#### C. Night Cityscape
- Description: City at night with neon signs, streetlights glowing with orange halation
- Style: Cinematic, moody
- Format: JPG or WebP
- Size: 800×450px (16:9)
- File: `/public/halation-use-case-neon.jpg`

#### D. Bright Window/Interior
- Description: Interior shot with bright window in background, halation glow
- Style: Clean, modern
- Format: JPG or WebP
- Size: 800×450px (16:9)
- File: `/public/halation-use-case-window.jpg`

#### E. Artificial Lighting
- Description: Scene with artificial lights (lamps, overhead, etc.) with halation halos
- Style: Warm, vintage
- Format: JPG or WebP
- Size: 800×450px (16:9)
- File: `/public/halation-use-case-artificial.jpg`

#### F. Vintage Film Stock
- Description: Film-like aesthetic shot with characteristic halation (Cinestill-style)
- Style: Retro, warm, grainy
- Format: JPG or WebP
- Size: 800×450px (16:9)
- File: `/public/halation-use-case-vintage.jpg`

**Why 16:9?** Matches page layout, easy to embed, standard video format

**How to get these:**
- Shoot your own footage (best option — shows Hance in action)
- Use stock footage + grade in Hance (Pexels, Unsplash have good backlit/sunset scenes)
- Screenshot from Hance UI showing before/after
- Use existing Hance demo footage

---

## 📋 Asset Checklist

| Asset | Priority | File | Size | Notes |
|-------|----------|------|------|-------|
| Hero before video | 🔴 CRITICAL | halation-before.webm | <10MB | Backlit scene, ungraded |
| Hero after video | 🔴 CRITICAL | halation-after.webm | <10MB | Same scene + halation effect |
| Backlit portrait | 🟠 HIGH | halation-use-case-portrait.jpg | 100-200KB | Person backlit |
| Sunset/golden hour | 🟠 HIGH | halation-use-case-sunset.jpg | 100-200KB | Landscape with sun |
| Neon cityscape | 🟠 HIGH | halation-use-case-neon.jpg | 100-200KB | City night with lights |
| Bright window | 🟡 MEDIUM | halation-use-case-window.jpg | 100-200KB | Interior with bright window |
| Artificial lighting | 🟡 MEDIUM | halation-use-case-artificial.jpg | 100-200KB | Scene with artificial lights |
| Vintage/film stock | 🟡 MEDIUM | halation-use-case-vintage.jpg | 100-200KB | Cinestill-style aesthetic |

**Total expected:** ~2MB of media assets

---

## 🎬 How to Create These Assets (Step-by-Step)

### Option A: Use Hance to Create Demo Video
**Best option** (shows Hance in action)

1. Find or shoot a backlit scene
2. Export ungraded version
3. Use Hance CLI to add halation:
   ```bash
   hance input.mp4 --halation 0.6 --export high -o halation-graded.mp4
   ```
4. Export both ungraded + graded versions
5. Optimize with FFmpeg:
   ```bash
   # Convert to WebM
   ffmpeg -i input.mp4 -c:v libvpx-vp9 -crf 30 -b:v 0 output.webm
   ```

### Option B: Use Stock Footage + DaVinci Resolve
1. Download free footage from Pexels/Unsplash (backlit, sunset, neon, etc.)
2. Import into DaVinci Resolve Free
3. Add halation effect via Color > Glow > Halation
4. Export both before (ungraded) and after (with halation)
5. Optimize with FFmpeg as above

### Option C: Use Existing Hance Demos
If you already have Hance demo videos:
1. Extract clips showing halation effect
2. Cut into 5–10 second loops
3. Optimize as WebM
4. Use for hero and potentially use cases

---

## 🎥 WebM Video Optimization Command

```bash
# Convert MP4 to WebM (VP9 codec, high quality for web)
ffmpeg -i input.mp4 \
  -c:v libvpx-vp9 \
  -crf 30 \
  -b:v 0 \
  -c:a libopus \
  -b:a 128k \
  output.webm

# For lower file size:
ffmpeg -i input.mp4 \
  -c:v libvpx-vp9 \
  -crf 35 \
  -b:v 0 \
  -c:a libopus \
  -b:a 96k \
  output.webm
```

Result: ~2-5MB for 10-second 1600×900 video (great for web)

---

## 🖼️ Image Optimization Command

```bash
# Convert JPG to WebP (smaller file size, better quality)
ffmpeg -i input.jpg \
  -c:v libwebp \
  -q:v 80 \
  output.webp

# Or use ImageMagick:
convert input.jpg -quality 80 output.webp

# Batch convert all images:
for f in *.jpg; do ffmpeg -i "$f" -c:v libwebp -q:v 80 "${f%.jpg}.webp"; done
```

---

## 📸 Using Screenshots Instead (Quicker)

If you want the fastest path:
1. Take screenshots from Hance UI showing:
   - Before/after compare slider
   - Use cases in different scenes
2. Crop to 16:9 aspect ratio
3. Optimize size (100-200KB each)
4. Use for hero and use case sections

This is faster than shooting/grading new video, and shows Hance UI in action.

---

## ✅ File Paths to Update in halation.astro

Once you add media, update these sections:

**Line 128-144 (Before/After placeholder):**
```html
<!-- Replace with actual video -->
<video autoplay loop muted playsinline preload="metadata"
  poster="/halation-poster.webp">
  <source src="/halation-before.webm" type="video/webm" />
  <source src="/halation-before.mp4" type="video/mp4" />
</video>
```

**Use Case Image Cards (Line 360-380):**
```html
<figure>
  <img src="/public/halation-use-case-portrait.jpg" 
    alt="Backlit portrait with halation glow" />
</figure>
```

---

## 📈 SEO Benefit of Adding Media

✅ **Videos boost ranking:** Video content ranks better for competitive keywords  
✅ **Images in search:** Better visibility in Google Images, Google Lens  
✅ **User engagement:** Video keeps users on page (lower bounce rate = better signal to Google)  
✅ **Schema opportunities:** Can add VideoObject schema for videos  
✅ **Trust signals:** Real images/video = more credible than placeholder text  

**Conservative impact:** +20–30% more organic traffic once media is added

---

## 🎯 Priority Order

1. **Week 1:** Add hero before/after video (critical for page launch)
2. **Week 2:** Add use case images (improves engagement)
3. **Week 3+:** Add VideoObject schema to videos (advanced SEO)

Once media is live, page will rank significantly better.

---

## Questions?

- Need help creating halation demo videos? I can guide through Hance/DaVinci
- Want recommendations for stock footage sources? Pexels + Unsplash have great free options
- Need to optimize file sizes? Share your files and I'll compress them
- Want to create custom footage? I can provide shot list/storyboard

Let me know when you have media ready and I'll help integrate it into the page!
