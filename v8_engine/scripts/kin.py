"""Cinemática e cronograma do V8 (sem dependência do Blender).

Configuração adotada (documentada no README):
  - V8 90°, virabrequim cross-plane (moentes a 0/90/270/180 graus)
  - ordem de ignição 1-5-4-8-6-3-7-2 (numeração Ford: banco direito 1-4, banco esquerdo 5-8)
  - diâmetro 93,0 mm, curso 92,7 mm, biela 150,7 mm, altura do bloco 227 mm (proporções do 5.0 "Coyote")
  - DOHC, 4 válvulas por cilindro, comandos a 1/2 rotação do virabrequim
Convenções:
  - eixo do virabrequim = Y (frente do motor em -Y); Z para cima
  - ângulo "a" medido de +Z para +X (rotação positiva em torno de +Y => sentido horário visto de frente)
  - banco direito (cil. 1-4) inclinado para -X (a=-45°), banco esquerdo (5-8) para +X (a=+45°)
"""
import math

FPS = 30
NFRAMES = 900
DUR = NFRAMES / FPS

BORE = 0.093
RB = BORE / 2
STROKE = 0.0927
CR = STROKE / 2            # raio da manivela
ROD = 0.1507               # entre centros da biela
DECK = 0.227               # eixo do virabrequim -> face do bloco (ao longo do cilindro)
COMP_H = DECK - (CR + ROD) # pino do pistão -> topo do pistão no PMS (fica rente à face)
SPACING = 0.100            # distância entre cilindros
BANK_OFF = 0.023           # deslocamento entre bancos (largura de uma biela)
PIN_Y0 = -1.5 * SPACING
CLEAR_H = STROKE / 11.0    # altura equivalente da câmara (taxa 12:1)

BANK_ANG = {'R': -45.0, 'L': 45.0}
FIRING = [1, 5, 4, 8, 6, 3, 7, 2]
FIRE_ANGLE = {c: 90.0 * i for i, c in enumerate(FIRING)}
PIN_OFF = [-45.0, 45.0, 225.0, 135.0]   # posição angular de cada moente com theta=0

# Válvulas (graus de virabrequim dentro do ciclo de 720°, 0 = PMS de combustão)
# perfis projetados para tucho plano: o levantamento é a função-suporte do lóbulo
VALVE_EVENTS = {'I': (345.0, 595.0, 0.0100), 'E': (130.0, 375.0, 0.0095)}
LIFT_EXP = 1.2                # perfil sin^1.2: nariz convexo para tucho plano (raio > 0)
SPARK_PSI = 708.0           # 12° antes do PMS
BURN_DEG = 27.0             # duração da combustão (graus)

VALVE_TILT = 20.0           # inclinação das válvulas em relação ao eixo do cilindro
VALVE_X = 0.019             # afastamento lateral do centro da válvula no teto da câmara
VALVE_Y = 0.0205            # afastamento longitudinal (par de válvulas)
ROOF_H0 = 0.014             # altura do cume do teto em "telhado" acima da face
RELIEF = 0.0035             # profundidade dos rebaixos de válvula no pistão
VALVE_R = {'I': 0.0185, 'E': 0.0155}
VALVE_LEN = 0.104
BUCKET_TOP = 0.112          # do assento até o topo do tucho
CAM_RB = 0.0175             # raio de base do came
CAM_DIST = BUCKET_TOP + CAM_RB


def cyl_info(c):
    """banco, índice do moente, y do eixo do cilindro"""
    bank = 'R' if c <= 4 else 'L'
    j = (c - 1) % 4
    y = PIN_Y0 + j * SPACING + (-BANK_OFF / 2 if bank == 'R' else BANK_OFF / 2)
    return bank, j, y


def pin_y(j):
    return PIN_Y0 + j * SPACING


def piston_dist(theta_deg, c):
    """distância eixo do virabrequim -> centro do pino do pistão (ao longo do cilindro)"""
    bank, j, _ = cyl_info(c)
    phi = math.radians(theta_deg + PIN_OFF[j] - BANK_ANG[bank])
    s = CR * math.sin(phi)
    return CR * math.cos(phi) + math.sqrt(ROD * ROD - s * s)


def psi(theta_deg, c):
    return (theta_deg - FIRE_ANGLE[c]) % 720.0


def valve_lift_profile(kind, p):
    o, cl, L = VALVE_EVENTS[kind]
    d = (p - o) % 720.0
    span = cl - o
    if d >= span:
        return 0.0
    u = d / span
    return L * math.sin(math.pi * u) ** LIFT_EXP


# ---------------------------------------------------------------- cronograma do virabrequim
# (tempo s, ângulo acumulado do virabrequim em graus). theta(10 s) = 3240 => cilindro 1 no PMS de admissão.
CRANK_KEYS = [
    (0.0, 0.0), (2.0, 900.0), (4.0, 1800.0), (5.5, 2420.0), (7.0, 2930.0), (8.5, 3140.0),
    (9.4, 3200.0), (10.0, 3240.0), (12.5, 3420.0), (14.6, 3570.0), (15.0, 3585.0), (15.6, 3598.0),
    (16.2, 3614.0), (16.8, 3638.0), (19.5, 3780.0), (20.0, 3810.0), (22.3, 3960.0), (23.5, 4090.0),
    (25.0, 4420.0), (27.5, 5330.0), (30.0, 6420.0),
]


def _pchip_slopes(xs, ys):
    n = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    dlt = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    m[0] = dlt[0]
    m[-1] = dlt[-1]
    for i in range(1, n - 1):
        if dlt[i - 1] * dlt[i] <= 0:
            m[i] = 0.0
        else:
            w1 = 2 * h[i] + h[i - 1]
            w2 = h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / dlt[i - 1] + w2 / dlt[i])
    return m


def pchip(keys):
    xs = [k[0] for k in keys]
    ys = [k[1] for k in keys]
    ms = _pchip_slopes(xs, ys)

    def f(x):
        if x <= xs[0]:
            return ys[0] + ms[0] * (x - xs[0])
        if x >= xs[-1]:
            return ys[-1] + ms[-1] * (x - xs[-1])
        i = max(k for k in range(len(xs) - 1) if xs[k] <= x)
        h = xs[i + 1] - xs[i]
        t = (x - xs[i]) / h
        h00 = 2 * t ** 3 - 3 * t ** 2 + 1
        h10 = t ** 3 - 2 * t ** 2 + t
        h01 = -2 * t ** 3 + 3 * t ** 2
        h11 = t ** 3 - t ** 2
        return h00 * ys[i] + h10 * h * ms[i] + h01 * ys[i + 1] + h11 * h * ms[i + 1]
    return f


crank_theta = pchip(CRANK_KEYS)


def frame_time(frame):
    """quadros do Blender começam em 1"""
    return (frame - 1) / FPS


def crank_speed(t, dt=1e-3):
    return (crank_theta(t + dt) - crank_theta(t - dt)) / (2 * dt)


# ---------------------------------------------------------------- estado dos gases
def smooth(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def signed_phase(p):
    return p - 720.0 if p >= 600.0 else p


def burn_fraction(s):
    u = (s - (SPARK_PSI - 720.0)) / BURN_DEG
    if u <= 0:
        return 0.0
    if u >= 1:
        return 1.0
    return 1.0 - math.exp(-6.9 * u ** 3)


def gas_state(theta_deg, c):
    """parâmetros para o shader dos gases na câmara do cilindro c"""
    p = psi(theta_deg, c)
    s = signed_phase(p)
    k = burn_fraction(s)
    u = (s - (SPARK_PSI - 720.0)) / BURN_DEG
    flame_r = 0.0
    if 0 < u < 1:
        flame_r = 0.082 * (u ** 0.75)
    elif u >= 1 and s < 380:
        flame_r = 1.0
    # mistura fresca
    if -120 <= s <= 30:
        fresh = 1.0
    elif s < 350:
        fresh = 0.0
    else:
        fresh = smooth((s - 350) / 210.0)
    if u >= 1:
        fresh = 0.0
    # temperatura dos gases queimados
    hot = 0.0
    if k > 0 and s < 380:
        hot = k * (1.0 if s < 15 else math.exp(-(s - 15) / 110.0))
    burned = 0.0
    if k > 0:
        if s < 145:
            burned = k
        elif s < 200:
            burned = 1 - 0.4 * smooth((s - 145) / 55)
        elif s < 372:
            burned = 0.6 * (1 - smooth((s - 200) / 172))
    # densidade (compressão)
    dist = piston_dist(theta_deg, c)
    gap = DECK - (dist + COMP_H)
    dens = (STROKE + CLEAR_H) / (gap + CLEAR_H)
    bright = 1.0 + 0.22 * (dens - 1.0) if (s >= 540 or s < 0) else 1.0
    front = 1.0 if 0 < u < 1 else 0.0
    return dict(psi=p, s=s, fresh=fresh, hot=hot, burned=burned, flame_r=flame_r,
                flame_front=front, bright=bright, gap=gap, burn=k)


def phase_name(p):
    if p < 180:
        return 'EXPANSÃO'
    if p < 360:
        return 'ESCAPE'
    if p < 540:
        return 'ADMISSÃO'
    return 'COMPRESSÃO'


def spark_events():
    """lista (tempo, cilindro) de cada centelha nos 30 s"""
    ev = []
    ts = [i / (FPS * 8) for i in range(int(DUR * FPS * 8) + 1)]
    th = [crank_theta(t) for t in ts]
    for c in range(1, 9):
        for i in range(len(ts) - 1):
            a = (th[i] - FIRE_ANGLE[c] - SPARK_PSI) / 720.0
            b = (th[i + 1] - FIRE_ANGLE[c] - SPARK_PSI) / 720.0
            if math.floor(a) != math.floor(b):
                # interpolação linear do cruzamento
                n = math.floor(b)
                fa = a - n
                fb = b - n
                tt = ts[i] + (ts[i + 1] - ts[i]) * (0 - fa) / (fb - fa) if fb != fa else ts[i]
                ev.append((tt, c))
    ev.sort()
    return ev


def spark_intensity(t, c, events):
    v = 0.0
    for (te, ce) in events:
        if ce != c:
            continue
        w = 8.0 / max(1.0, crank_speed(te))      # 8 graus de virabrequim
        w = max(0.07, min(0.45, w))
        d = t - te
        if -0.01 <= d <= w * 1.6:
            v = max(v, math.exp(-max(0.0, d) / (w * 0.45)))
    return v


if __name__ == '__main__':
    for t in [0, 5, 9.85, 10, 12.5, 13, 15, 15.13, 15.5, 16, 16.2, 18.9, 19.5, 22.3, 22.4, 25, 30]:
        th = crank_theta(t)
        print(f't={t:6.2f} theta={th:8.1f} psi1={psi(th, 1):6.1f} {phase_name(psi(th,1)):11s} '
              f'w={crank_speed(t):6.1f}°/s  liftI={valve_lift_profile("I", psi(th,1))*1000:5.2f}mm '
              f'liftE={valve_lift_profile("E", psi(th,1))*1000:5.2f}mm')
    ev = spark_events()
    print('sparks', len(ev), [(round(a, 2), b) for a, b in ev if 14 < a < 17])
    print('COMP_H', COMP_H)
