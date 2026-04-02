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
 * Virtual filesystem
 */
let currentPath = [];

const FILE_SYSTEM = {
    dirs: {
        'about': {
            dirs: {
                'nickname': {
                    dirs: {},
                    files: [{ name: 'value.txt', size: 12, date: '05/25/2006  03:00 AM' }]
                },
                'name': {
                    dirs: {},
                    files: [{ name: 'value.txt', size: 16, date: '05/25/2006  03:00 AM' }]
                },
                'pronouns': {
                    dirs: {},
                    files: [{ name: 'value.txt', size: 6, date: '05/25/2006  03:00 AM' }]
                },
                'age': {
                    dirs: {},
                    files: [{ name: 'value.txt', size: 2 }]
                },
                'birthday': {
                    dirs: {},
                    files: [{ name: 'value.txt', size: 11, date: '05/25/2006  03:00 AM' }]
                }
            },
            files: []
        },
        'miscellaneous': {
            dirs: {
                'favorite-colors': {
                    dirs: {},
                    files: [{ name: 'value.txt', size: 30, date: '01/15/2024  09:30 PM' }]
                },
                'last-played-song': {
                    dirs: {},
                    files: [{ name: 'value.txt', size: 64 }]
                }
            },
            files: []
        },
        'social': {
            dirs: {
                'telegram': {
                    dirs: {},
                    files: [{ name: 'value.txt', size: 40, date: '02/28/2026  11:59 PM' }]
                },
                'github': {
                    dirs: {},
                    files: [{ name: 'value.txt', size: 44, date: '02/28/2026  11:59 PM' }]
                }
            },
            files: []
        }
    },
    files: [
        { name: 'about.txt', size: 2006, date: '05/25/2006  03:00 AM' },
        { name: 'projects.exe', size: 12288, date: '01/15/2024  09:30 PM' },
        { name: 'skills.dll', size: 8192, date: '03/10/2025  04:20 PM' },
        { name: 'social.bat', size: 4096, date: '02/28/2026  11:59 PM' },
        { name: 'readme.txt', size: 512 }
    ]
};

const FILE_CONTENTS = {
    'readme.txt': [
        '===========================================',
        "  Welcome to belomaxorka's space!",
        '===========================================',
        '',
        'This is a personal portfolio website',
        'styled as a Windows command prompt.',
        '',
        'Type "help" to see available commands.',
        'Type "belomaxorka about" to toggle theme.'
    ].join('\n'),
    'about.txt': [
        'Name:      Roman Kelesidis',
        'Nickname:  belomaxorka',
        'Pronouns:  he/him',
        'Birthday:  25 May 2006',
        'Location:  Greece',
        'Languages: Russian, English',
        '',
        'Full-stack web developer and DevOps',
        'enthusiast. Open source contributor.',
        'Network engineer. Home lab tinkerer.'
    ].join('\n'),
    'social.bat': [
        '@echo off',
        'echo Opening social links...',
        'start https://t.me/belomaxorka',
        'start https://github.com/belomaxorka'
    ].join('\n'),
    'about\\nickname\\value.txt': 'belomaxorka',
    'about\\name\\value.txt': 'Roman Kelesidis',
    'about\\pronouns\\value.txt': 'he/him',
    'about\\birthday\\value.txt': '25 May 2006',
    'miscellaneous\\favorite-colors\\value.txt': '#000, #fff, #a062de, #62a0de',
    'social\\telegram\\value.txt': '@belomaxorka\nhttps://t.me/belomaxorka',
    'social\\github\\value.txt': 'belomaxorka\nhttps://github.com/belomaxorka'
};

const CMD_HELP = {
    'cd': 'Displays the name of or changes the current directory.\n\nCD [path]\nCHDIR [path]\n\n  ..   Specifies the parent directory.\n  \\    Specifies the root directory.',
    'chcp': 'Displays the active code page number.\n\nCHCP',
    'cls': 'Clears the screen.\n\nCLS',
    'color': 'Sets the console foreground and background colors.\n\nCOLOR [attr]\n\n  attr  Two hex digits: background and foreground.\n\n  0 = Black    8 = Gray\n  1 = Blue     9 = Light Blue\n  2 = Green    A = Light Green\n  3 = Aqua     B = Light Aqua\n  4 = Red      C = Light Red\n  5 = Purple   D = Light Purple\n  6 = Yellow   E = Light Yellow\n  7 = White    F = Bright White\n\nCOLOR without parameters resets to default.',
    'date': 'Displays the current date.\n\nDATE',
    'dir': 'Displays a list of files and subdirectories.\n\nDIR [path]',
    'echo': 'Displays messages.\n\nECHO [message]\n\nType ECHO without parameters to display the current setting.',
    'exit': 'Quits the CMD.EXE program.\n\nEXIT',
    'help': 'Provides Help information for Windows commands.\n\nHELP [command]',
    'hostname': 'Prints the name of the current host.\n\nHOSTNAME',
    'ipconfig': 'Displays all current TCP/IP network configuration.\n\nIPCONFIG',
    'netstat': 'Displays protocol statistics and current TCP/IP connections.\n\nNETSTAT',
    'nslookup': 'Displays DNS information for a domain.\n\nNSLOOKUP [hostname]',
    'ping': 'Sends ICMP ECHO_REQUEST to network hosts.\n\nPING hostname',
    'set': 'Displays current environment variables.\n\nSET',
    'shutdown': 'Shuts down or restarts the computer.\n\nSHUTDOWN [/s | /r | /a]\n\n  /s    Shutdown the computer.\n  /r    Restart the computer.\n  /a    Abort a system shutdown.',
    'start': 'Opens a URL in a new browser window.\n\nSTART [url]',
    'systeminfo': 'Displays system properties and configuration.\n\nSYSTEMINFO',
    'tasklist': 'Displays a list of currently running processes.\n\nTASKLIST',
    'time': 'Displays the system time.\n\nTIME',
    'title': 'Sets the window title for the CMD.EXE window.\n\nTITLE [string]',
    'tree': 'Graphically displays the directory structure.\n\nTREE [path]',
    'type': 'Displays the contents of a text file.\n\nTYPE [path]filename',
    'ver': 'Displays the Windows version.\n\nVER',
    'whoami': 'Displays the current user name.\n\nWHOAMI'
};

function buildPath(pathArray) {
    return 'A:\\' + pathArray.join('\\');
}

function getFullPath() {
    return buildPath(currentPath);
}

function getNode(path) {
    let node = FILE_SYSTEM;
    for (const segment of path) {
        if (node.dirs && node.dirs[segment]) {
            node = node.dirs[segment];
        } else {
            return null;
        }
    }
    return node;
}

function updatePrompt() {
    const el = document.getElementById('promptPath');
    if (el) el.textContent = getFullPath();
}

function resolvePath(pathStr) {
    let target = pathStr.trim().replace(/\//g, '\\');
    let newPath = [...currentPath];

    if (target.match(/^[a-zA-Z]:/)) {
        newPath = [];
        target = target.replace(/^[a-zA-Z]:\\?/, '');
    } else if (target.startsWith('\\')) {
        newPath = [];
        target = target.substring(1);
    }

    const segments = target.split('\\').filter(s => s.length > 0);
    for (const seg of segments) {
        if (seg === '.') continue;
        if (seg === '..') {
            newPath.pop();
            continue;
        }

        const parentNode = getNode(newPath);
        if (!parentNode || !parentNode.dirs) return null;

        const dirName = Object.keys(parentNode.dirs).find(
            d => d.toLowerCase() === seg.toLowerCase()
        );
        if (!dirName) return null;
        newPath.push(dirName);
    }

    return newPath;
}

function cmdCd(args) {
    if (!args) return { output: getFullPath() };

    const newPath = resolvePath(args);
    if (newPath === null) {
        return { output: 'The system cannot find the path specified.' };
    }

    currentPath = newPath;
    updatePrompt();
    return { output: '' };
}

// Restore directory after cls
(function () {
    const saved = sessionStorage.getItem('cmdPath');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && getNode(parsed)) {
                currentPath = parsed;
                updatePrompt();
            }
        } catch (e) {}
        sessionStorage.removeItem('cmdPath');
    }
})();

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
        case 'help': return { output: cmdHelp(args) };
        case 'ver': return { output: 'Microsoft Windows [Version ' + placeVersion() + ']' };
        case 'cls':
            sessionStorage.setItem('cmdPath', JSON.stringify(currentPath));
            return { action: 'cls' };
        case 'dir': return { output: cmdDir(args) };
        case 'date': return { output: cmdDate() };
        case 'time': return { output: cmdTime() };
        case 'echo': return { output: args || 'ECHO is on.' };
        case 'hostname': return { output: 'BELOMAXORKA-PC' };
        case 'whoami': return { output: 'belomaxorka\\guest' };
        case 'ipconfig': return { output: cmdIpconfig() };
        case 'systeminfo': return { output: cmdSysteminfo() };
        case 'ping': return args.trim() ? { output: cmdPing(args.trim().split(/\s+/)[0]) } : { output: 'IP address must be specified.' };
        case 'tasklist': return { output: cmdTasklist() };
        case 'tree': return { output: cmdTree(args) };
        case 'color': return cmdColor(args);
        case 'title':
            document.title = args || "belomaxorka's space!";
            return { output: '' };
        case 'exit': return { action: 'exit' };
        case 'cd':
        case 'chdir':
            return cmdCd(args.trim());
        case 'type': return args.trim() ? cmdType(args.trim().split(/\s+/)[0]) : { output: 'The syntax of the command is incorrect.' };
        case 'set': return { output: cmdSet() };
        case 'start': return cmdStart(args);
        case 'shutdown': return cmdShutdown(args);
        case 'netstat': return { output: cmdNetstat() };
        case 'nslookup':
            return args.trim() ? { output: cmdNslookup(args.trim().split(/\s+/)[0]) } : { output: 'Default Server:  dns.belomaxorka.local\nAddress:  127.0.0.1' };
        case 'chcp': return { output: 'Active code page: 65001' };
        case 'format': return { output: 'Nice try! This drive is write-protected.' };
        case 'del':
        case 'erase':
        case 'rm': return { output: 'Access is denied. You cannot delete system files.' };
        case 'mkdir':
        case 'md':
        case 'rmdir':
        case 'rd': return { output: 'Access is denied. Read-only filesystem.' };
        case 'copy':
        case 'xcopy':
        case 'move':
        case 'ren':
        case 'rename': return { output: 'Access is denied. Read-only filesystem.' };
        default: return null;
    }
}

function cmdHelp(args) {
    if (args && args.trim()) {
        const cmd = args.trim().toLowerCase();
        const key = cmd === 'chdir' ? 'cd' : cmd;
        return CMD_HELP[key] || 'This command is not supported by the help utility.';
    }
    return [
        'For more information on a specific command, type HELP command-name',
        '',
        'CD              Displays or changes the current directory.',
        'CHCP            Displays the active code page number.',
        'CLS             Clears the screen.',
        'COLOR           Sets the console colors.',
        'DATE            Displays the date.',
        'DIR             Displays a list of files and subdirectories.',
        'ECHO            Displays messages.',
        'EXIT            Quits the CMD.EXE program.',
        'HELP            Provides Help information for commands.',
        'HOSTNAME        Prints the name of the host.',
        'IPCONFIG        Displays IP network configuration.',
        'NETSTAT         Displays active network connections.',
        'NSLOOKUP        Displays DNS information for a domain.',
        'PING            Sends test packets to a network host.',
        'SET             Displays environment variables.',
        'SHUTDOWN        Shuts down the computer.',
        'START           Opens a URL in a new window.',
        'SYSTEMINFO      Displays system properties and configuration.',
        'TASKLIST        Displays all currently running tasks.',
        'TIME            Displays the system time.',
        'TITLE           Sets the window title.',
        'TREE            Graphically displays the directory structure.',
        'TYPE            Displays the contents of a text file.',
        'VER             Displays the Windows version.',
        'WHOAMI          Displays active user name.'
    ].join('\n');
}

function cmdDir(args) {
    let targetPath = currentPath;
    if (args && args.trim()) {
        const resolved = resolvePath(args.trim());
        if (resolved === null) return 'The system cannot find the path specified.';
        targetPath = resolved;
    }

    const node = getNode(targetPath);
    const now = new Date();
    const pad2 = n => n.toString().padStart(2, '0');
    const d = pad2(now.getMonth() + 1) + '/' + pad2(now.getDate()) + '/' + now.getFullYear();

    const lines = [
        ' Volume in drive A is PORTFOLIO',
        ' Volume Serial Number is B3L0-M4X0',
        '',
        ' Directory of ' + buildPath(targetPath),
        '',
        d + '  12:00 AM    <DIR>          .',
        d + '  12:00 AM    <DIR>          ..'
    ];

    const dirNames = Object.keys(node.dirs || {});
    for (const name of dirNames) {
        lines.push(d + '  12:00 AM    <DIR>          ' + name);
    }

    let totalSize = 0;
    const files = node.files || [];
    for (const file of files) {
        const fileDate = file.date || (d + '  10:00 AM');
        lines.push(fileDate + file.size.toLocaleString('en-US').padStart(18) + ' ' + file.name);
        totalSize += file.size;
    }

    lines.push(String(files.length).padStart(16) + ' File(s)  ' + totalSize.toLocaleString('en-US').padStart(12) + ' bytes');
    lines.push(String(dirNames.length + 2).padStart(16) + ' Dir(s)  \u221E bytes free');

    return lines.join('\n');
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

function cmdTree(args) {
    let targetPath = currentPath;
    if (args && args.trim()) {
        const resolved = resolvePath(args.trim());
        if (resolved === null) return 'The system cannot find the path specified.';
        targetPath = resolved;
    }
    const node = getNode(targetPath);
    const lines = [buildPath(targetPath)];
    buildTree(node, '', lines);
    return lines.join('\n');
}

function buildTree(node, prefix, lines) {
    const dirs = Object.keys(node.dirs || {});
    for (let i = 0; i < dirs.length; i++) {
        const isLast = i === dirs.length - 1;
        lines.push(prefix + (isLast ? '\u2514\u2500\u2500\u2500' : '\u251C\u2500\u2500\u2500') + dirs[i]);
        buildTree(node.dirs[dirs[i]], prefix + (isLast ? '    ' : '\u2502   '), lines);
    }
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

    if (bg === '0' && fg === 'a') {
        if (typeof startRain === 'function') startRain();
    }

    return { output: '' };
}

function cmdType(filename) {
    let targetPath = [...currentPath];
    let fname = filename;

    const normalized = filename.replace(/\//g, '\\');
    const lastSlash = normalized.lastIndexOf('\\');
    if (lastSlash !== -1) {
        const dirPart = normalized.substring(0, lastSlash);
        fname = normalized.substring(lastSlash + 1);
        const resolved = resolvePath(dirPart);
        if (resolved === null) return { output: 'The system cannot find the path specified.' };
        targetPath = resolved;
    }

    const node = getNode(targetPath);
    const files = node.files || [];
    const file = files.find(f => f.name.toLowerCase() === fname.toLowerCase());

    if (!file) {
        return { output: 'The system cannot find the file specified.' };
    }

    if (file.name.endsWith('.exe') || file.name.endsWith('.dll')) {
        return { output: 'Access is denied.' };
    }

    const filePath = (targetPath.length > 0 ? targetPath.join('\\') + '\\' : '') + file.name.toLowerCase();

    if (filePath === 'about\\age\\value.txt') {
        return { output: String(calculateAge('2006-05-25')) };
    }
    if (filePath === 'miscellaneous\\last-played-song\\value.txt') {
        const el = document.getElementById('nowPlaying');
        return { output: el ? el.textContent : 'N/A' };
    }

    const content = FILE_CONTENTS[filePath];
    if (content !== undefined) {
        return { output: content };
    }

    return { output: '' };
}

function cmdSet() {
    return [
        '',
        'CD=' + getFullPath(),
        'COMPUTERNAME=BELOMAXORKA-PC',
        'HOMEDRIVE=A:',
        'HOMEPATH=\\',
        'LOGONSERVER=\\\\BELOMAXORKA-PC',
        'OS=belomaxorka_space',
        'PATH=A:\\;A:\\System32',
        'PROCESSOR_ARCHITECTURE=x64',
        'PROMPT=$P$G',
        'SYSTEMDRIVE=A:',
        'SYSTEMROOT=A:\\',
        'TEMP=A:\\Temp',
        'TMP=A:\\Temp',
        'USERDOMAIN=BELOMAXORKA-PC',
        'USERNAME=guest',
        'USERPROFILE=A:\\Users\\guest'
    ].join('\n');
}

function cmdStart(args) {
    if (!args.trim()) return { output: 'The syntax of the command is incorrect.' };
    let url = args.trim().split(/\s+/)[0];
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    return { output: '' };
}

function cmdShutdown(args) {
    const flag = args.toLowerCase().trim();

    if (flag === '/s' || flag === '-s') {
        return { action: 'shutdown' };
    }
    if (flag === '/r' || flag === '-r') {
        return { action: 'cls' };
    }
    if (flag === '/a' || flag === '-a') {
        return { output: 'Unable to abort the system shutdown because no shutdown was in progress.' };
    }

    return { output: [
        'Usage: shutdown [/s | /r | /a]',
        '',
        '  /s    Shutdown the computer.',
        '  /r    Restart the computer.',
        '  /a    Abort a system shutdown.'
    ].join('\n') };
}

function cmdNetstat() {
    return [
        '',
        'Active Connections',
        '',
        '  Proto  Local Address          Foreign Address        State',
        '  TCP    127.0.0.1:80           belomaxorka:0          LISTENING',
        '  TCP    127.0.0.1:443          belomaxorka:0          LISTENING',
        '  TCP    127.0.0.1:49152        github.com:443         ESTABLISHED',
        '  TCP    127.0.0.1:49153        ws.audioscrobbler:443  ESTABLISHED',
        '  TCP    127.0.0.1:49154        t.me:443               TIME_WAIT',
        '  TCP    127.0.0.1:49155        genius.com:443         TIME_WAIT'
    ].join('\n');
}

function cmdNslookup(host) {
    const ip = (Math.floor(Math.random() * 223) + 1) + '.' +
               Math.floor(Math.random() * 256) + '.' +
               Math.floor(Math.random() * 256) + '.' +
               Math.floor(Math.random() * 256);

    return [
        'Server:  dns.belomaxorka.local',
        'Address:  127.0.0.1',
        '',
        'Non-authoritative answer:',
        'Name:    ' + host,
        'Address:  ' + ip
    ].join('\n');
}
