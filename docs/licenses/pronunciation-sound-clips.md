# Pronunciation sound clips

These five clips are owner-supplied recordings for Coco English. The original
files remain in the project owner's Downloads folder; copies were used for
local conversion. Rights are recorded as owner-provided and have not been
independently verified.

## Sources

| Sound | Source file | SHA-256 |
| --- | --- | --- |
| Light L | `~/Downloads/light-l.wav` | `e45b26c0d8e73843753b173dc5a56e35f47023b93c44ccfff21faf6ce6ea8f2f` |
| S | `~/Downloads/s.wav` | `efb0a4d8ab3e28217422e5eb8f2236b1b7cafdd7172dbbe8e8524324564377b1` |
| F | `~/Downloads/f.wav` | `2a1c2c30c4b784c7e61e4ecd70cbce6f7248a27a0c8f0db9df7be7cee73301b5` |
| V | `~/Downloads/v.wav` | `a0e9909aad11adaa7dcd7d2874ff6f4ea808b7439dabd20a6a151b34ecfa61b7` |
| Z | `~/Downloads/z.wav` | `958db61f46a718786448d43a1ad7034bae75b308a7ff379a94a84b10549dc665` |

The mono, 48 kHz, 16-bit PCM WAV sources are approved for this feature. No
synthetic or replacement clips were made.

## Conversion

The delivery clips were made locally with the repository's pinned
`ffmpeg-static` binary. Pitch was not changed.

```text
./node_modules/ffmpeg-static/ffmpeg -y -i "<source>.wav" -ac 1 -ar 24000 -b:a 48k "<sound>.mp3"
```

Delivery files are mono MP3 at 24 kHz and 48 kbps, stored under
`public/audio/pronunciation/sounds/v1/`.
