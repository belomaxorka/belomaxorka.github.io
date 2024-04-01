/**
 * Random emoji picker
 *
 * @link https://gist.github.com/ikr7/c72843556ef3a12014c3
 * @returns {string}
 */
function pickRandomEmoji() {
    let emojis = ['✨', '🪐', '💫', '☄️', '🌙', '🌏', '🌈', '🌚', '🌝', '🌞', '❄️', '💥'];
    return emojis[Math.floor(Math.random() * emojis.length)];
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
