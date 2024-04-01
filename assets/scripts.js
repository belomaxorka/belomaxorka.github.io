/**
 * Random picker
 *
 * @param type
 * @returns {string}
 */
function pickRandom(type) {
    let elements;

    switch (type) {
        default:
        case 'emoji':
            elements = ['✨', '🪐', '💫', '☄️', '🌙', '🌏', '🌈', '🌚', '🌝', '🌞', '❄️', '💥'];
            break;
        case 'version':
            elements = ['10.0.22631.3374', '10.0.19042.867', '6.2.9200', '6.1.7600', '6.0.6000', '5.1.2600', '5.00.2195'];
            break;
    }
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
 * @param url
 * @returns {string}
 */
function httpGet(url) {
    let xmlHttp = new XMLHttpRequest();
    xmlHttp.open("GET", url, false);
    xmlHttp.send(null);
    return xmlHttp.responseText;
}

/**
 * Get now playing song
 *
 * @returns {string}
 */
function nowPlaying() {
    const LAST_FM_API_KEY = '174991b55eeb7dd7252cc0c051c490f4';
    const USERNAME = 'belomaxorka';
    const URL = "https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&format=json&api_key=" + LAST_FM_API_KEY + "&limit=1&user=" + USERNAME;
    let json = JSON.parse(httpGet(URL));
    let lastTrack = json.recenttracks.track[0];
    return lastTrack.artist['#text'] + ' — ' + lastTrack.name;
}
