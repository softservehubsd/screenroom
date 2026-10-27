# Screenroom

A self-hosted movie and series library with a TV-friendly browser interface and password-protected admin uploads.

## Included

- Responsive cinema-style library, search, favorites, and continue-watching progress
- Movies and series, including seasons and episode numbering
- Admin sign-in and upload/remove controls
- Native HTML video playback with HTTP byte-range seeking
- Local video storage in the data/videos directory and a JSON catalog in data/catalog.json
- Keyboard focus states and a large-screen layout for TV browsers

## Run on Windows

Install Node.js 20 or newer. Open PowerShell in this folder and set two private secrets for this session:

    $env:ADMIN_PASSWORD = 'use-a-unique-password-at-least-12-characters'
    $env:SESSION_SECRET = 'use-a-random-secret-at-least-32-characters-long'
    npm start

Open http://localhost:3000 and choose Admin to sign in with the password you set. Do not use the example values above. Keep the password and session secret private.

To open it from a TV on the same home network, run the server on a computer that stays on, then visit http://COMPUTER-LAN-IP:3000 in the TV browser. The computer firewall must allow the app on your private home network. For access over the internet, deploy behind HTTPS and restrict access as appropriate.

## Video compatibility

MP4 with H.264 video and AAC audio is the broadest smart-TV browser choice. WebM and OGG are accepted, but TV support varies. Each upload can be up to 8 GB. This app streams the original file and does not transcode, generate subtitles, or adapt bitrate. Large files need enough storage, network capacity, and upload time.

## Data and access

Back up the data directory; it contains the catalog and uploaded videos. Anyone who can reach the site can browse and play its library. Only the admin API is password protected. For an internet-facing private library, add viewer authentication or restrict access behind a VPN/firewall and configure HTTPS before sharing the address.

The admin password is configured through ADMIN_PASSWORD; the app does not store it in the source files. On a production HTTPS setup, run with NODE_ENV=production so the admin session cookie is marked Secure. Store the data directory on persistent storage.

## AWS

This is a Node.js server, not a static-only website. It can run on an AWS server that supports Node.js 20+, provided the instance has persistent disk space for the video collection and deployment is configured for HTTPS. The AWS account, instance, domain, storage, and firewall have not been changed by this project. Check your plan's storage and data-transfer terms before uploading a large video library.

## Limitations

- One admin password; no separate viewer accounts or roles
- No video transcoding, DRM, external subtitles, casting integration, or native TV application
- Video delivery uses the server's local persistent disk; object storage/CDN can be added for larger libraries
- Use only video content you have permission to store and stream
