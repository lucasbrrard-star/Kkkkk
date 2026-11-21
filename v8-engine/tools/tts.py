"""Generate narration lines with ElevenLabs (with character timestamps)."""
import json, sys, base64, urllib.request, os
VOICE = 'pNInz6obpgDQGcFmaJgB'  # premade "Adam" (free-tier compatible)
LINES = json.load(open(os.path.join(os.path.dirname(__file__), 'narration.json')))
only = sys.argv[1:]
for ln in LINES:
    if only and ln['id'] not in only: continue
    out = f"{ln['id']}.mp3"
    if os.path.exists(out) and not only: continue
    body = {"text": ln['text'], "model_id": "eleven_multilingual_v2", "language_code": "pt", "seed": 7,
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.8, "style": 0.2, "use_speaker_boost": True, "speed": ln.get('speed', 1.0)}}
    req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE}/with-timestamps?output_format=mp3_44100_128",
        data=json.dumps(body).encode(), headers={"xi-api-key": "dummy", "Content-Type": "application/json"})
    try:
        d = json.loads(urllib.request.urlopen(req, timeout=180).read())
    except urllib.error.HTTPError as e:
        print('ERR', ln['id'], e.code, e.read()[:300]); break
    open(out, 'wb').write(base64.b64decode(d['audio_base64']))
    json.dump(d.get('alignment'), open(f"{ln['id']}.align.json", 'w'))
    a = d.get('alignment') or {}
    print('ok', ln['id'], 'speech end', (a.get('character_end_times_seconds') or [0])[-1])
