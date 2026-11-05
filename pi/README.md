# Lumin home AI: PC + Raspberry Pi

```
phone / Lumin site -> Vercel -> Tailscale Funnel -> Pi gateway -> PC (big model, if awake)
                                                              -> Pi (small model, if PC is off)
                                                              -> otherwise Lumin's normal hosted chain
```

Only **your** account is ever sent to your hardware (`LOCAL_LLM_USER_IDS`). Everyone else
keeps using the hosted models. If your PC and Pi are both off, Lumin just uses Gemini etc.
and shows no error.

Do the parts in order. Each has a "check" so you know it worked before moving on.

---

## Part 1: the PC (the big model)

**1. Find out what you have** (PowerShell, read-only):

```
Get-CimInstance Win32_Processor | Select Name,NumberOfCores
Get-CimInstance Win32_PhysicalMemory | Select Capacity,Speed
nvidia-smi --query-gpu=name,memory.total --format=csv
Get-ComputerInfo | Select WindowsProductName
```

**2. Install Ollama** from https://ollama.com/download (Windows). It starts on login and
runs in the tray.

**3. Let your home network reach it.** Ollama only listens on the PC by default.
Settings -> search "environment variables" -> *Edit environment variables for your account*
-> New:

- `OLLAMA_HOST` = `0.0.0.0:11434`
- `OLLAMA_KEEP_ALIVE` = `30m` (keeps the model loaded between questions)

Quit Ollama from the tray and start it again. Allow it through Windows Firewall for
**Private** networks only when asked.

**4. Pull models and time them** (commands in a normal terminal):

```
ollama pull qwen3:30b-a3b          # mixture-of-experts, ~19 GB
ollama pull gpt-oss:120b           # bigger, ~65 GB, needs the 96 GB of RAM
ollama pull qwen2.5vl:7b           # looks at images
ollama run qwen3:30b-a3b --verbose "Explain photosynthesis in 5 sentences."
```

`--verbose` prints **eval rate** (tokens/second). Roughly: 15+ is smooth chat,
5 is readable, under 2 is too slow. Write the numbers down: they decide which model
Lumin uses (`PC_MODEL` in step 8).

**5. Note the PC's address and MAC** (needed by the Pi):

```
ipconfig /all
```

Under your **Ethernet** adapter: `IPv4 Address` (e.g. 192.168.1.50) and
`Physical Address` (the MAC, e.g. AA-BB-CC-DD-EE-FF). In your router, give the PC a fixed
("reserved") IP so it never changes.

**6. Wake-on-LAN** (so the Pi can start it from fully off). Needs a **network cable**,
not Wi-Fi.

- BIOS (press Del/F2 at boot): enable *Wake on LAN* / *Power On By PCI-E* / *ErP off*.
  Names vary by motherboard.
- Windows: Device Manager -> Network adapters -> your Ethernet adapter -> Properties ->
  *Power Management*: tick **Allow this device to wake the computer** and **Only allow a
  magic packet**. In *Advanced*, enable **Wake on Magic Packet**.
- Control Panel -> Power Options -> *Choose what the power buttons do* -> untick
  **Turn on fast startup** (it breaks wake from full shutdown on some boards).

**Check:** shut the PC down, then run step 12 (`/wake`). It should power on within seconds.
If it doesn't, the likely cause is the BIOS setting or fast startup. The fallback is a smart
plug with the BIOS option *Restore on AC power loss = Power On*.

**7. (Optional) remote shutdown from your phone.** Settings -> System -> Optional features
-> add **OpenSSH Server**, then in an admin PowerShell: `Start-Service sshd; Set-Service sshd -StartupType Automatic`.
Set up key login from the Pi (`ssh-keygen` on the Pi, then add its `.pub` line to
`C:\ProgramData\ssh\administrators_authorized_keys` if your account is an admin).

---

## Part 2: the Raspberry Pi (always on)

**8. Install Ollama + a small model + Node:**

```
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:3b
sudo apt install -y nodejs        # needs Node 18+; check with: node -v
```

**9. Copy this folder to the Pi** (`pi/gateway.mjs`) and create `/etc/lumin-gateway.env`:

```
GATEWAY_TOKEN=<generate: openssl rand -hex 32>
PC_OLLAMA_URL=http://192.168.1.50:11434
PC_MODEL=gpt-oss:120b
PI_MODEL=qwen2.5:3b
PC_MAC=AA:BB:CC:DD:EE:FF
BROADCAST=192.168.1.255
SHUTDOWN_CMD=ssh -o BatchMode=yes YOURWINDOWSUSER@192.168.1.50 shutdown /s /t 5
```

Keep `GATEWAY_TOKEN` secret. Don't paste it into chat. Then a service so it starts on boot:
`/etc/systemd/system/lumin-gateway.service`

```
[Unit]
Description=Lumin gateway
After=network-online.target

[Service]
EnvironmentFile=/etc/lumin-gateway.env
ExecStart=/usr/bin/node /home/pi/lumin/gateway.mjs
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
```

```
sudo systemctl enable --now lumin-gateway
```

**10. Tailscale** (https://tailscale.com/download/linux): `curl -fsSL https://tailscale.com/install.sh | sh`
then `sudo tailscale up`. Install Tailscale on your phone and laptop too and sign in with
the same account, with two-step sign-in turned on.

**11. Publish only the gateway:** `sudo tailscale funnel --bg 8787`
You get an address like `https://pi.tailXXXX.ts.net`. The gateway rejects anything
without your token, and it only listens on localhost.

**12. Check it works** (from the Pi; replace the token):

```
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8787/status
curl -s -X POST -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8787/wake
```

`/status` shows `{"pc":true,"pi":true}`. If the PC is up, a request to `/v1/chat/completions`
is answered by the PC; if it's off, by the Pi.

---

## Part 3: connect Lumin

**13. Find your Supabase user id** (Supabase dashboard -> Authentication -> Users -> copy
the UUID for your account).

**14. In Vercel -> Project -> Settings -> Environment Variables (Production)**, add:

| Name | Value |
|---|---|
| `LOCAL_LLM_BASE_URL` | `https://pi.tailXXXX.ts.net/v1` |
| `LOCAL_LLM_KEY` | the same value as `GATEWAY_TOKEN` (mark it **Sensitive**) |
| `LOCAL_LLM_MODEL` | any name, e.g. `home` (the gateway swaps in the right model) |
| `LOCAL_LLM_USER_IDS` | your UUID from step 13 |
| `LOCAL_LLM_VISION` | `1` only if the PC model reads images (leave off otherwise) |
| `LOCAL_LLM_TIMEOUT_MS` | `25000` (raise for slow models) |

Redeploy. In Lumin chat, ask something; check Vercel logs for `local/home`.
If your PC and Pi are off, Lumin quietly falls back to the hosted models.

---

## Remote control of the PC from your laptop/phone/Pi

- **Best picture and speed:** Sunshine (on the PC) + Moonlight (on the client).
- **Simple:** RustDesk (free), or Windows Remote Desktop **if** the PC runs Windows Pro
  (Home can't be controlled that way).
- Reach it over Tailscale; do not forward ports on your router.

## Later

- Image generation: ComfyUI on the PC (SDXL runs fine on 8 GB; slow is OK).
- Video: ffmpeg pulls a frame every few seconds + Whisper for the audio, then a vision
  model reads them.
- Natural voice without ElevenLabs: Kokoro or Piper.
- Fine-tuning a small model on free Colab/Kaggle GPUs once you know what it gets wrong.
