# Google Flow shot list

The landing page has five video slots. Each one already plays code-made motion, so the site works without any clip. When a clip exists at the path below, it cross-fades in over that motion.

The slots are defined in `client/src/lib/media.ts`. To turn one off, set it to `null`.

| Slot | File | Where it plays | Aspect |
| --- | --- | --- | --- |
| Film backdrop | `client/public/media/film-backdrop.mp4` | Behind the phone demo in "In motion" | 16:9 |
| Build step | `client/public/media/step-build.mp4` | Top of step 1 card | 16:9 (cropped to ~2.2:1) |
| Share step | `client/public/media/step-share.mp4` | Top of step 2 card | 16:9 (cropped to ~2.2:1) |
| Keep step | `client/public/media/step-keep.mp4` | Top of step 3 card | 16:9 (cropped to ~2.2:1) |
| Final loop | `client/public/media/final-loop.mp4` | Full-width behind the last CTA, under a light veil | 16:9 |

## Rules for every clip

- Generate 8 seconds, landscape 16:9, in Veo inside Flow.
- The clip must have **no readable text, logos, UI or faces in close-up**. Real UI in the page is drawn in code, so it stays sharp and accurate.
- It needs to loop. Ask for a static or slow camera, and for the first and last frames to match. If the loop seam shows, trim to the best 4 to 6 seconds.
- Palette: lilac `#c2b7ff`, violet `#6b5cff`, deep ink `#10152a`, aqua `#35c8c0`, warm coral accent `#f4816b`.
- Mood: calm, premium, soft light, and shallow depth of field. Motion should be slow; the page adds the energy.
- Audio is stripped. Every slot plays muted.

## Prompts

### film-backdrop

> Abstract slow-moving light through frosted glass, soft violet and lilac glow drifting over deep navy darkness, faint aqua highlights, smooth gradients, gentle bokeh, no objects, no text, static camera, seamless loop, cinematic, 8 seconds.

This clip sits behind white UI, so keep it dark overall.

### step-build

> Macro shot of a hand holding a sleek phone at a soft angle, the screen glowing in lilac and violet light with blurred shapes, clean pale desk with soft daylight, shallow depth of field, slow push-in, no readable text, no logos, 8 seconds, seamless loop.

### step-share

> Two phones held close together in soft focus, a gentle pulse of violet and aqua light between them, pale lilac background, friendly and calm, slow motion, no readable screens, no logos, static camera, 8 seconds.

### step-keep

> Close-up of a phone resting on a light desk next to a coffee cup, the screen glowing softly with a pale lilac light, morning sunlight moving slowly across the table, very shallow depth of field, no readable text, 8 seconds, seamless loop.

### final-loop

> Soft-focus people meeting at a bright modern event, smiling, one person holding up a phone to another, warm daylight with lilac and aqua tones, heavily blurred background, slow gentle camera drift, no readable text, no logos, 8 seconds.

A light veil covers this clip so the headline stays readable. Keep it bright.

## Export and compress

Download each clip from Flow as MP4. Then run ffmpeg to strip the audio, scale to 1280px wide and add faststart, aiming for 1 to 3 MB per clip:

```bash
ffmpeg -i flow-download.mp4 -an -vf "scale=1280:-2,fps=30" -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -movflags +faststart client/public/media/film-backdrop.mp4
```

- If the file is still over 3 MB, raise `-crf` to 29 or trim with `-t 6`.
- The step clips appear small, so `scale=960:-2` is enough for them.
- Keep the exact file names from the table. No code change is needed; reload the page.

## Personal page video covers

Users can also upload their own looping cover video in the builder under "Cover".

- Formats: MP4, WebM or MOV.
- Size limit: up to 3 MB when signed in, or 1 MB in preview mode.

The cover plays muted and loops. It does not play for visitors who have reduced motion or Save-Data turned on; they see the page's colour mesh instead.
