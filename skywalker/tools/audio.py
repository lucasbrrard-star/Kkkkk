# Gera os sons do jogo com a API do ElevenLabs (efeitos sonoros + narração em PT-BR)
# e converte para public/assets/audio. Os arquivos de origem ficam em tools/cache/audio.
# Uso: python3 tools/audio.py            (gera só o que falta)
# A chave vem do ambiente (XI_API_KEY) ou do proxy da sessão.
import json, os, subprocess, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache", "audio")
OUT = os.path.join(HERE, "..", "public", "assets", "audio")
KEY = os.environ.get("XI_API_KEY", "proxy")
API = "https://api.elevenlabs.io/v1"

NARRADOR = "nPczCjzI2devNBz1zQrb"   # Brian — Deep, Resonant (premade; fala PT-BR pelo modelo multilíngue)
CRIANCA = "cgSgspJ2msm6clMCkdW9"    # Jessica — voz clara, aguda (vira "criança" com pitch no jogo)

# chave: (descrição, duração s, loop?)
SFX = {
    "scream": ("Terrifying inhuman monster shriek in a dark forest, a distorted deer bellow turning into a screaming wail, horror creature, wet and raspy", 3.0, False),
    "growl": ("Deep guttural monster growl and wet raspy breathing very close behind you, horror creature, intimate", 4.0, False),
    "transform": ("Bones cracking and snapping, body twisting and contorting, wet flesh tearing, horror creature transformation", 3.0, False),
    "stinger": ("Horror jumpscare stinger, sudden loud dissonant orchestral hit with metallic screech", 2.0, False),
    "ambience": ("Dark pine forest at night ambience, soft wind in the trees, distant owl hooting, crickets, eerie and quiet, no music", 20.0, True),
    "drone": ("Low ominous horror drone, deep dark rumbling ambient tension, slow pulsing, cinematic, no melody", 20.0, True),
    "deer_call": ("A single deer bleat call in a dark forest at night, distant, slightly unnatural and wrong", 3.0, False),
    "creature_run": ("Heavy fast footsteps of a large creature running through forest undergrowth, branches snapping, leaves crunching", 4.0, False),
    "creature_pain": ("Monster screeching in pain after being shot, high pitched agonized shriek", 2.0, False),
    "creature_death": ("Huge monster dying, long agonized screech fading into gurgling and heavy body falling on leaves", 5.0, False),
    "whispers": ("Creepy unintelligible whispers, many ghostly voices murmuring, horror", 6.0, False),
    "child_cry": ("Distant child crying alone in a dark forest at night, echoing far away", 5.0, False),
    "gunshot": ("Single loud revolver gunshot outdoors in a forest at night, sharp crack with long echo through the trees", 2.0, False),
    "reload": ("Revolver reload: cylinder swings open, bullets inserted one by one, cylinder snaps shut", 3.0, False),
    "footsteps": ("Slow footsteps of one person walking on dry leaves and twigs on a forest floor, clear separate steps", 6.0, False),
    "twig": ("Single loud dry twig snapping in a quiet forest at night", 1.0, False),
    "hurt": ("Sharp claws slashing flesh and a man grunting in pain", 1.5, False),
    "music_box": ("Eerie slow music box lullaby, slightly out of tune, melancholic horror", 15.0, True),
    "clue": ("Dark eerie low piano note with long reverb, ominous discovery sting", 3.0, False),
}

# chave: (voz, texto)
FALAS = {
    "v_intro": (NARRADOR, "Três noites. Três noites desde que aquela coisa levou o Theo. A polícia diz que foi um animal. Mas eu vi os chifres. Eu vi aquilo andar sobre duas pernas. Os velhos daqui chamam de Skywalker. Hoje eu vou encontrá-lo… e vou matá-lo."),
    "v_clue1": (NARRADOR, "O tênis do Theo… ainda está molhado. Ele passou por aqui."),
    "v_clue2": (NARRADOR, "O ursinho dele. Ele nunca dormia sem ele… Aguenta firme, filho."),
    "v_clue3": (NARRADOR, "O carrinho que eu fiz pra ele. Tem marcas de garras na madeira."),
    "v_clue4": (NARRADOR, "O rádio dele… Theo? Theo, é o papai! Responde!"),
    "v_clue5": (NARRADOR, "Um desenho… um homem com chifres. Ele sabia. Ele já tinha visto essa coisa."),
    "v_lair": (NARRADOR, "Esse cheiro… é aqui. Apareça, desgraçado!"),
    "v_deer": (NARRADOR, "Aquele cervo… não está respirando."),
    "v_followed": (NARRADOR, "Tem alguma coisa me seguindo."),
    "v_battery": (NARRADOR, "A bateria está acabando."),
    "v_win": (NARRADOR, "Acabou. Acabou… Theo? Theo!"),
    "k_help": (CRIANCA, "Papai… me ajuda… papai…"),
    "k_papai": (CRIANCA, "Papai?"),
}


def post(url, body, out):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"xi-api-key": KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r, open(out + ".part", "wb") as f:
        f.write(r.read())
    os.replace(out + ".part", out)


def main():
    os.makedirs(CACHE, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    only = sys.argv[1:] or None
    for k, (text, dur, loop) in SFX.items():
        src = os.path.join(CACHE, k + ".mp3")
        if (only and k not in only) or os.path.exists(src): continue
        body = {"text": text, "duration_seconds": dur, "prompt_influence": 0.55}
        if loop: body["loop"] = True
        try: post(f"{API}/sound-generation?output_format=mp3_44100_128", body, src); print("ok   ", k, flush=True)
        except Exception as e: print("FALHOU", k, e, flush=True)
    for k, (voice, text) in FALAS.items():
        src = os.path.join(CACHE, k + ".mp3")
        if (only and k not in only) or os.path.exists(src): continue
        body = {"text": text, "model_id": "eleven_v4_turbo", "language_code": "pt",
                "voice_settings": {"stability": 0.45, "similarity_boost": 0.8, "style": 0.35}}
        try: post(f"{API}/text-to-speech/{voice}?output_format=mp3_44100_128", body, src); print("ok   ", k, flush=True)
        except Exception as e: print("FALHOU", k, e, flush=True)
    # conversão: mono 96 kb/s para efeitos e vozes, estéreo para ambientes em loop
    for f in sorted(os.listdir(CACHE)):
        if not f.endswith(".mp3"): continue
        k = f[:-4]
        stereo = k in ("ambience", "drone", "music_box")
        dst = os.path.join(OUT, k + ".mp3")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", os.path.join(CACHE, f),
                        "-ac", "2" if stereo else "1", "-b:a", "112k" if stereo else "80k", dst], check=True)
    print("convertidos:", len(os.listdir(OUT)))


if __name__ == "__main__":
    main()
