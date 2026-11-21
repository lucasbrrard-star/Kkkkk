"""V8 kinematics shared by the Blender build, the overlay export and the audio.

Engine frame: crank axis = Y (front of engine at -Y), Z up, origin = crank centre.
Configuration: 90 deg V8, cross-plane crank (pins 0/90/270/180 deg), GM-style
numbering (odd cylinders on the +X bank, front pair = 1/2), firing order
1-8-4-3-6-5-7-2, DOHC with 1 intake + 1 exhaust valve per cylinder.
Cycle angle phi of a cylinder: 0 = TDC at start of intake, 360 = firing TDC.
"""
import math

FPS = 30
NF = 900

# --- geometry (metres) -------------------------------------------------------
R = 0.04635            # crank throw (stroke 92.7 mm)
L = 0.1507             # rod length (centre to centre)
CH = 0.030             # piston compression height (pin -> crown)
DECK = R + L + CH + 0.0005
BORE = 0.092
RB = BORE / 2
PIN_Y = [-0.15, -0.05, 0.05, 0.15]
MAIN_Y = [-0.20, -0.10, 0.0, 0.10, 0.20]
STAG = 0.01125         # bank stagger (half of rod pair width)
BANK_DEG = 45.0
FIRING = [1, 8, 4, 3, 6, 5, 7, 2]
OFF = {c: 90 * i for i, c in enumerate(FIRING)}
PIN_PHASE = [45.0, 135.0, 315.0, 225.0]   # deg, crank pin angle at theta = 0
VALVE_TILT = 12.0      # deg
VALVE_W = 0.021        # valve offset from bore axis (transverse)
ROOF_H = 0.012         # pent-roof apex height above deck
IN_HEAD_R, EX_HEAD_R = 0.0185, 0.0155
STEM_LEN = 0.100       # valve face -> stem tip
BUCKET_H = 0.012
CAM_BASE = 0.018       # cam base circle radius
CAM_NOSE_R = 0.009     # nose circle radius
CAM_NOSE_D = 0.018     # nose circle centre distance  -> 9 mm lift, 240 deg duration
CAM_CLEAR = 0.0003
IN_PEAK, EX_PEAK = 110.0, 610.0          # cycle angle of max lift
SPARK_PHI = 345.0                        # 15 deg BTDC
PLUG_DY = 0.024                          # plug offset towards the rear (+Y)

CYLS = list(range(1, 9))


def side(c):
    return 1 if c % 2 else -1


def beta(c):
    return BANK_DEG * side(c)


def pin(c):
    return (c - 1) // 2


def cyl_y(c):
    return PIN_Y[pin(c)] - STAG * side(c)


def bank_U(c):
    b = math.radians(beta(c))
    return (math.sin(b), 0.0, math.cos(b))


def bank_W(c):
    """Outward transverse unit vector (away from the valley)."""
    b = math.radians(beta(c))
    s = side(c)
    return (s * math.cos(b), 0.0, -s * math.sin(b))


def bank_point(c, u, w, dy=0.0):
    U, W = bank_U(c), bank_W(c)
    return (u * U[0] + w * W[0], cyl_y(c) + dy, u * U[2] + w * W[2])


def valve_axis(c, kind):
    t = math.radians(VALVE_TILT)
    U, W = bank_U(c), bank_W(c)
    sgn = -1 if kind == 'in' else 1
    return (math.cos(t) * U[0] + sgn * math.sin(t) * W[0], 0.0,
            math.cos(t) * U[2] + sgn * math.sin(t) * W[2])


def valve_seat_uw(kind):
    """(u, w) of valve face centre at rest, in bank coordinates."""
    w = -VALVE_W if kind == 'in' else VALVE_W
    du = -abs(w) * math.tan(math.radians(VALVE_TILT))
    return DECK + ROOF_H + du, w


def valve_seat(c, kind):
    u, w = valve_seat_uw(kind)
    return bank_point(c, u, w)


def cam_centre(c, kind):
    a = valve_axis(c, kind)
    p = valve_seat(c, kind)
    d = STEM_LEN + BUCKET_H + CAM_BASE + CAM_CLEAR
    return (p[0] + a[0] * d, p[1], p[2] + a[2] * d)


# --- crank angle schedule ----------------------------------------------------
# (time s, crank angle deg). Cylinder 1 cycle angle == theta (mod 720).
THETA_KEYS = [
    (0.0, -1530.0), (5.0, 270.0), (7.5, 1010.0), (9.0, 1310.0),
    (10.0, 1420.0),            # cyl 1: -20 deg (exhaust/intake overlap)
    (12.6, 1620.0),            # BDC end of intake
    (15.3, 1785.0),            # spark 15 deg BTDC
    (16.0, 1808.0),            # flame front done
    (18.4, 1895.0),
    (20.0, 1935.0),            # exhaust valve opening (490)
    (20.6, 1985.0),
    (23.0, 2160.0),            # TDC end of exhaust
    (25.0, 2700.0),
    (30.0, 6200.0),
]


def _pchip_slopes(xs, ys):
    n = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0:
            m[i] = 0.0
        else:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    m[0] = d[0]
    m[-1] = d[-1]
    return m


_XS = [k[0] for k in THETA_KEYS]
_YS = [k[1] for k in THETA_KEYS]
_MS = _pchip_slopes(_XS, _YS)


def theta_at(t):
    """Crank angle (deg, monotonic) at time t (s)."""
    if t <= _XS[0]:
        return _YS[0] + _MS[0] * (t - _XS[0])
    if t >= _XS[-1]:
        return _YS[-1] + _MS[-1] * (t - _XS[-1])
    i = max(j for j in range(len(_XS) - 1) if _XS[j] <= t)
    h = _XS[i + 1] - _XS[i]
    s = (t - _XS[i]) / h
    h00 = 2 * s ** 3 - 3 * s ** 2 + 1
    h10 = s ** 3 - 2 * s ** 2 + s
    h01 = -2 * s ** 3 + 3 * s ** 2
    h11 = s ** 3 - s ** 2
    return h00 * _YS[i] + h10 * h * _MS[i] + h01 * _YS[i + 1] + h11 * h * _MS[i + 1]


def theta_frame(f):
    """Frame f is 1-based (Blender). Time of frame f = (f-1)/FPS."""
    return theta_at((f - 1) / FPS)


def phi(c, theta):
    return (theta - OFF[c]) % 720.0


def piston_s(c, theta):
    """Distance crank centre -> piston pin along the bank axis."""
    alpha = theta + PIN_PHASE[pin(c)]
    rel = math.radians(alpha - beta(c))
    return R * math.cos(rel) + math.sqrt(L * L - (R * math.sin(rel)) ** 2)


def crankpin_pos(c, theta):
    a = math.radians(theta + PIN_PHASE[pin(c)])
    return (R * math.sin(a), cyl_y(c), R * math.cos(a))


def piston_pin_pos(c, theta):
    s = piston_s(c, theta)
    U = bank_U(c)
    return (s * U[0], cyl_y(c), s * U[2])


def rod_angle(c, theta):
    """Rotation about +Y (rad) that points local +Z from big end to small end."""
    p, q = crankpin_pos(c, theta), piston_pin_pos(c, theta)
    return math.atan2(q[0] - p[0], q[2] - p[2])


def _wrap(d):
    return (d + 360.0) % 720.0 - 360.0


def valve_lift(c, kind, theta):
    peak = IN_PEAK if kind == 'in' else EX_PEAK
    psi = math.radians(_wrap(phi(c, theta) - peak) / 2.0)
    return max(0.0, CAM_NOSE_D * math.cos(psi) + CAM_NOSE_R - CAM_BASE)


def cam_lobe_angle(c, kind):
    """Lobe nose angle (rad) in camshaft-local frame (rotation about +Y,
    0 = +Z). Camshaft rotation = theta/2."""
    a = valve_axis(c, kind)
    eta = math.atan2(a[0], a[2])
    peak = IN_PEAK if kind == 'in' else EX_PEAK
    return eta + math.pi - math.radians((peak + OFF[c]) / 2.0)


def stroke_name(ph):
    ph %= 720.0
    if ph < 180:
        return 'ADMISSAO'
    if ph < 360:
        return 'COMPRESSAO'
    if ph < 540:
        return 'EXPANSAO'
    return 'ESCAPE'


def self_check():
    """Assert that geometry, firing order and valve events are consistent."""
    errs = []
    for c in CYLS:
        tdc = (beta(c) - PIN_PHASE[pin(c)]) % 360
        if abs(tdc - OFF[c] % 360) > 1e-6:
            errs.append(f'cyl {c}: TDC geometry {tdc} != firing slot {OFF[c] % 360}')
        th_tdc = OFF[c] + 360.0
        s_tdc = piston_s(c, th_tdc)
        if abs(s_tdc - (R + L)) > 1e-9:
            errs.append(f'cyl {c}: not at TDC at its firing angle')
        # valves closed during compression / power
        for ph in (240, 300, 360, 420, 480):
            th = OFF[c] + ph
            if valve_lift(c, 'in', th) > 0 or valve_lift(c, 'ex', th) > 0:
                errs.append(f'cyl {c}: valve open at phi={ph}')
        if valve_lift(c, 'in', OFF[c] + 110) < 0.0089:
            errs.append(f'cyl {c}: intake peak wrong')
        if valve_lift(c, 'ex', OFF[c] + 610) < 0.0089:
            errs.append(f'cyl {c}: exhaust peak wrong')
    # firings evenly spaced at 90 deg
    order = sorted(CYLS, key=lambda c: OFF[c])
    if order != FIRING:
        errs.append('firing order mismatch')
    return errs


if __name__ == '__main__':
    e = self_check()
    print('self-check:', 'OK' if not e else e)
    for t in (0, 5, 10, 12.6, 15.3, 16, 20, 23, 25, 30):
        th = theta_at(t)
        print(f't={t:5.1f}s theta={th:8.1f} phi1={phi(1, th):6.1f} {stroke_name(phi(1, th)):10s}'
              f' lift_in={valve_lift(1, "in", th) * 1000:4.1f}mm lift_ex={valve_lift(1, "ex", th) * 1000:4.1f}mm')
    # speed profile
    prev = theta_frame(1)
    mx = 0
    for f in range(2, NF + 1):
        th = theta_frame(f)
        assert th >= prev, 'non monotonic'
        mx = max(mx, th - prev)
        prev = th
    print('max deg/frame', round(mx, 2))
