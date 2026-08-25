# ==========================================================================
# APMS.ai - tools/unit-cutout.py
#   python tools/unit-cutout.py <slug> <source-image>
#
# Builds assets/unit-<slug>.webp and .png - the photographed units on the
# fleet slide of motion-ai.html - from the original studio renders.
#
# Every source is a machine lit against a dark studio background, often with
# a large halo. Dropped straight onto the page each one is a dark rectangle
# on a not-quite-black gradient, and no in-browser trick hides that:
# mix-blend-mode: screen cannot reach the section behind, because the 3D
# staging makes a stacking context of every ancestor, and no baked backdrop
# colour matches a gradient. So the machines are cut out here, once.
#
# Keying on brightness was tried first and does not work on these
# photographs: the halo is as bright as the machine, so any threshold either
# keeps a grey cloud around the silhouette or eats the machine's own black
# panels. This uses rembg, which segments the subject rather than the light.
#
#   pip install rembg onnxruntime
#
# It downloads ~176 MB of model weights to ~/.u2net on first run.
#
# The model matters more than anything else here, so it is pinned. Two
# earlier choices both failed on real inputs, and both failures look like a
# finished cut-out until you put it on the page:
#   u2net (rembg's default) cut every propeller off the drone - four dark
#   blades on a dark background - and left a body with stubs.
#   isnet-general-use kept the propellers, but on the press - a white machine
#   shot on a white sweep - it returned a soft matte over the body, which on
#   a dark section reads as a ghost you can see the floor through.
# birefnet-general holds both. It is slower to load, and this is a build
# step that runs when a photograph changes, so that is a fair trade.
#
# After the cut-out: trim to the machine, add a little clear space, and
# write both formats at MAX_EDGE on the long side. It prints the finished
# size - put that in the unit's --unit-ratio in css/sections/pseq.css, or
# the plate letterboxes the machine inside the wrong shaped box.
# ==========================================================================
import sys
from PIL import Image
from rembg import remove, new_session

if len(sys.argv) < 3:
    sys.exit("usage: python tools/unit-cutout.py <slug> <source-image> [--largest]")
SLUG, SRC = sys.argv[1], sys.argv[2]
# --largest keeps only the biggest connected piece of the matte. Off by
# default, because plenty of legitimate units are several disconnected pieces
# once cut - the drone's propeller tips read as islands the moment a blade
# passes behind an arm, and throwing those away would be worse than the
# artifact. Switch it on for a subject lifted out of a busy scene rather than
# off a studio sweep: there the model tends to keep a few stray scraps of
# background clutter it judged part of the subject, and those float in the
# finished plate with nothing attaching them to anything.
LARGEST = "--largest" in sys.argv[3:]

MODEL = "birefnet-general"   # pinned; see the note above before changing it
MAX_EDGE = 1100      # longest side of the finished file
MARGIN = 0.04        # clear space around the machine, as a fraction of its width
HEADROOM = 0.06      # a little more above it than below

cut = remove(Image.open(SRC).convert("RGB"), session=new_session(MODEL))

if LARGEST:
    import numpy as np
    from scipy import ndimage
    a = np.array(cut)[:, :, 3]
    # label on a slightly generous threshold so a piece joined to the rest by
    # only a soft edge still counts as joined, then keep the largest label
    lab, n = ndimage.label(a > 24)
    if n > 1:
        keep = 1 + np.argmax(ndimage.sum(np.ones_like(lab), lab, range(1, n + 1)))
        arr = np.array(cut)
        arr[:, :, 3] = np.where(lab == keep, a, 0)
        cut = Image.fromarray(arr)
        print("  dropped %d stray island(s)" % (n - 1))

cut = cut.crop(cut.getbbox())          # tight to the machine, halo now gone

w, h = cut.size
pad = int(w * MARGIN)
top = int(h * HEADROOM)
out = Image.new("RGBA", (w + pad * 2, h + top + pad), (0, 0, 0, 0))
out.paste(cut, (pad, top))

scale = MAX_EDGE / float(max(out.size))
out = out.resize((round(out.size[0] * scale), round(out.size[1] * scale)), Image.LANCZOS)

out.save("assets/unit-%s.webp" % SLUG, "WEBP", quality=88, method=6)
# The PNG is the fallback for browsers without WebP, so it has to be the same
# picture - which rules out quantize(). Palette PNGs carry alpha in the palette,
# so quantizing bins it: every machine written this way came out with not one
# fully opaque pixel, i.e. faintly see-through over its whole body, and the
# binning turned the soft matte at the edges into a ragged, speckled rim. It
# saved perhaps 30% on a file almost nobody is served. Straight RGBA instead.
out.save("assets/unit-%s.png" % SLUG, "PNG", optimize=True)
print("unit-%s  %dx%d  (--unit-ratio: %d / %d)" % (SLUG, out.size[0], out.size[1], out.size[0], out.size[1]))
