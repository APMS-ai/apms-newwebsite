# ==========================================================================
# APMS.ai - tools/unit-defringe.py
#   python tools/unit-defringe.py <slug> [erode-px]
#
# Cleans the edge of an already cut-out unit, in place. Use it when a cut-out
# from tools/unit-cutout.py is right in outline but wrong at the boundary.
#
# The quadruped needed this. It is a light grey machine photographed against a
# white sweep, and on that pairing the segmentation cannot tell the last two or
# three pixels of machine from the first two or three pixels of studio: it
# keeps both. Against the white page it came from that is invisible. Against
# the dark section it becomes a bright speckled rim tracing the lit side of
# every leg, which reads as a bad cut-out long before anyone works out why.
#
# Keying the rim by brightness was the obvious first thought and is wrong here
# for the same reason it was wrong in unit-cutout.py: this machine's own body
# is near-white, so any brightness threshold that catches the rim also eats
# the panels. What separates rim from body is not colour, it is position - the
# rim is only ever within a few pixels of the edge. So this works on the matte
# and never on the colours:
#
#   1. a median pass on alpha, which removes the speckle - single stray pixels
#      alternating in and out along the contour - without moving the contour
#   2. blur the matte hard, then threshold it back to hard edges. This is the
#      step that matters. Eroding alone was tried first and is not enough: it
#      lifts the bright rim off the lit edge but leaves the ragged outline the
#      rim was sitting on, so the leg still reads as badly cut. Blurring and
#      re-thresholding straightens a jagged contour into a smooth one, because
#      a notch a few pixels wide cannot survive a 3px blur and still clear the
#      threshold, while the body of the machine clears it everywhere.
#   3. a minimum pass, which pulls the whole matte inward by erode-px and takes
#      what is left of the rim with it
#   4. a slight blur, to give back the soft edge that step 3 leaves hard
#
# The threshold is above the midpoint on purpose. At 128 the smoothed contour
# lands back roughly where the ragged one was, rim included; at 170 it settles
# just inside it. Erosion is the blunt part: it discards a few pixels of real
# machine along with the rim. At the size these plates are displayed that is
# invisible, and a hairline of missing leg reads as nothing while a bright rim
# reads as a mistake. The defaults are what the quadruped wanted, judged by
# compositing the result on the section's own background at 2x.
#
# The .webp is the master here, not the .png - unit-cutout.py writes the webp
# straight from the cut-out, and until this was fixed the png went through a
# quantize() that damaged the alpha. Both are rewritten from the webp.
#
# This is lossy on top of lossy: the webp it reads was written at quality 88,
# so re-encoding costs a little. Running it twice on the same slug costs twice.
# If the original studio render is still to hand, prefer re-cutting.
# ==========================================================================
import sys
from PIL import Image, ImageFilter

if len(sys.argv) < 2:
    sys.exit("usage: python tools/unit-defringe.py <slug> [erode-px]")
SLUG = sys.argv[1]
ERODE = int(sys.argv[2]) if len(sys.argv) > 2 else 3
MEDIAN = 5     # de-speckle window
SMOOTH = 3.0   # contour-straightening blur
LEVEL = 170    # re-threshold, deliberately above the midpoint - see above

src = "assets/unit-%s.webp" % SLUG
im = Image.open(src).convert("RGBA")
r, g, b, a = im.split()

a = a.filter(ImageFilter.MedianFilter(MEDIAN))          # 1. de-speckle
a = a.filter(ImageFilter.GaussianBlur(SMOOTH))          # 2. straighten the
a = a.point(lambda v: 255 if v >= LEVEL else 0)         #    ragged contour
a = a.filter(ImageFilter.MinFilter(ERODE * 2 + 1))      # 3. pull inward
a = a.filter(ImageFilter.GaussianBlur(0.8))             # 4. soften again

out = Image.merge("RGBA", (r, g, b, a))
# Deliberately NOT re-cropped to the new bbox. unit-cutout.py pads every plate
# with clear space on purpose, and the finished shape is quoted back as
# --unit-ratio in css/sections/pseq.css - trimming here would eat the clear
# space and silently change the ratio the stylesheet is holding, which
# letterboxes the machine inside the wrong shaped box.

out.save(src, "WEBP", quality=90, method=6)
out.save("assets/unit-%s.png" % SLUG, "PNG", optimize=True)
print("unit-%s  %dx%d  eroded %dpx  (--unit-ratio: %d / %d)"
      % (SLUG, out.size[0], out.size[1], ERODE, out.size[0], out.size[1]))
