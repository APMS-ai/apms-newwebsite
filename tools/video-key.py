# ==========================================================================
# APMS.ai - tools/video-key.py
#   python tools/video-key.py key   <source.mp4>   builds assets/floor-app.*
#   python tools/video-key.py audit [file.webm]    checks what was built
#
#   pip install numpy scipy pillow imageio-ffmpeg
#
# Cuts the studio background out of the app walkthrough on index.html, frame
# by frame, and writes the two encodes the page links.
#
# WHY THIS EXISTS AT ALL
#
# It should not have to. Rotato exports with a transparent background on its
# paid tier, and an exported alpha channel is the truth where everything below
# is inference. Use this only for footage that arrives already flattened onto
# the sweep, and treat a clean re-export as the fix whenever one is available.
#
# WHY THE OBVIOUS METHODS DO NOT WORK
#
# A colour key takes the app's screen with the sweep: both are white. Keying
# on brightness fails for the same reason, and fails again the moment the
# phone turns and shows a flat grey back that no threshold separates from a
# flat white one. rembg, which tools/unit-cutout.py uses for the still plates,
# is no good here either: 20s a frame, it bites into the handset, and on the
# frames where the phone fills the picture it returns almost nothing at all,
# having no salient object to find.
#
# WHAT DOES WORK, AND WHY
#
# 1. THE BOUNDARY, NOT THE COLOUR. The phone has a hard outline - 255 sweep
#    against a 150 back over a pixel or two - and the shadow has none, being
#    the sweep dimming smoothly. So the background is grown from white pixels
#    on the frame edge and allowed through any gently-varying pixel. That
#    carries it through the whole sweep and all of the shadow, and stops dead
#    at the phone.
#
# 2. THE PHONE IS WHATEVER IS INSIDE ITS OWN HULL. Take every pixel that
#    cannot be sweep - the near-black bezel, every saturated pixel of the app
#    - and take their convex hull. Every one of those pixels is on the phone
#    and a phone is convex, so the hull is inside the phone by construction,
#    and nothing inside it is background. That is a statement of fact rather
#    than a threshold, and it is what stops the two failures that a
#    region-by-region rule cannot:
#
#      - a clipped screen, which runs off the frame edge and would otherwise
#        seed a fill that empties the dashboard;
#      - an edge-on phone, whose silver side is as bright and as flat as the
#        sweep beside it, so the two merge into one region and taking that
#        region away puts a bar of the section through the handset.
#
#    It has to be the hull and not the bounding box: where the phone is
#    clipped, what is left of the sweep is exactly the bit outside a rounded
#    corner, which a box contains and a hull does not.
#
# 3. THE WATERMARK IS PAINTED OUT, NOT CUT OUT. It is a warm terracotta -
#    green well above blue - where every red in the app is neutral between
#    those two channels, which is what keeps the Stopped bar and the red
#    counts. Each of its pixels is replaced by its nearest neighbour that is
#    neither watermark nor studio white. Cutting it from the alpha instead
#    works only while it floats clear of the phone; once the rotation swings
#    it over the phone's side, cutting takes a notch out of the phone. Barring
#    white as a source is what stops the repair smearing the sweep across the
#    phone's edge.
#
# WHAT IS LEFT
#
# Run `audit` after `key`, always. It re-reads the file that ships - not the
# masks that made it - and reports three things a still on a white page will
# never show: studio white left opaque, transparency inside the handset, and
# the opaque area jumping between frames. A `jump` on its own is usually the
# rotation rather than a fault; `sweep` and `holes` are faults.
#
# On the current source it reports five frames of 122 carrying either, all of
# them inside the two moments where the phone passes edge-on. That is the
# honest limit of keying white-on-white from a flattened render, and the
# reason the note at the top says to re-export instead.
# ==========================================================================
import os
import subprocess
import sys

import numpy as np
from scipy import ndimage
from scipy.spatial import ConvexHull
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()

W, H = 1280, 960      # the source's frame, and the finished plate's
FPS_OUT = 30          # the source is 60; a camera move does not need them all
WHITE = 238.0         # the sweep, and nothing on the phone's body
SATCAP = 22
EDGE = 9.0            # gradient that counts as a real boundary
SPECK = 400
GROUND = np.array([9, 20, 28], np.float32)   # what the CSS paints behind it

OUT_WEBM = "assets/floor-app.webm"
OUT_MP4 = "assets/floor-app.mp4"


def frames(src, w=W, h=H, rgba=False):
    fmt = "rgba" if rgba else "rgb24"
    dec = ["-c:v", "libvpx-vp9"] if src.endswith(".webm") else []
    p = subprocess.Popen([FF, "-v", "error"] + dec + ["-i", src, "-f", "rawvideo",
                         "-pix_fmt", fmt, "-"], stdout=subprocess.PIPE)
    n = w * h * (4 if rgba else 3)
    while True:
        buf = p.stdout.read(n)
        if len(buf) < n:
            break
        yield np.frombuffer(buf, np.uint8).reshape(h, w, 4 if rgba else 3)
    p.stdout.close()
    p.wait()


def _tag(a):
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    return (r - g > 45) & (g - b > 12) & (r - b > 60) & (r > 120)


def _hull(core):
    pts = np.argwhere(core)
    if len(pts) < 64:
        return np.zeros(core.shape, bool)
    if len(pts) > 20000:
        pts = pts[:: len(pts) // 20000 + 1]
    try:
        h = ConvexHull(pts)
    except Exception:
        return np.zeros(core.shape, bool)
    yy, xx = np.mgrid[0:core.shape[0], 0:core.shape[1]]
    inside = np.ones(core.shape, bool)
    for A, B, c in h.equations[:, :3]:
        inside &= (A * yy + B * xx + c) <= 1.0
    return inside


def repair(rgb):
    """Paint the watermark out before anything else looks at the frame."""
    a = rgb.astype(np.float32)
    tag = _tag(a)
    if not tag.any():
        return rgb
    lab, n = ndimage.label(tag)
    full = np.zeros_like(tag)
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        sel = lab[sl] == i
        if int(sel.sum()) >= SPECK:
            full[sl] |= ndimage.binary_fill_holes(sel)
    full = ndimage.binary_dilation(full, np.ones((5, 5)))
    if not full.any():
        return rgb
    white = rgb.min(axis=2) >= WHITE
    _, (iy, ix) = ndimage.distance_transform_edt(full | white, return_indices=True)
    out = rgb.copy()
    out[full] = rgb[iy[full], ix[full]]
    return out


def mask(rgb):
    a = rgb.astype(np.float32)
    mn = a.min(axis=2)
    sat = a.max(axis=2) - mn

    grey = ndimage.gaussian_filter(a.mean(axis=2), 1.0)
    grad = np.hypot(ndimage.sobel(grey, axis=1), ndimage.sobel(grey, axis=0)) / 4.0

    white = (mn >= WHITE) & (sat < SATCAP)
    passable = (grad < EDGE) & (sat < SATCAP)

    core = ndimage.binary_closing(((mn < 120) | (sat >= 30)) & ~_tag(a), np.ones((9, 9)))
    phone = _hull(core)

    lab, n = ndimage.label(passable)
    ids = np.concatenate([lab[0][white[0]], lab[-1][white[-1]],
                          lab[:, 0][white[:, 0]], lab[:, -1][white[:, -1]]])
    bg = np.zeros_like(white)
    objs = ndimage.find_objects(lab)
    for i in set(np.unique(ids)) - {0}:
        sl = objs[i - 1]
        sel = lab[sl] == i
        size = int(sel.sum())
        if size < SPECK or (sel & phone[sl]).sum() > 0.5 * size:
            continue
        bg[sl] |= sel

    bg &= ~phone
    subj = ~bg

    # thin offcuts of sweep trail off the phone's corners, joined to it and so
    # beyond any size filter; nothing on the phone is three pixels wide. Then
    # one pixel in, because the fill stops on the soft side of the phone's edge.
    subj = ndimage.binary_opening(subj, np.ones((7, 7)))
    return ndimage.binary_erosion(subj, np.ones((3, 3)), iterations=1)


def alpha(m):
    a = ndimage.gaussian_filter(m.astype(np.float32), 0.8)
    return np.clip((a - 0.35) / 0.3, 0.0, 1.0)


def key(src):
    """WebM/VP9 carries real alpha everywhere but Safari, so the MP4 beside it
    is the same cut composited onto the colour the section paints behind it -
    Safari loses the transparency and nothing else, and no white box either
    way."""
    os.makedirs("assets", exist_ok=True)
    webm = subprocess.Popen(
        [FF, "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba",
         "-s", "%dx%d" % (W, H), "-r", str(FPS_OUT), "-i", "-",
         "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-crf", "32", "-b:v", "0",
         "-deadline", "good", "-cpu-used", "4", "-an", OUT_WEBM], stdin=subprocess.PIPE)
    mp4 = subprocess.Popen(
        [FF, "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba",
         "-s", "%dx%d" % (W, H), "-r", str(FPS_OUT), "-i", "-",
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-preset", "slow",
         "-movflags", "+faststart", "-an", OUT_MP4 + ".tmp.mp4"], stdin=subprocess.PIPE)

    kept = 0
    for i, f in enumerate(frames(src)):
        if i % 2:
            continue
        kept += 1
        f = repair(f)
        al = alpha(mask(f))
        rgb = f.astype(np.float32)
        webm.stdin.write(np.dstack([rgb, al * 255.0]).astype(np.uint8).tobytes())
        comp = rgb * al[..., None] + GROUND * (1 - al[..., None])
        mp4.stdin.write(np.dstack([comp, np.full(al.shape, 255.0)]).astype(np.uint8).tobytes())
    for p in (webm, mp4):
        p.stdin.close()
        p.wait()
    os.replace(OUT_MP4 + ".tmp.mp4", OUT_MP4)
    print("wrote %s and %s: %dx%d, %d frames of %d at %dfps"
          % (OUT_WEBM, OUT_MP4, W, H, kept, i + 1, FPS_OUT))


def audit(path=OUT_WEBM):
    bad, prev = [], None
    for i, f in enumerate(frames(path, rgba=True)):
        rgb = f[:, :, :3].astype(np.float32)
        al = f[:, :, 3].astype(np.float32) / 255.0
        mn = rgb.min(axis=2)
        sat = rgb.max(axis=2) - mn
        opaque = al > 0.6

        core = ndimage.binary_closing(((mn < 120) | (sat >= 30)) & opaque, np.ones((9, 9)))
        hull = _hull(core)
        # the hull stops short of the phone's bright silver rim, so without
        # this the rim reads as leftover sweep all the way round every frame
        near = ndimage.binary_dilation(hull, np.ones((25, 25)))
        cl, cn = ndimage.label(opaque & (mn >= 248) & (sat < 12) & ~near)
        sweep = 0
        if cn:
            sizes = ndimage.sum(np.ones_like(cl), cl, range(1, cn + 1))
            sweep = int(sizes[sizes >= 800].sum())
        holes = int(((al < 0.4) & ndimage.binary_erosion(hull, np.ones((15, 15)))).sum())
        area = float(opaque.mean())
        jump = abs(area - prev) if prev is not None else 0.0
        prev = area

        flag = []
        if sweep > 1500:
            flag.append("sweep=%d" % sweep)
        if holes > 1500:
            flag.append("holes=%d" % holes)
        if jump > 0.12:
            flag.append("jump=%.3f" % jump)
        if flag:
            bad.append((i, " ".join(flag)))

    print("audited %s: %d frames, %d flagged" % (path, i + 1, len(bad)))
    for i, why in bad:
        print("   frame %3d  %s" % (i, why))
    return bad


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in ("key", "audit"):
        sys.exit(__doc__ or "usage: video-key.py key <source.mp4> | audit [file.webm]")
    if sys.argv[1] == "key":
        if len(sys.argv) < 3:
            sys.exit("usage: video-key.py key <source.mp4>")
        key(sys.argv[2])
        audit()
    else:
        audit(sys.argv[2] if len(sys.argv) > 2 else OUT_WEBM)
