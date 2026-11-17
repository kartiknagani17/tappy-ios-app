# Deploying the Tappy API (Oracle Cloud Always Free + Cloudflare Tunnel)

This puts the scan API on a free, always-on Arm server and gives it an HTTPS address the iPhone app can use. Nothing on the server is exposed except SSH: Cloudflare Tunnel makes an outbound connection and serves HTTPS for you.

What you end up with:

- `tappy-api` service: the API on `127.0.0.1:8787`, restarted automatically, survives reboots
- `tappy-update` service + daily timer: applies Open Food Facts' daily change files and any new USDA release
- `tappy-import` service + monthly timer: full Open Food Facts re-import (catches anything the daily files missed)
- `tappy-backup` timer: weekly database snapshot (keeps the newest 2)
- `cloudflared` service: your HTTPS address, e.g. `https://api.yourdomain.com`

Time: about 15 minutes of setup, then the data import runs on its own (about 25 minutes for USDA, longer for Open Food Facts).

## 1. Create the Oracle Cloud account

1. Sign up at https://www.oracle.com/cloud/free/. A credit card is required for identity checks; Always Free resources are not charged.
2. **Pick your home region carefully; it can't be changed later.** Free Arm capacity is often sold out in the busiest regions; a less popular region near your users is a good choice.
3. Optional but recommended: upgrade the account to **Pay As You Go** (Billing → Upgrade). Always Free resources stay free, and Oracle stops reclaiming free instances it considers idle. Set a budget alert (Billing → Budgets, e.g. $1) so you'd hear about any charge.

## 2. Create the server

Compute → Instances → **Create instance**:

| Setting | Value |
|---|---|
| Image | Canonical **Ubuntu 24.04** |
| Shape | **Ampere** `VM.Standard.A1.Flex`, e.g. 2 OCPUs / 12 GB memory (stay within the Always Free limits shown in the console) |
| Boot volume | 100 GB (the free allowance is 200 GB total) |
| SSH keys | Upload your public key (or let Oracle generate one and download it) |

Create it and copy the **public IP**. If you get "Out of host capacity", try another availability domain in the same form, or try again later.

## 3. Get the code onto the server

The repo is private, so give the server its own read-only key:

```bash
ssh ubuntu@YOUR_SERVER_IP
```

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 && cat ~/.ssh/id_ed25519.pub
```

On GitHub: repo **Settings → Deploy keys → Add deploy key**, paste that key, leave "Allow write access" off. Then:

```bash
git clone git@github.com:kartiknagani17/tappy-ios-app.git && cd tappy-ios-app
```

## 4. Run the setup script

```bash
sudo bash deploy/oracle/setup.sh
```

It installs Node 22, creates a `tappy` service user, installs the server into `/opt/tappy`, keeps data in `/var/lib/tappy`, writes the config to `/etc/tappy/tappy.env`, starts the services, installs `cloudflared`, and starts the first data import in the background.

Add your OpenAI API key (needed for photo scanning; barcode scanning works without it) with `sudo bash deploy/oracle/set-key.sh OPENAI_API_KEY`; the same script sets `REVENUECAT_SECRET_KEY` and `RESEND_API_KEY` without showing them on screen. Also set, for password-reset emails and feedback your `RESEND_API_KEY`, `EMAIL_FROM` and `SUPPORT_EMAIL` (see the main README, "Accounts"), and `REVENUECAT_SECRET_KEY` so subscribers get unlimited scans (see the main README, "Payments"):

```bash
sudo nano /etc/tappy/tappy.env
```

```bash
sudo systemctl restart tappy-api
```

Watch the import (the API already answers while it runs):

```bash
journalctl -fu tappy-import
```

## 5. Give it an HTTPS address

iOS requires HTTPS, so the app can't call `http://YOUR_SERVER_IP`.

**Permanent address (recommended, needs a domain on Cloudflare; the free plan is fine):**

1. In the Cloudflare dashboard go to **Zero Trust → Networks → Tunnels** and create a tunnel (type *Cloudflared*). Cloudflare reorganizes menus from time to time; search for "Tunnels" if it isn't there.
2. Copy the **token** from the install command it shows (the long string after `--token` or `service install`).
3. Add a **public hostname**: e.g. `api` on `yourdomain.com`, service type `HTTP`, URL `localhost:8787`.
4. On the server:

```bash
sudo CLOUDFLARE_TUNNEL_TOKEN=PASTE_TOKEN bash deploy/oracle/setup.sh
```

**Quick test without a domain** (random `https://….trycloudflare.com` address that changes every time; don't ship this):

```bash
cloudflared tunnel --url http://localhost:8787
```

Check it from your computer:

```bash
curl https://api.yourdomain.com/api/health
```

## 6. Point the app at it

In `eas.json`, set `EXPO_PUBLIC_API_URL` in the `preview` and `production` profiles to your address (it's currently the placeholder `https://api.tappy.company`):

```json
"env": { "EXPO_PUBLIC_API_URL": "https://api.yourdomain.com" }
```

For local development with Expo Go, put the same line in the repo-root `.env` instead.

The same address also serves the legal pages: `https://api.yourdomain.com/privacy` goes in App Store Connect's **Privacy Policy URL** field, and `/terms` can be used as the EULA / Terms of Use link.

## Updating the server

```bash
cd ~/tappy-ios-app && git pull && sudo bash deploy/oracle/setup.sh
```

Re-running is safe: it updates code, dependencies and services, and never overwrites `/etc/tappy/tappy.env` or the database.

Servers set up before live refresh existed have `OFF_LIVE_LOOKUP=false` in `/etc/tappy/tappy.env`. Set it to `true` (and put a real contact email in `OFF_USER_AGENT`, which Open Food Facts requires), then `sudo systemctl restart tappy-api`. Products older than `OFF_REFRESH_AFTER_DAYS` (default 180) are then refreshed from Open Food Facts when someone scans them.

## Day-to-day

| Task | Command |
|---|---|
| API logs | `journalctl -u tappy-api -f` |
| Restart after config change | `sudo systemctl restart tappy-api` |
| Daily data update now | `sudo systemctl start tappy-update` (logs: `journalctl -fu tappy-update`) |
| Full re-import now | `sudo systemctl start tappy-import` |
| Label photos waiting for review | `cd /opt/tappy/server && sudo -u tappy env TAPPY_ENV_FILE=/etc/tappy/tappy.env node --disable-warning=ExperimentalWarning src/cli.ts review` |
| Approve / reject a label photo | same command with `approve <id>` or `reject <id>` instead of `review` |
| Product counts, contributions, vision spend | `cd /opt/tappy/server && sudo -u tappy env TAPPY_ENV_FILE=/etc/tappy/tappy.env node --disable-warning=ExperimentalWarning src/cli.ts stats` |
| Read feedback from the app | `cd /opt/tappy/server && sudo -u tappy env TAPPY_ENV_FILE=/etc/tappy/tappy.env node --disable-warning=ExperimentalWarning src/cli.ts feedback` |
| Backup now | `sudo systemctl start tappy-backup` (files in `/var/lib/tappy/backups`) |
| Timers | `systemctl list-timers 'tappy-*'` |

Notes:

- **Disk:** the USDA import alone produced a 2.2 GB database; Open Food Facts adds more, and the raw downloads take about 1.4 GB. 100 GB is plenty.
- **During the monthly refresh** the import shares the database with the API, so some scans can take up to about a second longer while it runs (it runs at low priority, early on the 1st).
- **Extra safety:** Oracle includes free block-volume backups; you can schedule them on the boot volume in the console.
- **Security:** only SSH is open (Oracle images allow key-based SSH only). The API listens on `127.0.0.1`, and `TRUST_PROXY=true` makes rate limiting use the real client IP that Cloudflare forwards.
- **Cost:** the server and tunnel stay free. OpenAI API usage for photo scans is billed separately; see `stats` for spend.
