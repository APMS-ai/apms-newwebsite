# ==========================================================================
# APMS.ai - tools/unit-feather.py
#   python tools/unit-feather.py <slug> <source-image> [right] [bottom] [top] [left]
#
# Builds a unit plate from an already-cut-out source whose subject runs off the
# edge of the photograph, fading the alpha to nothing on the sides where it is
# clipped so the plate stops announcing that it is a rectangle.
#
# Every other plate on the site is a whole object: a press, a phone, a bell.
# It floats on the dark section and its outline is its own, so there is nothing
# to give away that it arrived as a rectangular file. The pharma line is not
# whole - the photograph cuts it on the right, the bottom and the top - and a
# cut-out with three dead-straight sides at exact right angles reads instantly
# as a photo in a box, which is the one thing these plates must not look like.
#
# Cropping tighter does not help: the machine is clipped everywhere along that
# side, so a tighter crop just moves the straight line inward. The fix is to
# stop the picture ending at all - ramp the alpha down to zero across the last
# stretch of each clipped side, so the line dissolves into the background
# instead of butting against it.
#
# The ramps are per-side and given as fractions of that dimension, because the
# right amount is not uniform: a long shallow fade suits the direction the
# subject continues in (the line running away to the right), while a short one
# suits an edge that is merely trimmed (the hopper at the top). Too long and
# the machine turns to fog; too short and the straight edge is still legible
# through it. These were judged by eye against the section's own background.
#
# Sides at 0 are left alone - the pharma plate's left side is genuinely the
# operator's outline, already the right shape, and fading it would erase her.
#
# --radial <inner> is the other mode, for a source that is a scene rather than
# a subject: it fades on an ellipse instead of per side, so the plate has no
# straight edge anywhere, not even a softened one. Per-side fades round the
# corners of a rectangle but keep its sides, and on a photograph that fills its
# frame edge to edge that is still legible as a box - the bottling line needed
# this, the pharma line did not, because pharma had an operator's real outline
# down one side doing the work. <inner> is the fraction of the radius that
# stays fully opaque; the rest ramps away.
#
# smoothstep rather than a linear ramp: a linear alpha ramp leaves a visible
# crease where it starts, because the eye picks up the sudden change in the
# rate of fade. smoothstep eases in and out, so the fade has no edge of its own.
# ==========================================================================
import sys
import numpy as np
from PIL import Image

if len(sys.argv) < 3:
    sys.exit("usage: python tools/unit-feather.py <slug> <source> "
             "[right] [bottom] [top] [left]")
SLUG, SRC = sys.argv[1], sys.argv[2]
def frac(i, d):
    return float(sys.argv[i]) if len(sys.argv) > i else d
# --luma <lo> <hi> keys the alpha off the picture's own brightness: pixels
# darker than lo go fully transparent, brighter than hi stay fully opaque, and
# the band between ramps. On a dark section this is what makes a rectangular
# scene photograph sit *in* the page instead of on top of it - the shadows and
# dark recesses drop out and the background shows through them, so the shape
# the eye reads is the lit machinery, not the file's border. Nothing geometric
# is imposed: no box, no ellipse, no fade the viewer can name.
#
# It only works when the subject is genuinely brighter than its surroundings,
# which is why it suits the bottling line (lit metal and juice against dark
# recesses) and would ruin the pharma plate, where the operator's dark scrubs
# are the subject and would be the first thing erased.
LUMA = None
if "--luma" in sys.argv:
    k = sys.argv.index("--luma")
    LUMA = (float(sys.argv[k + 1]), float(sys.argv[k + 2]))
    del sys.argv[k:k + 3]
RADIAL = None
if "--radial" in sys.argv:
    k = sys.argv.index("--radial")
    RADIAL = float(sys.argv[k + 1])
    del sys.argv[k:k + 2]
RIGHT, BOTTOM, TOP, LEFT = frac(3, .16), frac(4, .13), frac(5, .10), frac(6, .0)

MAX_EDGE = 1100

im = Image.open(SRC).convert("RGBA")
# Downscale to MAX_EDGE, never up. A source smaller than that has the detail
# it has; enlarging it only invents pixels, doubles the file and makes the
# plate look sharper in the repo than it will ever look on the page. The
# Food & Beverage source arrived at 600px on its long edge against 1100 for
# every other plate, and this is where that becomes visible rather than hidden.
sc = min(1.0, MAX_EDGE / float(max(im.size)))
if sc < 1.0:
    im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)

arr = np.array(im).astype(np.float32)
h, w = arr.shape[:2]
a = arr[:, :, 3] / 255.0

def smoothstep(t):
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)

if LUMA is not None:
    lo, hi = LUMA
    rgb = arr[:, :, :3] / 255.0
    luma = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
    a *= smoothstep((luma - lo) / max(1e-6, hi - lo))

if RADIAL is not None:
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    # normalised elliptical distance from the centre: 1.0 on the frame edge
    d = np.sqrt(((xx - (w - 1) / 2) / ((w - 1) / 2)) ** 2 +
                ((yy - (h - 1) / 2) / ((h - 1) / 2)) ** 2)
    a *= smoothstep((1.0 - d) / max(1e-6, 1.0 - RADIAL))
    arr[:, :, 3] = a * 255.0
    out = Image.fromarray(arr.astype(np.uint8))
    out.save("assets/unit-%s.webp" % SLUG, "WEBP", quality=88, method=6)
    out.save("assets/unit-%s.png" % SLUG, "PNG", optimize=True)
    print("unit-%s  %dx%d  radial inner=%.2f  (--unit-ratio: %d / %d)"
          % (SLUG, out.size[0], out.size[1], RADIAL, out.size[0], out.size[1]))
    sys.exit()

# The ramps run from the edges of what is actually in the picture, not from
# the edges of the file. unit-cutout.py pads every plate with clear space, so
# measuring from the canvas puts the whole fade band out in the transparent
# margin where there is nothing to fade: the first attempt on the automotive
# cell left its flat-cut bottom row still at 63% alpha, plainly visible.
# Fractions are of the subject's own width and height for the same reason.
ys, xs = np.where(a > 0.09)
if len(xs) == 0:
    sys.exit("nothing visible in %s" % SRC)
x0, x1 = int(xs.min()), int(xs.max())
y0, y1 = int(ys.min()), int(ys.max())
bw, bh = max(1, x1 - x0), max(1, y1 - y0)

# Each ramp is 0 at the subject's edge and 1 once clear of the fade band, so
# multiplying them together lets the corners fall off in both directions.
if RIGHT > 0:
    n = max(1, int(bw * RIGHT))
    x = np.arange(w, dtype=np.float32)
    a *= smoothstep((x1 - x) / n)[None, :]
if LEFT > 0:
    n = max(1, int(bw * LEFT))
    a *= smoothstep((np.arange(w, dtype=np.float32) - x0) / n)[None, :]
if BOTTOM > 0:
    n = max(1, int(bh * BOTTOM))
    y = np.arange(h, dtype=np.float32)
    a *= smoothstep((y1 - y) / n)[:, None]
if TOP > 0:
    n = max(1, int(bh * TOP))
    a *= smoothstep((np.arange(h, dtype=np.float32) - y0) / n)[:, None]

arr[:, :, 3] = a * 255.0
out = Image.fromarray(arr.astype(np.uint8))

out.save("assets/unit-%s.webp" % SLUG, "WEBP", quality=88, method=6)
out.save("assets/unit-%s.png" % SLUG, "PNG", optimize=True)
print("unit-%s  %dx%d  faded r=%.2f b=%.2f t=%.2f l=%.2f  (--unit-ratio: %d / %d)"
      % (SLUG, out.size[0], out.size[1], RIGHT, BOTTOM, TOP, LEFT,
         out.size[0], out.size[1]))
