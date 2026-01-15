const RPC = require('discord-rpc');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const CryptoJS = require('crypto-js');

const execPromise = util.promisify(exec);

const clientId = '1456752633833586760'; // your discord application client ID
const rpc = new RPC.Client({ transport: 'ipc' });

const configPath = path.join(__dirname, 'lastfm-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const API_KEY = config.api_key;
const API_SECRET = config.secret;
let SESSION_KEY = config.session_key;

function generateSignature(params) {
    const sortedKeys = Object.keys(params).sort();
    let signature = '';
    sortedKeys.forEach(key => {
        if (key !== 'format') signature += key + params[key];
    });
    signature += API_SECRET;
    return CryptoJS.MD5(signature).toString();
}

function saveSessionKey(sk) {
    config.session_key = sk;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    SESSION_KEY = sk;
    console.log('Last.fm session key saved!');
}

async function authenticate() {
    console.log('\n=== Last.fm Authentication Required ===');
    console.log(`1. Open this URL in your browser:`);
    console.log(`   https://www.last.fm/api/auth/?api_key=${API_KEY}&cb=https://example.com`);
    console.log(`2. Log in and click "Yes, allow access".`);
    console.log(`3. Copy the "token" from the redirect URL (even if page shows error):`);
    console.log(`   Example: https://example.com/?token=abc123def456...`);
    console.log(`4. Paste the token here and press Enter:\n`);

    process.stdin.once('data', async (data) => {
        const token = data.toString().trim();

        if (!token) {
            console.error('No token provided.');
            process.exit(1);
        }

        try {
            const params = {
                method: 'auth.getSession',
                api_key: API_KEY,
                token: token,
                format: 'json'
            };
            params.api_sig = generateSignature(params);

            const sessionRes = await axios.get('https://ws.audioscrobbler.com/2.0/', { params });

            if (sessionRes.data.error) {
                console.error('Error getting session:', sessionRes.data);
                process.exit(1);
            }

            const sk = sessionRes.data.session.key;
            saveSessionKey(sk);
            console.log('Authentication complete! Starting main loop...\n');
            startMainLoop();
        } catch (err) {
            console.error('Auth failed:', err.response?.data || err.message);
            process.exit(1);
        }
    });
}

async function updateNowPlaying(artist, title, album = '') {
    if (!SESSION_KEY) return;

    const params = {
        method: 'track.updateNowPlaying',
        api_key: API_KEY,
        sk: SESSION_KEY,
        artist,
        track: title,
        format: 'json'
    };
    if (album) params.album = album;
    params.api_sig = generateSignature(params);

    try {
        await axios.post('https://ws.audioscrobbler.com/2.0/', new URLSearchParams(params));
        console.log(`Now playing on Last.fm: ${title} by ${artist}`);
    } catch (err) {
        if (err.response?.data?.error === 9) {
            console.log('Session key invalid. Re-authenticating...');
            SESSION_KEY = null;
            saveSessionKey(null);
            authenticate();
        } else {
            console.error('Now Playing error:', err.response?.data || err.message);
        }
    }
}

async function scrobble(artist, title, album = '', timestamp, duration = 0) {
    if (!SESSION_KEY) return;

    const params = {
        method: 'track.scrobble',
        api_key: API_KEY,
        sk: SESSION_KEY,
        artist,
        track: title,
        timestamp,
        format: 'json'
    };
    if (album) params.album = album;
    if (duration > 0) params.duration = duration;
    params.api_sig = generateSignature(params);

    try {
        await axios.post('https://ws.audioscrobbler.com/2.0/', new URLSearchParams(params));
        console.log(`Scrobbled: ${title} by ${artist}`);
    } catch (err) {
        console.error('Scrobble error:', err.response?.data || err.message);
    }
}

let lastTrackKey = '';
let trackStartTime = 0;
let trackLength = 0;
let scrobbled = false;

async function updatePresence() {
    try {
        const { stdout } = await execPromise(
            'playerctl --player=spotify metadata --format "{{ artist }}|{{ title }}|{{ album }}|{{ mpris:length }}|{{ position }}|{{ mpris:artUrl }}|{{ mpris:trackid }}" || echo "||||||0|0|"'
        );

        const [artist, title, album, lengthMicro, positionMicro, artUrl, trackId] = stdout.trim().split('|');

        let fixedArtUrl = artUrl || 'spotify';
        if (artUrl && artUrl.startsWith('https://open.spotify.com/image/')) {
            fixedArtUrl = artUrl.replace('open.spotify.com/image/', 'i.scdn.co/image/');
        }

        let spotifyUrl = null;
        if (trackId && trackId.startsWith('spotify:track:')) {
            const trackIdOnly = trackId.split(':')[2];
            spotifyUrl = `https://open.spotify.com/track/${trackIdOnly}`;
        }

        const statusOut = await execPromise('playerctl --player=spotify status || echo "Stopped"');
        const status = statusOut.stdout.trim();

        if (status === 'Playing' && title && artist) {
            const length = Math.floor(lengthMicro / 1000000);
            const position = Math.floor(positionMicro / 1000000);
            const startTime = Math.floor(Date.now() / 1000) - position;
            const endTime = length > 0 ? startTime + length : null;

            const currentTrackKey = `${artist}-${title}-${album || ''}`;

            if (currentTrackKey !== lastTrackKey) {
                lastTrackKey = currentTrackKey;
                trackStartTime = startTime;
                trackLength = length;
                scrobbled = false;

                await updateNowPlaying(artist, title, album);

                await rpc.setActivity({
                    details: title,
                    state: `by ${artist} • ${album || 'Unknown Album'}`,
                    startTimestamp: startTime,
                    endTimestamp: endTime,
                    largeImageKey: fixedArtUrl,
                    largeImageText: title,
                    smallImageKey: 'spotify',
                    smallImageText: 'Spotify',
                    instance: false,
                    buttons: spotifyUrl ? [
                        {
                            label: 'Listen on Spotify',
                            url: spotifyUrl
                        }
                    ] : []
                });

                console.log(`Now playing: ${title} by ${artist}`);
                if (spotifyUrl) console.log(`   → ${spotifyUrl}`);
            }

            if (!scrobbled && length > 0) {
                const listened = position;
                const threshold = Math.min(length / 2, 240);
                if (listened >= threshold) {
                    await scrobble(artist, title, album, trackStartTime, length);
                    scrobbled = true;
                }
            }
        } else {
            if (lastTrackKey !== '') {
                rpc.clearActivity();
                lastTrackKey = '';
                console.log('Spotify paused/stopped — presence cleared');
            }
        }
    } catch (err) {
        if (lastTrackKey !== '') {
            rpc.clearActivity();
            lastTrackKey = '';
        }
    }
}

function startMainLoop() {
    updatePresence();
    setInterval(updatePresence, 10000); 
}

rpc.on('ready', () => {
    console.log('Discord RPC connected!');

    if (!SESSION_KEY) {
        authenticate();
    } else {
        console.log('Last.fm session key loaded.');
        startMainLoop();
    }
});

rpc.login({ clientId }).catch(err => {
    console.error('Failed to login to Discord RPC:', err.message);
    process.exit(1);
});

process.on('SIGINT', () => {
    rpc.clearActivity();
    rpc.destroy();
    console.log('\nGoodbye!');
    process.exit();
});
