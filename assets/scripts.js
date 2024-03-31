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
