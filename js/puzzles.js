/* Puzzle generators. Each one is handed the real digit for its slot, so a
   recovered digit can never disagree with the vault code. Rounds are fully
   determined by a seed, which is what lets a refresh resume the same round.
   Generators return plain data; js/console.js draws the clickable tools. */
(function (root) {
  const CTV = root.CTV = root.CTV || {};

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const int = (r, min, max) => min + Math.floor(r() * (max - min + 1));
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  function shuffle(r, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const WORDS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];

  function caesar(text, shift) {
    return text.replace(/[A-Za-z]/g, ch => {
      const base = ch <= 'Z' ? 65 : 97;
      return String.fromCharCode(((ch.charCodeAt(0) - base + shift % 26 + 26) % 26) + base);
    });
  }

  function genCaesar(r, d, slot) {
    const plain = pick(r, ['THE DIGIT IS ', 'VAULT NUMBER IS ', 'YOUR CODE PIECE IS ', 'AGENT USE ']) + WORDS[d];
    return {
      type: 'caesar', slot, digit: d, title: 'Radio Intercept',
      teach: 'Every letter in this message was moved along the alphabet. Turn the wheel until it reads like English, then lock it in.',
      cipher: caesar(plain, 3), start: int(r, 9, 22),
      check: v => Number(v) === 3,
      explain: 'Every letter was moved 3 places. This is a Caesar cipher, named after Julius Caesar.',
      hints: ['Click the arrows one step at a time and watch for real words.', 'Turn the wheel until it says SHIFT 3, then lock it in.']
    };
  }

  const DECODERS = [
    { name: 'Base64', looks: 'Upper and lower case letters and numbers. Often ends in =' },
    { name: 'Binary', looks: 'Only 0s and 1s' },
    { name: 'Morse', looks: 'Dots and dashes' },
    { name: 'Hex', looks: 'Numbers and the letters A to F only' }
  ];

  function genBase64(r, d, slot) {
    const plain = pick(r, ['DIGIT=', 'vault-digit: ', 'key_fragment=', 'unlock value ']) + d;
    return {
      type: 'base64', slot, digit: d, title: 'Packet Capture',
      teach: 'We caught this data leaving the vault. Which decoder matches what it looks like? Pick one.',
      packet: btoa(plain), plain, tools: shuffle(r, DECODERS),
      check: v => v === 'Base64',
      explain: `It decoded to "${plain}". Base64 only disguises data, so it is never safe for secrets.`,
      hints: ['Look closely at the characters. Are there lower case letters? Letters past F?', 'Use the Base64 decoder.']
    };
  }

  function genHidden(r, d, slot) {
    const names = shuffle(r, ['Documents', 'Backups', 'Projects', 'Shared']).slice(0, 3);
    const target = int(r, 0, 2);
    const secret = pick(r, ['.vault_key', '.secret_digit', '.do_not_open', '.stash', '.ghost_file']);
    const decoys = shuffle(r, ['.cache', '.tmp_old', '.trash_bin']);
    const junk = shuffle(r, [
      ['budget.txt', 'Pizza fund: $4.15. Nothing useful here.'],
      ['old_todo.txt', '1. Change the vault password. 2. Stop using sticky notes.'],
      ['lunch_order.txt', 'Two mystery pizzas. Nothing useful here.'],
      ['readme.txt', 'Move along, nothing to see in the normal files.'],
      ['photo_day.txt', 'Retakes are on Thursday.'],
      ['notes.txt', 'I hid the digit where normal view will not show it.']
    ]);
    const folders = names.map((name, i) => ({
      name,
      files: [
        { name: junk[i * 2][0], text: junk[i * 2][1] },
        { name: junk[i * 2 + 1][0], text: junk[i * 2 + 1][1] },
        i === target
          ? { name: secret, hidden: true, secret: true, text: '' }
          : { name: decoys[i], hidden: true, text: 'Empty. Just crumbs. Try another folder.' }
      ]
    }));
    return {
      type: 'hidden', slot, digit: d, title: 'File Server',
      teach: 'The sysadmin hid a file on this server. Normal view will not show it. Change the view, then search the folders.',
      folders, secret,
      check: v => v === secret,
      explain: 'Files whose names start with a dot stay hidden unless you ask to see them.',
      hints: ['Turn on the Show hidden files switch.', `Turn on Show hidden files, open ${names[target]}, then click ${secret}.`]
    };
  }

  const ORGS = [
    { name: 'Maplecrest School Board', base: 'maplecrest' },
    { name: 'NorthPeak Bank', base: 'northpeakbank' },
    { name: 'PixelHaven Games', base: 'pixelhaven' },
    { name: 'BrightPath Library', base: 'brightpathlibrary' }
  ];

  function lookalike(base) {
    if (base.includes('l')) return base.replace('l', '1');
    if (base.includes('o')) return base.replace('o', '0');
    return base.replace('e', '3');
  }

  function genPhishing(r, d, slot) {
    const org = pick(r, ORGS);
    const domain = org.base + '.ca';
    const fakeHost = pick(r, [
      `${domain}.account-verify.net`,
      `secure-${domain}`,
      `${lookalike(org.base)}.ca`,
      `${org.base}-login.net`
    ]);
    const real = [
      `https://portal.${domain}/help`,
      `https://www.${domain}/news`,
      `https://${domain}/contact`,
      `https://accounts.${domain}/settings`
    ];
    const fake = `https://${fakeHost}/login`;
    const links = shuffle(r, [fake, ...shuffle(r, real).slice(0, 3)]);
    return {
      type: 'phishing', slot, digit: d, title: 'Suspicious Email',
      teach: 'Real links end in the official name, right before the first single slash. Click the FAKE link.',
      from: `${org.name} Support`, subject: 'URGENT!! Your account closes TODAY',
      body: 'Click a link below right now or lose everything!!!',
      domain, links,
      check: v => v === fake,
      explain: `${fakeHost} is not ${domain}. Scammers use look-alike names to fool you.`,
      hints: [`Look at the part of each link before the first single slash. It must end in ${domain}.`, `The fake link starts with https://${fakeHost.slice(0, 12)}`]
    };
  }

  function genBinary(r, d, slot) {
    const choices = [];
    for (let v = 10; v <= 63; v++) if (v % 10 === d) choices.push(v);
    const value = pick(r, choices);
    const bits = value.toString(2).padStart(6, '0').split('').map(Number);
    const places = [32, 16, 8, 4, 2, 1];
    const on = places.filter((_, i) => bits[i]);
    return {
      type: 'binary', slot, digit: d, title: 'Sensor Readout',
      teach: 'Computers count in binary. Click every number that has a lit 1 above it to add them up, then lock in the total.',
      bits, places, value,
      check: v => Number(v) === value,
      explain: `${bits.join('')} in binary is ${on.join(' + ')} = ${value}. The digit is its last number.`,
      hints: ['Only click the numbers under a bulb that is lit.', `Click these:  ${on.join(' + ')}`]
    };
  }

  function genLog(r, d, slot) {
    const lastOctet = int(r, 1, 24) * 10 + d;
    const ip = `${pick(r, [45, 77, 91, 103, 185, 203])}.${int(r, 10, 220)}.${int(r, 2, 250)}.${lastOctet}`;
    const users = shuffle(r, ['msmith', 'jpatel', 'kchen', 'aroy', 'tnguyen', 'lgarcia', 'bwilson']);
    const hosts = shuffle(r, [11, 14, 23, 27, 36, 42, 58, 63]).map(n => `10.0.4.${n}`);
    const rows = [];
    for (let i = 0; i < 6; i++) rows.push({ ip: hosts[i], status: 'OK', user: users[i] });
    for (let i = 0; i < 5; i++) rows.push({ ip, status: 'FAILED', user: 'admin' });
    rows.push({ ip: hosts[6], status: 'FAILED', user: users[6] });
    let clock = int(r, 18, 19) * 3600 + int(r, 5, 40) * 60;
    const stamp = s => [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
      .map(n => String(n).padStart(2, '0')).join(':');
    return {
      type: 'log', slot, digit: d, title: 'Server Log',
      teach: 'One computer keeps failing to log in as admin. That is an attack. Click any line from the attacker.',
      rows: shuffle(r, rows).map(row => {
        clock += int(r, 3, 41);
        return Object.assign({ time: stamp(clock) }, row);
      }),
      check: v => v === ip,
      explain: `${ip} tried admin over and over. The digit is the last number of that IP address.`,
      hints: ['Look for the same address with FAILED and admin on many lines.', `The attacker is ${ip}.`]
    };
  }

  const WEAK = ['password1', 'qwerty123', 'iloveyou', 'soccer2012', 'letmein', 'abc12345', 'dragon99', '11111111', 'hockey', 'admin123'];
  const STRONG = ['Tr!9kVq#2Lm$', 'b7$Xq!mZ2@wP', 'G#4vN8*rKd1!', 'zP&6tY!e9Qs2', 'M@3xL7^uJw5%', 'h2!Fy#8RnC$k'];

  function genPassword(r, d, slot) {
    const askStrong = r() < 0.5;
    const weak = shuffle(r, WEAK), strong = shuffle(r, STRONG);
    const target = askStrong ? strong[0] : weak[0];
    const others = askStrong ? weak.slice(0, 3) : strong.slice(0, 3);
    return {
      type: 'password', slot, digit: d, title: 'Password Audit',
      teach: `Click the ${askStrong ? 'STRONGEST' : 'WEAKEST'} password. Strong ones are long and mix UPPER, lower, numbers and symbols.`,
      askStrong, options: shuffle(r, [target, ...others]),
      check: v => v === target,
      explain: 'Long and random beats short and familiar. Attackers try common words first.',
      hints: ['Common words and simple patterns are weak. Random mixes are strong.', `The answer is ${target}`]
    };
  }

  /* ---- Hard mode: every lock takes several steps, and hints only ever nudge. ---- */

  const backwards = s => s.split('').reverse().join('');

  function genCaesarHard(r, d, slot) {
    const plain = pick(r, ['THE DIGIT IS ', 'VAULT NUMBER IS ', 'YOUR CODE PIECE IS ', 'AGENT USE ']) + WORDS[d];
    const shift = int(r, 1, 25);
    let start = int(r, 0, 25);
    if (start === shift) start = (start + 7) % 26;
    return {
      type: 'caesar', slot, digit: d, title: 'Radio Intercept',
      teach: 'Unknown shift. Something else is wrong with it too.',
      cipher: caesar(backwards(plain), shift), start, shift,
      check: v => Number(v) === shift,
      explain: `Shift ${shift}, and the whole message was written backwards.`,
      hints: ['No setting will read normally. Try reading the end of the message first.', 'The message is backwards. Watch the last word for THE or USE spelled in reverse.']
    };
  }

  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  function base32(s) {
    let bits = '';
    for (const ch of s) bits += ch.charCodeAt(0).toString(2).padStart(8, '0');
    let out = '';
    for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
    while (out.length % 8) out += '=';
    return out;
  }
  const hex = s => [...s].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  const ENCODERS = { Base64: s => btoa(s), Base32: base32, Hex: hex };

  /* Real decoders. They return null when the input is not valid for that format. */
  const printable = s => (s && /^[\x20-\x7e]+$/.test(s) ? s : null);
  const fromBytes = bytes => printable(String.fromCharCode(...bytes));
  const REAL_DECODERS = {
    Base64(s) {
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s) || s.length % 4) return null;
      try { return printable(atob(s)); } catch (e) { return null; }
    },
    Base32(s) {
      if (!/^[A-Z2-7]+=*$/.test(s)) return null;
      let bits = '';
      for (const ch of s.replace(/=+$/, '')) bits += B32.indexOf(ch).toString(2).padStart(5, '0');
      const bytes = [];
      for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
      return fromBytes(bytes);
    },
    Hex(s) {
      if (!/^([0-9a-fA-F]{2})+$/.test(s)) return null;
      return fromBytes(s.match(/../g).map(x => parseInt(x, 16)));
    },
    Binary(s) {
      const c = s.replace(/\s/g, '');
      if (!/^[01]+$/.test(c) || c.length % 8) return null;
      return fromBytes(c.match(/.{8}/g).map(x => parseInt(x, 2)));
    }
  };

  function genBase64Hard(r, d, slot) {
    const plain = pick(r, ['Digit=', 'vault-Digit: ', 'key_Fragment=', 'unlock Value ']) + d;
    const layers = shuffle(r, ['Base64', 'Base32', 'Hex']);
    const packet = layers.reduce((text, name) => ENCODERS[name](text), plain);
    return {
      type: 'base64', slot, digit: d, title: 'Packet Capture',
      teach: 'Encoded more than once. Peel it back, then lock in the readable text.',
      packet, plain,
      check: v => v === plain,
      explain: `Three layers deep: ${layers.slice().reverse().join(', then ')}.`,
      hints: ['Hex uses only 0-9 and a-f. Base32 is capitals and 2-7. Base64 mixes upper and lower case.', 'Look at the output after every step. It shows you which decoder comes next.']
    };
  }

  function genHiddenHard(r, d, slot) {
    const names = shuffle(r, ['Documents', 'Backups', 'Projects', 'Shared', 'Archive', 'System']).slice(0, 5);
    const digitSum = n => String(n).split('').reduce((a, c) => a + Number(c), 0);
    const pickNum = test => { for (;;) { const n = int(r, 100, 999); if (test(n)) return n; } };
    const div7 = n => n % 7 === 0, even = n => digitSum(n) % 2 === 0;
    const real = pickNum(n => div7(n) && even(n));
    const decoys = new Set();
    while (decoys.size < 2) decoys.add(pickNum(n => div7(n) && !even(n)));
    while (decoys.size < 4) decoys.add(pickNum(n => !div7(n) && even(n)));
    const numbers = shuffle(r, [real, ...decoys]);
    const noteSpots = shuffle(r, [0, 1, 2, 3, 4]).slice(0, 2);
    const junk = shuffle(r, [
      ['budget.txt', 'Pizza fund: $4.15.'], ['old_todo.txt', 'Change the vault password.'],
      ['lunch_order.txt', 'Two mystery pizzas.'], ['readme.txt', 'Nothing to see here.'], ['photo_day.txt', 'Retakes on Thursday.']
    ]);
    const secret = `.key_${real}`;
    const folders = names.map((name, i) => {
      let visible = { name: junk[i][0], text: junk[i][1] };
      if (i === noteSpots[0]) visible = { name: 'memo_1.txt', text: 'First rule: the real key number divides evenly by 7.' };
      if (i === noteSpots[1]) visible = { name: 'memo_2.txt', text: 'Second rule: the digits of the real key number add up to an even number.' };
      return { name, files: [visible, { name: `.key_${numbers[i]}`, hidden: true }] };
    });
    return {
      type: 'hidden', slot, digit: d, title: 'File Server',
      teach: 'Five hidden keys. Only one is real. A fake trips the firewall.',
      folders, secret,
      check: v => v === secret,
      explain: `${secret}: ${real} divides by 7 and its digits add up to ${digitSum(real)}.`,
      hints: ['There are two memos in different folders. You need both.', 'Rule out every key that fails the first memo before you test the second.']
    };
  }

  function genPhishingHard(r, d, slot) {
    const org = pick(r, ORGS);
    const domain = org.base + '.ca';
    const fakes = shuffle(r, [
      `https://${lookalike(org.base)}.ca/login`,
      `https://${domain}.secure-login.net/help`,
      `https://${org.base}-ca.net/news`,
      `https://www-${org.base}.ca/contact`,
      `https://${domain}@account-check.net/settings`,
      `https://secure-verify.net/${domain}/login`,
      `https://portal.${org.base}.ca.verify-id.com/help`
    ]).slice(0, 4);
    const real = pick(r, [`https://portal.${domain}/help`, `https://www.${domain}/news`, `https://accounts.${domain}/settings`, `https://library.${domain}/search`]);
    return {
      type: 'phishing', slot, digit: d, title: 'Suspicious Email',
      teach: 'Only ONE of these links is real. Click it.',
      from: `${org.name} <support@${domain}>`, subject: 'Action needed on your account',
      body: 'Please review your account using the link below.',
      domain: null, links: shuffle(r, [real, ...fakes]),
      check: v => v === real,
      explain: `Only ${real.split('/')[2]} truly belongs to ${domain}. Everything before the last dots and after an @ can lie.`,
      hints: ['The real website is whatever comes after the @ in the sender address.', 'A link is only real if the sender\'s domain comes right before the first single slash, with nothing after it.']
    };
  }

  function genBinaryHard(r, d, slot) {
    const choices = [];
    for (let v = 512; v <= 1023; v++) if (v % 10 === d) choices.push(v);
    const value = pick(r, choices);
    const bits = value.toString(2).padStart(10, '0').split('').map(Number);
    return {
      type: 'binary', slot, digit: d, title: 'Sensor Readout',
      teach: 'Ten bits, no help. Convert it to decimal.',
      bits, value,
      check: v => Number(v) === value,
      explain: `${bits.join('')} in binary is ${value}. The digit is its last number.`,
      hints: ['The rightmost bulb is worth 1, and each bulb to the left is worth double.', 'From the left the bulbs are worth 512, 256, 128, 64, 32, 16, 8, 4, 2, 1.']
    };
  }

  function genLogHard(r, d, slot) {
    const outside = () => `${pick(r, [45, 77, 91, 103, 185, 203, 52, 142])}.${int(r, 10, 220)}.${int(r, 2, 250)}.`;
    const ip = outside() + (int(r, 1, 24) * 10 + d);
    const forgetful = outside() + int(r, 10, 249);
    const partner = outside() + int(r, 10, 249);
    const users = shuffle(r, ['msmith', 'jpatel', 'kchen', 'aroy', 'tnguyen', 'lgarcia', 'bwilson']);
    const hosts = shuffle(r, [11, 14, 23, 27, 36, 42, 58, 63]).map(n => `10.0.4.${n}`);
    const rows = [];
    for (let i = 0; i < 3; i++) rows.push({ ip: hosts[i], status: '200', user: users[i] });
    ['admin', 'root', 'backup', 'test'].forEach(user => rows.push({ ip, status: '401', user }));
    for (let i = 0; i < 3; i++) rows.push({ ip: forgetful, status: '401', user: users[3] });
    rows.push({ ip: partner, status: '200', user: 'vendor' });
    rows.push({ ip: hosts[3], status: '401', user: users[4] }, { ip: hosts[3], status: '401', user: users[4] });
    const ordered = shuffle(r, rows);
    ordered.push({ ip: hosts[3], status: '200', user: users[4] }, { ip, status: '200', user: 'guest' });
    ordered.push(...shuffle(r, [{ ip: hosts[4], status: '200', user: users[5] }]));
    let clock = int(r, 18, 19) * 3600 + int(r, 5, 40) * 60;
    const stamp = s => [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
      .map(n => String(n).padStart(2, '0')).join(':');
    return {
      type: 'log', slot, digit: d, title: 'Server Log',
      teach: 'An outsider broke in. 401 means denied, 200 means allowed. Click them.',
      rows: ordered.map(row => {
        clock += int(r, 3, 41);
        return Object.assign({ time: stamp(clock) }, row);
      }),
      check: v => v === ip,
      explain: `${ip} tried several different accounts until one let them in.`,
      hints: ['Addresses starting with 10. are inside the school.', 'Someone who forgot a password retries one account. An attacker tries many accounts.']
    };
  }

  const DISGUISED = ['P@ssw0rd2024!', 'Summer2024!!', 'Qwerty!23456', 'Welc0me#2025', 'Dragon$1234', 'L3tme!n2024', 'Hockey#2012!', 'Adm1n!stration'];
  const PW_CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!#$%&*@^';
  const randomPw = (r, n) => Array.from({ length: n }, () => pick(r, PW_CHARS.split(''))).join('');

  function genPasswordHard(r, d, slot) {
    const order = [pick(r, DISGUISED), randomPw(r, 7), randomPw(r, 11), randomPw(r, 17)];
    return {
      type: 'password', slot, digit: d, title: 'Password Audit',
      teach: 'Click all four, from WEAKEST to STRONGEST.',
      ranked: true, options: shuffle(r, order),
      check: v => v === order.join('\n'),
      explain: 'Attackers try common words with swapped letters first. After that, random length wins.',
      hints: ['A long password made from a common word is the weakest of all.', 'Among random passwords, every extra character makes it far stronger.']
    };
  }

  const GEN = {
    caesar: genCaesar, base64: genBase64, hidden: genHidden, phishing: genPhishing,
    binary: genBinary, log: genLog, password: genPassword
  };
  const HARD = {
    caesar: genCaesarHard, base64: genBase64Hard, hidden: genHiddenHard, phishing: genPhishingHard,
    binary: genBinaryHard, log: genLogHard, password: genPasswordHard
  };

  function generateRound(seed, forcedTypes, tier) {
    const r = rng(seed);
    const hard = tier === 'hard';
    const table = hard ? HARD : GEN;
    const digits = [0, 1, 2, 3].map(() => int(r, 0, 9));
    const types = forcedTypes || shuffle(r, Object.keys(GEN)).slice(0, 4);
    const puzzles = types.map((t, i) => Object.assign(table[t](r, digits[i], i), { hard }));
    return { code: digits.join(''), puzzles };
  }

  CTV.Puzzles = { generateRound, caesar, decoders: REAL_DECODERS, types: Object.keys(GEN) };
})(typeof window !== 'undefined' ? window : globalThis);
