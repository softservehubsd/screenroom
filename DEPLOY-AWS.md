# Deploy Screenroom to AWS (Lightsail)

Result: `https://yourdomain.com` for the family, `https://yourdomain.com/admin` for you.

## 1. Create the server
1. AWS Console → **Lightsail** → Create instance → Linux/Unix → **Ubuntu 24.04**.
2. Pick a plan with enough disk for your movies (e.g. 80 GB SSD plan; 1 movie ≈ 1–4 GB). You can add a block-storage disk later.
3. Under **Networking**: create a **static IP** and attach it. Open ports **80** and **443** (22 is open by default).

## 2. Point a domain at it
Buy any domain (Route 53 or elsewhere) and add an **A record** → your static IP.
Caddy needs this to issue a free HTTPS certificate. (No domain? Use `YOUR-IP.sslip.io` as the domain.)

## 3. Copy the app and install
On your PC (PowerShell, in the project folder; replace the IP and key path):

    scp -i LightsailKey.pem -r . ubuntu@YOUR_IP:/tmp/screenroom

On the server (Lightsail "Connect using SSH"):

    sudo mkdir -p /opt && sudo mv /tmp/screenroom /opt/screenroom
    sudo rm -rf /opt/screenroom/data
    sudo bash /opt/screenroom/deploy/setup.sh yourdomain.com
    sudo nano /etc/screenroom.env        # set ADMIN_PASSWORD and VIEWER_PASSWORD
    sudo systemctl restart screenroom

## 4. Use it
- Family: open the site, enter the family password. On the TV browser, bookmark it.
- Admin: `/admin` with the admin password. Upload movies there.

## Maintenance
- Logs: `sudo journalctl -u screenroom -f`
- Update code: copy new files to `/opt/screenroom`, then `sudo systemctl restart screenroom`
- Backups: movies are in `/var/lib/screenroom`. Take Lightsail **snapshots** regularly.
- Costs: the plan price is fixed, but check the included data transfer. Streaming movies uses a lot of bandwidth.

## Notes
- Passwords are limited to 8 wrong tries per 15 minutes per IP.
- Only upload videos you have the right to share.
