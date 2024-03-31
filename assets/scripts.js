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
