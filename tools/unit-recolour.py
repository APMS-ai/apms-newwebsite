# ==========================================================================
# APMS.ai - tools/unit-recolour.py
#   python tools/unit-recolour.py <src> <out> --from <lo> <hi> --to <deg>
#                                 [--sat-min f] [--val-min f]
#
# Swaps one hue for another and leaves everything else alone. Written for the
# Metal Fabrication press brake, which is a good photograph of the right
# machine in the wrong colour: bright red, on a site built entirely from mint.
#
# It rotates hue and keeps each pixel's saturation and value. That is the whole
# trick. Painting the matched pixels a flat mint would have destroyed the
# machine - the red panels carry all their shading, the sheen down the top
# bend, the shadow under the ram, the darker red where the guard turns away
# from the light. Those live in S and V, not in H, so moving H alone repaints
# the panel and keeps the metal looking like metal.
#
# The hue window has to be tight, and --sat-min is what makes it safe. Red sits
# next to orange on the wheel, and this photograph has an orange foot pedal
# that must not turn mint; it also has a white background, grey castings and
# black trim, which are all near-zero saturation and would otherwise pick up a
# colour cast from any hue rotation. A window of 350-12 degrees with sat-min
# 0.35 takes the body panels and the lever handles and leaves the pedal, the
# steel and the operator alone.
#
# --protect <mask.png> holds an area back, and on this photograph it is not
# optional. Skin is the problem: an ear is the reddest thing on a person, and
# the press brake's panels sit at hue 2-4 while the operator's ear runs about
# 5-14, so no hue window narrow enough to spare the ear still catches the
# panel. Trying it turned his ear mint and put a green edge on his nose and
# lip. A rectangle over him is no good either - red panel surrounds him on
# three sides and would be left behind in the box. What works is a mask of the
# man himself, which rembg produces perfectly here: it reads a person as the
# subject and ignores the machine entirely, the very behaviour that made it
# useless for cutting this plate out.
#
# Everything red goes, including the emergency stops - keeping those red would
# mean protecting them by position, and a mint e-stop reads as styling where a
# lone red button on a mint machine reads as a mistake in the retouch.
#
# Hue is in degrees, 0-360, and --from wraps past 360 so red can be given as
# 350 12. Run it before tools/unit-cutout.py: white has no saturation, so the
# studio sweep is untouched and the matte is made from the finished colours.
# ==========================================================================
import sys
import numpy as np
from PIL import Image

if len(sys.argv) < 3:
    sys.exit("usage: python tools/unit-recolour.py <src> <out> "
             "--from <lo> <hi> --to <deg> [--sat-min f] [--val-min f]")
SRC, OUT = sys.argv[1], sys.argv[2]

def opt(name, n, default):
    if name not in sys.argv:
        return default
    k = sys.argv.index(name)
    vals = [float(v) for v in sys.argv[k + 1:k + 1 + n]]
    return vals if n > 1 else vals[0]

FROM = opt("--from", 2, [350.0, 12.0])
TO = opt("--to", 1, 163.0)          # #2BE3B0 sits at 163 degrees
SAT_MIN = opt("--sat-min", 1, 0.35)
VAL_MIN = opt("--val-min", 1, 0.12)
# --only <x0 y0 x1 y1> restricts the whole operation to one box. Cheaper and
# clearer than a mask when the thing to change is somewhere nothing else like
# it lives: the operator's shirt and his trousers are both blue and only ~14
# degrees apart in hue, but the shirt is the only blue in the upper body box.
ONLY = None
if "--only" in sys.argv:
    k = sys.argv.index("--only")
    ONLY = [int(float(v)) for v in sys.argv[k + 1:k + 5]]

PROTECT = None
if "--protect" in sys.argv:
    PROTECT = sys.argv[sys.argv.index("--protect") + 1]
PROTECT_LEVEL = opt("--protect-level", 1, 0.5)
# --val-scale lifts brightness on the pixels being recoloured, and it exists
# because hue rotation alone cannot make a dark thing mint. The Heavy Machinery
# operator's shirt is navy at value 0.15-0.20: rotate its hue and you get a
# teal so dark it reads as black on a dark section. Scaling value afterwards
# keeps the shading - the folds stay in proportion to each other - while
# putting the garment in a range where the colour is actually legible.
VAL_SCALE = opt("--val-scale", 1, 1.0)
SAT_SCALE = opt("--sat-scale", 1, 1.0)
PROTECT_ERODE = int(opt("--protect-erode", 1, 1))

im = Image.open(SRC).convert("RGBA")
rgba = np.array(im).astype(np.float32) / 255.0
rgb, alpha = rgba[:, :, :3], rgba[:, :, 3]

mx = rgb.max(axis=2)
mn = rgb.min(axis=2)
d = mx - mn
v = mx
s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0.0)

# hue in degrees, the usual six-sector form
r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
h = np.zeros_like(mx)
nz = d > 1e-6
rm = nz & (mx == r)
gm = nz & (mx == g) & ~rm
bm = nz & (mx == b) & ~rm & ~gm
h[rm] = (60 * ((g[rm] - b[rm]) / d[rm])) % 360
h[gm] = 60 * (2 + (b[gm] - r[gm]) / d[gm])
h[bm] = 60 * (4 + (r[bm] - g[bm]) / d[bm])

lo, hi = FROM
in_hue = (h >= lo) | (h <= hi) if lo > hi else (h >= lo) & (h <= hi)
sel = in_hue & (s >= SAT_MIN) & (v >= VAL_MIN) & (alpha > 0.02)

if ONLY:
    box = np.zeros_like(sel)
    x0b, y0b, x1b, y1b = ONLY
    box[y0b:y1b, x0b:x1b] = True
    sel &= box

if PROTECT:
    pm = np.array(Image.open(PROTECT).convert("L")).astype(np.float32) / 255.0
    if pm.shape != sel.shape:
        sys.exit("protect mask is %s, image is %s" % (pm.shape, sel.shape))
    # The mask's own 50% contour is the subject's outline, and that is the
    # level to cut at. Protecting everything the mask touches at all (>0.06)
    # sounds safer and is worse: a segmentation matte feathers outward, so the
    # band it half-covers is background, and holding that back left a red
    # outline traced around the whole operator - the one thing worse than a
    # mint ear.
    keep = pm > PROTECT_LEVEL
    # ...and then pulled in a pixel, because even the 50% contour leaves a
    # hairline of panel behind. The pixels this hands back are half subject and
    # half background; recolouring them is right, since a mint hairline against
    # a mint panel is invisible while a red one is the only thing you see.
    from scipy import ndimage as _nd
    keep = _nd.binary_erosion(keep, iterations=PROTECT_ERODE)
    held = sel & keep
    sel = sel & ~keep
    print("  protected %d px inside %s" % (int(held.sum()), PROTECT))

h2 = np.where(sel, TO, h)
if VAL_SCALE != 1.0:
    v = np.where(sel, np.clip(v * VAL_SCALE, 0, 1), v)
if SAT_SCALE != 1.0:
    s = np.where(sel, np.clip(s * SAT_SCALE, 0, 1), s)

# back to rgb, S and V carried through untouched
c = v * s
hp = h2 / 60.0
x = c * (1 - np.abs((hp % 2) - 1))
m = v - c
z = np.zeros_like(c)
i = np.floor(hp).astype(int) % 6
r2 = np.select([i == 0, i == 1, i == 2, i == 3, i == 4, i == 5], [c, x, z, z, x, c]) + m
g2 = np.select([i == 0, i == 1, i == 2, i == 3, i == 4, i == 5], [x, c, c, x, z, z]) + m
b2 = np.select([i == 0, i == 1, i == 2, i == 3, i == 4, i == 5], [z, z, x, c, c, x]) + m

out = np.dstack([r2, g2, b2, alpha])
out = np.clip(out, 0, 1) * 255.0
Image.fromarray(out.astype(np.uint8)).save(OUT)
print("%s -> %s  recoloured %.1f%% of pixels (hue %g-%g to %g)"
      % (SRC, OUT, 100.0 * sel.mean(), lo, hi, TO))
