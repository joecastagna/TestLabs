"""
Cat coat classifier.

EfficientNet-B0 checks whether the image likely contains a cat.
HSV colour analysis determines the coat type. Colour analysis is
the primary driver (85 % weight); EfficientNet only provides a weak
confidence nudge because it was trained on ImageNet object classes,
not cat coat patterns.
"""

import logging
import numpy as np
from PIL import Image
import torch
import torchvision.transforms as transforms

logger = logging.getLogger(__name__)

_CAT_IMAGENET_INDICES = frozenset({281, 282, 283, 284, 285})

_transform = transforms.Compose([
    transforms.Resize(256),
    transforms.CenterCrop(224),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

_model = None


def _load_model():
    global _model
    if _model is not None:
        return _model
    try:
        import timm
        _model = timm.create_model("efficientnet_b0", pretrained=True)
        _model.eval()
        logger.info("EfficientNet-B0 loaded")
    except Exception as exc:
        logger.error("Failed to load model: %s", exc)
        _model = None
    return _model


def _cat_confidence(img: Image.Image) -> float:
    """Return a [0, 1] score reflecting how likely this image contains a cat."""
    model = _load_model()
    if model is None:
        return 0.5
    try:
        tensor = _transform(img).unsqueeze(0)
        with torch.no_grad():
            probs = torch.softmax(model(tensor), dim=1)[0]
        raw = sum(probs[i].item() for i in _CAT_IMAGENET_INDICES)
        return min(raw * 8.0, 1.0)
    except Exception as exc:
        logger.warning("Inference failed: %s", exc)
        return 0.5


def _colour_features(img: Image.Image) -> dict:
    """
    Compute pixel-level HSV features from a 128×128 thumbnail.
    H: [0, 360]  S: [0, 1]  V: [0, 1]
    """
    arr = np.array(img.resize((128, 128), Image.LANCZOS), dtype=np.float32) / 255.0
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]

    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    delta = max_c - min_c

    v = max_c
    s = np.where(max_c > 1e-6, delta / max_c, 0.0)

    h = np.zeros_like(r)
    m_r = (max_c == r) & (delta > 1e-6)
    m_g = (max_c == g) & (delta > 1e-6)
    m_b = (max_c == b) & (delta > 1e-6)
    h[m_r] = ((g[m_r] - b[m_r]) / delta[m_r] * 60.0) % 360.0
    h[m_g] = (b[m_g] - r[m_g]) / delta[m_g] * 60.0 + 120.0
    h[m_b] = (r[m_b] - g[m_b]) / delta[m_b] * 60.0 + 240.0

    n = float(arr.shape[0] * arr.shape[1])

    # Black: very dark AND mostly unsaturated.
    # S < 0.40 guards against dark brown stripes (S ≈ 0.35–0.50 at low V)
    # being counted as black coat pixels.
    black_px = (v < 0.18) & (s < 0.40)

    # White: bright and colourless.
    white_px = (v > 0.80) & (s < 0.16)

    # Orange / ginger: hue 10–45 °, HIGH saturation (> 0.62).
    # True ginger cats have S ≥ 0.65.  The raised threshold deliberately
    # excludes warm brown tabby base coat (S ≈ 0.45–0.60) which shares the
    # same hue range but is far less saturated.
    orange_px = (h >= 10) & (h <= 45) & (s > 0.62) & (v > 0.28)

    # Brown / warm dark: tabby base coat and calico dark patches.
    # Warm hue, moderate saturation, medium-to-dark value.
    # Upper S bound (0.72) prevents true orange from leaking in.
    brown_px = (h >= 15) & (h <= 55) & (s > 0.18) & (s <= 0.72) & (v > 0.12) & (v <= 0.60)

    # Grey / blue: neutral hue, medium brightness.
    grey_px = (s < 0.22) & (v >= 0.22) & (v <= 0.78)

    return {
        "black":  float(black_px.sum()) / n,
        "white":  float(white_px.sum()) / n,
        "orange": float(orange_px.sum()) / n,
        "brown":  float(brown_px.sum()) / n,
        "grey":   float(grey_px.sum()) / n,
        "v_mean": float(v.mean()),
        "s_mean": float(s.mean()),
    }


def _classify_by_colour(f: dict) -> tuple[str, float]:
    """
    Map HSV pixel fractions to a coat type and a base confidence score.

    Priority order is chosen so that the most distinctive pixel signatures
    are checked first, preventing cascade false positives.
    """
    black  = f["black"]
    white  = f["white"]
    orange = f["orange"]
    brown  = f["brown"]
    grey   = f["grey"]
    v_mean = f["v_mean"]
    s_mean = f["s_mean"]

    # ── Black ─────────────────────────────────────────────────────────────────
    # Require low white fraction so a predominantly-black tuxedo cat (e.g.
    # 75 % black / 25 % white) does not end up here instead of "tuxedo".
    # Require low brown fraction to prevent dark tabbies from being classified
    # as black (they have significant warm-brown pixels alongside the dark ones).
    if black > 0.52 and white < 0.12 and brown < 0.25 and v_mean < 0.30:
        return "black", min(0.62 + black * 0.30, 0.93)

    # ── White ─────────────────────────────────────────────────────────────────
    if white > 0.52:
        return "white", min(0.62 + white * 0.30, 0.93)

    # ── Calico ────────────────────────────────────────────────────────────────
    # Three distinct regions: orange, dark (black + brown), white.
    # Checked before the dominant-orange gate because a calico can have
    # ~30 % orange while also showing clear white and dark patches.
    dark_calico = black + brown
    if orange > 0.10 and white > 0.12 and dark_calico > 0.08:
        richness = orange + white + dark_calico
        return "calico", min(0.58 + richness * 0.18, 0.90)

    # ── Orange / ginger (dominant) ────────────────────────────────────────────
    if orange > 0.40:
        return "orange", min(0.60 + orange * 0.35, 0.93)

    # ── Tuxedo ────────────────────────────────────────────────────────────────
    # Substantial black AND white in similar amounts; little orange.
    if black > 0.20 and white > 0.16 and orange < 0.08:
        balance = min(black, white) / (max(black, white) + 1e-6)
        return "tuxedo", min(0.58 + (black + white) * 0.22 + balance * 0.10, 0.90)

    # ── Tabby ─────────────────────────────────────────────────────────────────
    # Brown/warm tones mixed with grey/neutral pixels at medium saturation.
    # Require brown > 0.10 so that a solid grey/blue cat (brown ≈ 0) does
    # not satisfy this rule on the strength of its grey fraction alone.
    if (brown + grey) > 0.38 and brown > 0.10 and s_mean > 0.06 and orange < 0.22:
        return "tabby", min(0.56 + (brown + grey) * 0.28, 0.88)

    # ── Orange / ginger (lighter coat) ───────────────────────────────────────
    if orange > 0.14:
        return "orange", min(0.50 + orange * 0.52, 0.84)

    # ── Spotted ───────────────────────────────────────────────────────────────
    regions = sum(1 for x in (black, white, orange, brown) if x > 0.10)
    if regions >= 2 and max(black, white, orange) < 0.42:
        return "spotted", min(0.50 + regions * 0.06, 0.76)

    # ── Weak-signal fallback ──────────────────────────────────────────────────
    # Use only brown (not grey) for the tabby score so that solid grey/blue
    # cats don't end up classified as tabby when no warm pixels are present.
    candidates = {
        "black":  black,
        "white":  white,
        "orange": orange,
        "tabby":  brown,
    }
    best, best_val = max(candidates.items(), key=lambda kv: kv[1])
    if best_val > 0.22:
        coat = "tabby" if best == "tabby" else best
        return coat, min(0.44 + best_val * 0.26, 0.72)

    return "other", 0.38


def classify_coat(img: Image.Image) -> tuple[str, float]:
    """
    Classify a cat's coat type from an image.
    Returns (coat_type, confidence) where coat_type is one of:
    tabby, tuxedo, orange, black, white, calico, spotted, other.
    """
    features = _colour_features(img)
    coat_type, colour_conf = _classify_by_colour(features)
    cat_prob = _cat_confidence(img)

    # Colour analysis is the primary signal (85 %); EfficientNet provides a
    # small boost when it is confident a cat is present.
    blended = colour_conf * (0.85 + cat_prob * 0.15)
    return coat_type, round(min(blended, 0.95), 4)
