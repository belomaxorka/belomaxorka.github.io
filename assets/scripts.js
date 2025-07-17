/**
 * Place version
 *
 * @returns {string}
 */
function placeVersion() {
    let elements = ['10.0.22631.3374', '10.0.19042.867', '10.0.16299.19', '6.3.9600', '6.2.9200', '6.1.7600', '6.0.6000', '5.1.2600', '5.00.2195'];
    return elements[Math.floor(Math.random() * elements.length)];
}

/**
 * Calculates age by birthday
 *
 * @param birthDate
 * @returns {number}
 */
function calculateAge(birthDate) {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

/**
 * httpGet request
 *
 * @param {string} url
 * @returns {Promise<string>}
 */
function httpGetAsync(url) {
    return new Promise((resolve, reject) => {
        let xmlHttp = new XMLHttpRequest();
        xmlHttp.open("GET", url, true);
        xmlHttp.onreadystatechange = function () {
            if (xmlHttp.readyState === 4) {
                if (xmlHttp.status === 200) {
                    resolve(xmlHttp.responseText);
                } else {
                    reject(new Error(`Error: ${xmlHttp.status}`));
                }
            }
        };
        xmlHttp.send(null);
    });
}

/**
 * Get now playing song
 *
 * @returns {Promise<string>}
 */
async function nowPlaying() {
    const LAST_FM_API_KEY = atob('MTc0OTkxYjU1ZWViN2RkNzI1MmNjMGMwNTFjNDkwZjQ=');
    const USERNAME = 'belomaxorka';
    const URL = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&format=json&api_key=${LAST_FM_API_KEY}&limit=1&user=${USERNAME}`;

    try {
        const responseText = await httpGetAsync(URL);
        const json = JSON.parse(responseText);
        const lastTrack = json.recenttracks.track[0];
        return `<a target='_blank' href='https://genius.com/search?q=${encodeURIComponent(lastTrack.artist['#text'])} ${encodeURIComponent(lastTrack.name)}'>${lastTrack.artist['#text']} — ${lastTrack.name}</a>`;
    } catch (error) {
        console.error('Error: ', error);
        return 'Error: ' + error;
    }
}

/**
 * Rain animation
 */
function startRain() {
    const rainContainer = document.createElement('div');
    rainContainer.id = 'rain-container';
    rainContainer.style.position = 'fixed';
    rainContainer.style.top = '0';
    rainContainer.style.left = '0';
    rainContainer.style.width = '100vw';
    rainContainer.style.height = '100vh';
    rainContainer.style.pointerEvents = 'none';
    rainContainer.style.zIndex = '9999';
    document.body.appendChild(rainContainer);

    const dropsCount = Math.floor(window.innerWidth / 30);
    for (let i = 0; i < dropsCount; i++) {
        const drop = document.createElement('div');
        drop.className = 'rain-drop';
        drop.style.left = (i * (100 / dropsCount) + Math.random() * (100 / dropsCount)) + 'vw';
        drop.style.animationDelay = (Math.random() * 0.7) + 's';
        drop.style.animationDuration = (0.9 + Math.random() * 0.5) + 's';
        rainContainer.appendChild(drop);
    }
}
