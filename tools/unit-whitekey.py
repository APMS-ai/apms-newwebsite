# ==========================================================================
# APMS.ai - tools/unit-whitekey.py
#   python tools/unit-whitekey.py <slug> <source> [white] [solid]
#
# Cuts a plate by keying the studio sweep instead of asking a model what the
# subject is. Use it when the photograph contains several things that all
# belong - a machine, its operator, the stock beside it - because that is
# precisely where tools/unit-cutout.py fails.
#
# rembg picks one subject and discards the rest, and which one it picks is not
# up to us. On the press brake it kept the operator alone and threw away the
# entire machine, the mirror image of the automotive cell where it kept the car
# body and dropped all six robot arms. Nothing about the segmentation is wrong;
# it answers "what is the subject", and a fabrication cell has no single answer.
#
# Keying the background asks a different and much easier question: which pixels
# are the sweep? On a studio white that is separable by brightness alone, and
# unlike the fleet machines - white robots on white, where this would have been
# hopeless - the margin here is large. The sweep sits at 253-255 while the
# lightest part of the machine, a stack of sheet steel, is 229. That is a
# 24-level gap, so the threshold has room either side of it.
#
# It keys on the *minimum* channel, not luminance. A saturated colour can be
# bright - the red panels have a 254 red channel - so luminance would have
# taken bites out of them. Only true white has all three channels high.
#
# Small blobs are dropped. JPEG noise in the sweep leaves specks above the
# threshold, and one grey speck floating beside a machine is more noticeable
# than anything else this tool does.
# ==========================================================================
import sys
import numpy as np
from scipy import ndimage
from PIL import Image

# --bg r g b [near] [far] keys any flat background colour, not just a white
# sweep, by distance from that colour rather than by brightness. The pipeline
# plates needed it: they arrive on four different grounds - a white sweep, an
# off-white 247, a lavender 227,225,246 and one on pure black - and each would
# otherwise want its own hand-tuned brightness pair. Distance-from-colour is
# one rule that covers all of them.
#
# The black one is the reason `near` is separate from `far`. That phone's bezel
# runs 5-16 against a background of 0, so no single cut separates them; the
# ramp puts the bezel's darkest edge at partial alpha instead, which against
# this section's near-black background is invisible either way.
FILL_HOLES = "--fill-holes" in sys.argv
if FILL_HOLES:
    sys.argv.remove("--fill-holes")

BG = None
if "--bg" in sys.argv:
    k = sys.argv.index("--bg")
    BG = [float(v) for v in sys.argv[k + 1:k + 4]]
    rest = sys.argv[k + 4:k + 6]
    NEAR = float(rest[0]) if len(rest) > 0 and not rest[0].startswith("-") else 6.0
    FAR = float(rest[1]) if len(rest) > 1 and not rest[1].startswith("-") else 20.0
    del sys.argv[k:k + 4 + sum(1 for r in rest if not r.startswith("-"))]

if len(sys.argv) < 3:
    sys.exit("usage: python tools/unit-whitekey.py <slug> <source> [white] [solid]")
SLUG, SRC = sys.argv[1], sys.argv[2]
WHITE = float(sys.argv[3]) if len(sys.argv) > 3 else 248.0  # fully background
SOLID = float(sys.argv[4]) if len(sys.argv) > 4 else 238.0  # fully subject
MIN_BLOB = 400
MAX_EDGE, MARGIN, HEADROOM = 1100, 0.04, 0.06   # as tools/unit-cutout.py

src = Image.open(SRC).convert("RGB")
rgb = np.array(src).astype(np.float32)
mn = rgb.min(axis=2)

if BG is not None:
    # largest per-channel deviation from the background colour
    dist = np.abs(rgb - np.array(BG, np.float32)[None, None, :]).max(axis=2)
    a = np.clip((dist - NEAR) / max(1e-6, FAR - NEAR), 0.0, 1.0)
    print("  keyed on bg %s (near %g, far %g)" % (BG, NEAR, FAR))
else:
    # ramp between the two levels so the edge keeps a soft pixel or two
    a = np.clip((WHITE - mn) / max(1e-6, WHITE - SOLID), 0.0, 1.0)

# --fill-holes: anything transparent the frame edge cannot reach is a hole
# inside the subject rather than background, and gets filled back in. The
# Result plate needed it - two engineers at a monitor whose dashboard is a
# white UI, which a key that cannot tell white UI from a white sweep punched
# straight out, leaving the section's background showing through the charts.
#
# It is deliberately OFF by default, because on most of these subjects those
# holes are real: you see through the bandsaw's open bow, between the racking
# uprights, between the halves of an open mould. Filling those would paste
# solid slabs into gaps the eye expects to see through. Turn it on only for
# something with no genuine voids - a screen, a phone, a panel - where any
# enclosed transparency is a lit UI the key mistook for sweep.
if FILL_HOLES:
    holes = a < 0.5
    lab_h, n_h = ndimage.label(holes)
    if n_h:
        border = set(np.unique(np.concatenate([lab_h[0], lab_h[-1], lab_h[:, 0], lab_h[:, -1]])))
        border.discard(0)
        interior = holes & ~np.isin(lab_h, list(border))
        if interior.any():
            a = np.where(interior, 1.0, a)
            print("  filled %d px of interior holes" % int(interior.sum()))

lab, n = ndimage.label(a > 0.09)
if n > 1:
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    drop = {i + 1 for i, sz in enumerate(sizes) if sz < MIN_BLOB}
    if drop:
        a = np.where(np.isin(lab, list(drop)), 0.0, a)
        print("  dropped %d blob(s) under %dpx" % (len(drop), MIN_BLOB))

cut = Image.fromarray(np.dstack([rgb, a * 255.0]).astype(np.uint8))
cut = cut.crop(cut.getbbox())

w, h = cut.size
pad = int(w * MARGIN)
top = int(h * HEADROOM)
out = Image.new("RGBA", (w + pad * 2, h + top + pad), (0, 0, 0, 0))
out.paste(cut, (pad, top))
sc = MAX_EDGE / float(max(out.size))
if sc < 1.0:
    out = out.resize((round(out.size[0] * sc), round(out.size[1] * sc)), Image.LANCZOS)

out.save("assets/unit-%s.webp" % SLUG, "WEBP", quality=88, method=6)
out.save("assets/unit-%s.png" % SLUG, "PNG", optimize=True)
print("unit-%s  %dx%d  white>=%g solid<=%g  (--unit-ratio: %d / %d)"
      % (SLUG, out.size[0], out.size[1], WHITE, SOLID, out.size[0], out.size[1]))
