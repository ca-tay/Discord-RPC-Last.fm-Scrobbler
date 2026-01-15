
---

# Spotify → Discord Rich Presence + Last.fm Scrobbler (Linux)

A Node.js script that:

* 🎧 Tracks **Spotify playback** on Linux using `playerctl`
* 💬 Updates **Discord Rich Presence** with:

  * Song title, artist, album
  * Album art
  * Playback timestamps
  * “Listen on Spotify” button
* ❤️ Updates **Last.fm**:

  * Sets *Now Playing*
  * Automatically scrobbles tracks at **50% or 4 minutes**

This runs continuously and keeps Discord + Last.fm perfectly in sync with Spotify.

---

## Features

* Real-time Spotify tracking via **MPRIS**
* Automatic Last.fm authentication & session saving
* Spotify album art fix
* Handles pause/stop cleanly
* Auto re-auth if Last.fm session expires

---

## Requirements

### System

* **Linux**
* Spotify desktop client
* `playerctl`
* Discord desktop app running

Install `playerctl`:

```bash
sudo pacman -S playerctl        # Arch
sudo apt install playerctl      # Debian/Ubuntu
```

### Node.js

* Node.js **18+** recommended

---

## Installation

Clone the repo and install dependencies:

```bash
npm install discord-rpc axios crypto-js
```

---

## Configuration

Create a config file named:

```
lastfm-config.json
```

### Example `lastfm-config.json`

```json
{
  "api_key": "YOUR_LASTFM_API_KEY",
  "secret": "YOUR_LASTFM_SHARED_SECRET",
  "session_key": null
}
```

* `api_key` & `secret` come from:
  [https://www.last.fm/api/account/create](https://www.last.fm/api/account/create)
* `session_key` will be filled automatically after authentication

---

## First-Time Authentication (Last.fm)

On first run (or if `session_key` is missing):

1. The script prints an auth URL
2. Open it in your browser
3. Log into Last.fm and allow access
4. You’ll be redirected to a URL like:

   ```
   https://example.com/?token=abc123
   ```
5. Copy the `token` value
6. Paste it into the terminal and press Enter

The session key will be saved automatically.

---

## Usage

Start the script:

```bash
node index.js
```

Once running:

* Discord Rich Presence updates every **10 seconds**
* Last.fm:

  * “Now Playing” updates immediately
  * Scrobble happens at **50% or 4 minutes**

---

## Discord Rich Presence Preview

**Details**

```
Song Title
```

**State**

```
by Artist • Album
```

**Extras**

* Album art
* Spotify icon
* “Listen on Spotify” button
* Accurate playback timer

---

## How Scrobbling Works

A track is scrobbled when:

* At least **50%** of the track is played
  **OR**
* **4 minutes** have elapsed
  (whichever happens first)

---

## Troubleshooting

**Nothing shows on Discord**

* Make sure Discord desktop is running
* Check that Spotify is playing (not paused)
* Ensure `clientId` matches your Discord application

**Last.fm not updating**

* Check API key & secret
* Delete `session_key` and re-authenticate
* Make sure system time is correct
