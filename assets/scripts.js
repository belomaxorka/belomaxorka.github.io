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
 * Get now playing song
 *
 * @returns {Promise<HTMLElement|null>}
 */
async function nowPlaying() {
    const LAST_FM_API_KEY = atob('MTc0OTkxYjU1ZWViN2RkNzI1MmNjMGMwNTFjNDkwZjQ=');
    const USERNAME = 'belomaxorka';
    const URL = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&format=json&api_key=${LAST_FM_API_KEY}&limit=1&user=${USERNAME}`;

    try {
        const response = await fetch(URL);
        if (!response.ok) throw new Error(`Error: ${response.status}`);
        const json = await response.json();
        const lastTrack = json.recenttracks?.track?.[0];
        if (!lastTrack) return null;

        const link = document.createElement('a');
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.href = `https://genius.com/search?q=${encodeURIComponent(lastTrack.artist['#text'])} ${encodeURIComponent(lastTrack.name)}`;
        link.textContent = `${lastTrack.artist['#text']} — ${lastTrack.name}`;
        return link;
    } catch (error) {
        console.error('Error: ', error);
        return null;
    }
}

/**
 * Rain animation
 */
function startRain() {
    if (document.getElementById('rain-container')) return;

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

/**
 * CMD color codes mapping
 */
const CMD_COLORS = {
    '0': '#000000', '1': '#000080', '2': '#008000', '3': '#008080',
    '4': '#800000', '5': '#800080', '6': '#808000', '7': '#C0C0C0',
    '8': '#808080', '9': '#0000FF', 'a': '#00FF00', 'b': '#00FFFF',
    'c': '#FF0000', 'd': '#FF00FF', 'e': '#FFFF00', 'f': '#FFFFFF'
};

/**
 * Process terminal command
 *
 * @param {string} input
 * @returns {{output: string, action: string}|null}
 */
function processCommand(input) {
    const trimmed = input.trim();
    const spaceIdx = trimmed.indexOf(' ');
    const cmd = (spaceIdx === -1 ? trimmed : trimmed.substring(0, spaceIdx)).toLowerCase();
    const args = spaceIdx === -1 ? '' : trimmed.substring(spaceIdx + 1);

    switch (cmd) {
        case 'help': return { output: cmdHelp() };
        case 'ver': return { output: '\nMicrosoft Windows [Version ' + placeVersion() + ']' };
        case 'cls': return { action: 'cls' };
        case 'dir': return { output: cmdDir() };
        case 'date': return { output: cmdDate() };
        case 'time': return { output: cmdTime() };
        case 'echo': return { output: args || 'ECHO is on.' };
        case 'hostname': return { output: 'BELOMAXORKA-PC' };
        case 'whoami': return { output: 'belomaxorka\\guest' };
        case 'ipconfig': return { output: cmdIpconfig() };
        case 'systeminfo': return { output: cmdSysteminfo() };
        case 'ping': return args ? { output: cmdPing(args.split(/\s+/)[0]) } : { output: 'IP address must be specified.' };
        case 'tasklist': return { output: cmdTasklist() };
        case 'tree': return { output: cmdTree() };
        case 'color': return cmdColor(args);
        case 'title':
            document.title = args || "belomaxorka's space!";
            return { output: '' };
        case 'exit': return { action: 'exit' };
        default: return null;
    }
}

function cmdHelp() {
    return [
        'For more information on a specific command, type HELP command-name',
        '',
        'CLS             Clears the screen.',
        'COLOR           Sets the console colors.',
        'DATE            Displays the date.',
        'DIR             Displays a list of files and subdirectories.',
        'ECHO            Displays messages.',
        'EXIT            Quits the CMD.EXE program.',
        'HELP            Provides Help information for commands.',
        'HOSTNAME        Prints the name of the host.',
        'IPCONFIG        Displays IP network configuration.',
        'PING            Sends test packets to a network host.',
        'SYSTEMINFO      Displays system properties and configuration.',
        'TASKLIST        Displays all currently running tasks.',
        'TIME            Displays the system time.',
        'TITLE           Sets the window title.',
        'TREE            Graphically displays the directory structure.',
        'VER             Displays the Windows version.',
        'WHOAMI          Displays active user name.'
    ].join('\n');
}

function cmdDir() {
    const now = new Date();
    const pad2 = n => n.toString().padStart(2, '0');
    const d = pad2(now.getMonth() + 1) + '/' + pad2(now.getDate()) + '/' + now.getFullYear();

    return [
        ' Volume in drive A is PORTFOLIO',
        ' Volume Serial Number is B3L0-M4X0',
        '',
        ' Directory of A:\\',
        '',
        d + '  12:00 AM    <DIR>          .',
        d + '  12:00 AM    <DIR>          ..',
        '05/25/2006  03:00 AM             2,006 about.txt',
        '01/15/2024  09:30 PM            12,288 projects.exe',
        '03/10/2025  04:20 PM             8,192 skills.dll',
        '02/28/2026  11:59 PM             4,096 social.bat',
        d + '  10:00 AM               512 readme.txt',
        '               5 File(s)         27,094 bytes',
        '               2 Dir(s)  \u221E bytes free'
    ].join('\n');
}

function cmdDate() {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const now = new Date();
    const pad2 = n => n.toString().padStart(2, '0');
    return 'The current date is: ' + days[now.getDay()] + ' ' +
        pad2(now.getMonth() + 1) + '/' + pad2(now.getDate()) + '/' + now.getFullYear();
}

function cmdTime() {
    const now = new Date();
    const pad2 = n => n.toString().padStart(2, '0');
    const cs = Math.floor(now.getMilliseconds() / 10).toString().padStart(2, '0');
    return 'The current time is: ' + pad2(now.getHours()) + ':' +
        pad2(now.getMinutes()) + ':' + pad2(now.getSeconds()) + '.' + cs;
}

function cmdIpconfig() {
    return [
        '',
        'Windows IP Configuration',
        '',
        '',
        'Ethernet adapter Local Area Connection:',
        '',
        '   Connection-specific DNS Suffix  . : belomaxorka.github.io',
        '   IPv4 Address. . . . . . . . . . . : 127.0.0.1',
        '   Subnet Mask . . . . . . . . . . . : 255.255.255.0',
        '   Default Gateway . . . . . . . . . : 127.0.0.1'
    ].join('\n');
}

function cmdSysteminfo() {
    const now = new Date();
    return [
        '',
        'Host Name:                 BELOMAXORKA-PC',
        "OS Name:                   belomaxorka's space!",
        'OS Version:                ' + placeVersion(),
        'System Manufacturer:       belomaxorka',
        'System Model:              GitHub Pages Server',
        'Registered Owner:          Roman Kelesidis',
        'Original Install Date:     5/25/2006',
        'System Boot Time:          ' + now.toLocaleString('en-US'),
        'System Locale:             en;English',
        'Time Zone:                 (UTC) GitHub Pages Standard Time',
        'Total Physical Memory:     \u221E MB',
        'Available Physical Memory: \u221E MB'
    ].join('\n');
}

function cmdPing(host) {
    const ip = (Math.floor(Math.random() * 223) + 1) + '.' +
               Math.floor(Math.random() * 256) + '.' +
               Math.floor(Math.random() * 256) + '.' +
               Math.floor(Math.random() * 256);
    const times = Array.from({length: 4}, () => Math.floor(Math.random() * 15) + 1);
    const min = Math.min(...times);
    const max = Math.max(...times);
    const avg = Math.floor(times.reduce((a, b) => a + b) / 4);

    return [
        '',
        'Pinging ' + host + ' [' + ip + '] with 32 bytes of data:',
        'Reply from ' + ip + ': bytes=32 time=' + times[0] + 'ms TTL=128',
        'Reply from ' + ip + ': bytes=32 time=' + times[1] + 'ms TTL=128',
        'Reply from ' + ip + ': bytes=32 time=' + times[2] + 'ms TTL=128',
        'Reply from ' + ip + ': bytes=32 time=' + times[3] + 'ms TTL=128',
        '',
        'Ping statistics for ' + ip + ':',
        '    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),',
        'Approximate round trip times in milli-seconds:',
        '    Minimum = ' + min + 'ms, Maximum = ' + max + 'ms, Average = ' + avg + 'ms'
    ].join('\n');
}

function cmdTasklist() {
    const tasks = [
        ['portfolio.exe',   1,    2006],
        ['creativity.dll',  42,   16384],
        ['open-source.exe', 69,   8192],
        ['coffee.exe',      404,  99999],
        ['music.exe',       512,  4096],
        ['github.exe',      1337, 32768],
        ['networking.exe',  2048, 16384],
        ['homelab.exe',     8080, 65536]
    ];

    const lines = tasks.map(([name, pid, mem]) =>
        name.padEnd(25) + ' ' + String(pid).padStart(8) + ' ' +
        'Console'.padEnd(16) + ' ' + (mem.toLocaleString('en-US') + ' K').padStart(12)
    );

    return [
        '',
        'Image Name                     PID Session Name        Mem Usage',
        '========================= ======== ================ ============',
        ...lines
    ].join('\n');
}

function cmdTree() {
    return [
        'A:\\',
        '\u251C\u2500\u2500\u2500about',
        '\u2502   \u251C\u2500\u2500\u2500nickname',
        '\u2502   \u251C\u2500\u2500\u2500name',
        '\u2502   \u251C\u2500\u2500\u2500pronouns',
        '\u2502   \u251C\u2500\u2500\u2500age',
        '\u2502   \u2514\u2500\u2500\u2500birthday',
        '\u251C\u2500\u2500\u2500miscellaneous',
        '\u2502   \u251C\u2500\u2500\u2500favorite-colors',
        '\u2502   \u2514\u2500\u2500\u2500last-played-song',
        '\u2514\u2500\u2500\u2500social',
        '    \u251C\u2500\u2500\u2500telegram',
        '    \u2514\u2500\u2500\u2500github'
    ].join('\n');
}

function cmdColor(args) {
    if (!args) {
        document.documentElement.style.setProperty('--main-bg-color', 'black');
        document.documentElement.style.setProperty('--main-font-color', 'white');
        document.body.classList.remove('whiteTheme');
        document.body.style.backgroundImage = '';
        Cookie.remove('whiteTheme');
        return { output: '' };
    }

    const code = args.toLowerCase().replace(/\s/g, '');
    let bg, fg;

    if (code.length === 1) {
        bg = '0';
        fg = code;
    } else if (code.length === 2) {
        bg = code[0];
        fg = code[1];
    } else {
        return { output: 'Invalid color specification' };
    }

    if (!(bg in CMD_COLORS) || !(fg in CMD_COLORS)) {
        return { output: 'Invalid color specification' };
    }

    if (bg === fg) {
        return { output: 'The color attribute cannot set foreground and background to the same color.' };
    }

    document.body.classList.remove('whiteTheme');
    Cookie.remove('whiteTheme');
    document.documentElement.style.setProperty('--main-bg-color', CMD_COLORS[bg]);
    document.documentElement.style.setProperty('--main-font-color', CMD_COLORS[fg]);
    document.body.style.backgroundImage = 'none';

    return { output: '' };
}
