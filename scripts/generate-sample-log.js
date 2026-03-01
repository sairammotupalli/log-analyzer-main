#!/usr/bin/env node
// scripts/generate-sample-log.js
// Generates sample_logs/zscaler_sample.log — ~800 rows of realistic ZScaler
// web-proxy traffic with embedded anomaly patterns for the SOC Log Analyzer demo.
'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Timestamp Helper ─────────────────────────────────────────────────────────
// RFC 2822 format: "Wed, 15 Jan 2025 09:15:00 GMT"
// • Starts with DOW abbreviation → passes isHeaderRow() check in logParser.ts
// • Explicit "GMT" suffix → new Date() always parses as UTC
function fmtDate(d) {
  const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const p = n => String(n).padStart(2, '0');
  return `${DAYS[d.getUTCDay()]}, ${p(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} GMT`;
}

// Base: Wednesday, 15 Jan 2025 (UTC midnight)
const DAY = new Date('2025-01-15T00:00:00.000Z');
function at(h, m, s = 0) {
  return new Date(DAY.getTime() + (h * 3600 + m * 60 + s) * 1000);
}

// ─── CSV Helper ───────────────────────────────────────────────────────────────
// 34 positional fields — see logParser.ts for the mapping
function row(fields) {
  return fields.map(f => {
    const s = (f === null || f === undefined) ? 'None' : String(f);
    // Quote fields that contain commas or quotes
    return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',');
}

// ─── Field Factory ────────────────────────────────────────────────────────────
// Returns an array of 34 CSV field values for one log entry.
//
// Field order (index → logParser.ts field):
//  0  time          8  respsize        16 riskscore       24 respcode
//  1  login         9  reqdatasize     17 dlpeng          25 ua
//  2  proto        10  respdatasize    18 dlpdict         26 keyprotectiontype
//  3  url          11  urlsupercat     19 location        27 ruletype
//  4  action       12  urlcat          20 dept            28 rulelabel
//  5  appname      13  urlsubcat       21 cip             29 unscannabletype
//  6  appclass     14  threatname      22 sip             30 ssldecrypted
//  7  reqsize      15  malwarecat      23 reqmethod       31 reason
//                                                         32 threatseverity
//                                                         33 contenttype

function entry({
  time, login, proto = 'HTTPS', url, action = 'Allowed',
  appname = 'General Browsing', appclass = 'General Browsing',
  reqsize = 1280, respsize = 8192, reqdatasize = 256, respdatasize = 4096,
  urlsupercat = 'Business and Economy', urlcat = 'Technology',
  urlsubcat = 'None',
  threatname = 'None', malwarecat = 'None', riskscore = 0,
  dlpeng = 'None', dlpdict = 'None',
  location = 'HQ-London', dept = 'Engineering',
  cip, sip = '104.21.8.200',
  reqmethod = 'GET', respcode = '200',
  ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  keyprotectiontype = 'None', ruletype = 'URL Filtering',
  rulelabel = 'Allow Business', unscannabletype = 'None',
  ssldecrypted = 'Yes', reason = 'Allowed', threatseverity = 'None',
  contenttype = 'text/html',
}) {
  return row([
    fmtDate(time),           // 0  time
    login,                   // 1  login
    proto,                   // 2  proto
    url,                     // 3  url
    action,                  // 4  action
    appname,                 // 5  appname
    appclass,                // 6  appclass
    reqsize,                 // 7  reqsize
    respsize,                // 8  respsize
    reqdatasize,             // 9  reqdatasize
    respdatasize,            // 10 respdatasize
    urlsupercat,             // 11 urlsupercat
    urlcat,                  // 12 urlcat
    urlsubcat,               // 13 urlsubcat
    threatname,              // 14 threatname
    malwarecat,              // 15 malwarecat
    riskscore,               // 16 riskscore
    dlpeng,                  // 17 dlpeng
    dlpdict,                 // 18 dlpdict
    location,                // 19 location
    dept,                    // 20 dept
    cip,                     // 21 cip
    sip,                     // 22 sip
    reqmethod,               // 23 reqmethod
    respcode,                // 24 respcode
    ua,                      // 25 ua
    keyprotectiontype,       // 26 keyprotectiontype
    ruletype,                // 27 ruletype
    rulelabel,               // 28 rulelabel
    unscannabletype,         // 29 unscannabletype
    ssldecrypted,            // 30 ssldecrypted
    reason,                  // 31 reason
    threatseverity,          // 32 threatseverity
    contenttype,             // 33 contenttype
  ]);
}

// ─── Data Sets ────────────────────────────────────────────────────────────────

const USERS = [
  { login: 'alice.j@corp.com',   cip: '10.0.1.101', dept: 'Engineering'    },
  { login: 'bob.s@corp.com',     cip: '10.0.1.102', dept: 'Marketing'      },
  { login: 'carol.m@corp.com',   cip: '10.0.1.103', dept: 'Finance'        },
  { login: 'dave.w@corp.com',    cip: '10.0.1.104', dept: 'Engineering'    },
  { login: 'emma.t@corp.com',    cip: '10.0.1.105', dept: 'HR'             },
  { login: 'frank.r@corp.com',   cip: '10.0.1.106', dept: 'Operations'     },
  { login: 'grace.h@corp.com',   cip: '10.0.1.107', dept: 'Sales'          },
  { login: 'henry.p@corp.com',   cip: '10.0.1.108', dept: 'Engineering'    },
  { login: 'ivan.k@corp.com',    cip: '10.0.1.109', dept: 'Marketing'      },
  { login: 'jane.l@corp.com',    cip: '10.0.1.110', dept: 'Finance'        },
];

const NORMAL_SITES = [
  { url: 'https://mail.google.com/mail/u/0/#inbox',                sip: '142.250.80.69',  urlsupercat: 'Web-based Email',          urlcat: 'Web-based Email',    respsize: 45120,  riskscore: 5  },
  { url: 'https://www.google.com/search?q=typescript+tutorial',    sip: '142.250.68.100', urlsupercat: 'Business and Economy',     urlcat: 'Search Engines',     respsize: 18432,  riskscore: 0  },
  { url: 'https://github.com/acme-corp/backend/pulls',             sip: '140.82.114.3',   urlsupercat: 'Business and Economy',     urlcat: 'Technology',         respsize: 92160,  riskscore: 5  },
  { url: 'https://slack.com/messages/C0DEVTEAM',                   sip: '54.192.78.200',  urlsupercat: 'Business and Economy',     urlcat: 'Collaboration Tools', respsize: 32768, riskscore: 0  },
  { url: 'https://confluence.corp.internal/wiki/spaces/ENG',       sip: '10.10.0.50',     urlsupercat: 'Business and Economy',     urlcat: 'Intranet Sites',     respsize: 28672,  riskscore: 0  },
  { url: 'https://jira.corp.internal/browse/PROJ-1234',            sip: '10.10.0.51',     urlsupercat: 'Business and Economy',     urlcat: 'Intranet Sites',     respsize: 24576,  riskscore: 0  },
  { url: 'https://docs.microsoft.com/en-us/azure/architecture',    sip: '13.107.6.152',   urlsupercat: 'Business and Economy',     urlcat: 'Technology',         respsize: 65536,  riskscore: 0  },
  { url: 'https://stackoverflow.com/questions/tagged/nodejs',       sip: '151.101.65.69',  urlsupercat: 'Business and Economy',     urlcat: 'Technology',         respsize: 54272,  riskscore: 0  },
  { url: 'https://www.npmjs.com/package/typescript',               sip: '104.16.25.34',   urlsupercat: 'Business and Economy',     urlcat: 'Technology',         respsize: 12288,  riskscore: 0  },
  { url: 'https://accounts.google.com/o/oauth2/auth',              sip: '142.250.80.1',   urlsupercat: 'Business and Economy',     urlcat: 'Internet Services',  respsize: 4096,   riskscore: 0  },
  { url: 'https://s3.amazonaws.com/prod-artifacts/build-123.zip',  sip: '52.216.8.70',    urlsupercat: 'Business and Economy',     urlcat: 'Cloud Storage',      respsize: 2097152, riskscore: 10 },
  { url: 'https://api.github.com/repos/acme-corp/backend/actions', sip: '140.82.112.5',   urlsupercat: 'Business and Economy',     urlcat: 'Technology',         respsize: 8192,   riskscore: 5  },
  { url: 'https://www.linkedin.com/feed',                          sip: '108.174.10.10',  urlsupercat: 'Social Networking',        urlcat: 'Social Networking',  respsize: 73728,  riskscore: 10 },
  { url: 'https://calendar.google.com/calendar/r',                  sip: '142.250.80.110', urlsupercat: 'Web-based Email',          urlcat: 'Web-based Email',    respsize: 28672,  riskscore: 0  },
  { url: 'https://zoom.us/j/98765432100',                          sip: '170.114.4.1',    urlsupercat: 'Business and Economy',     urlcat: 'Collaboration Tools', respsize: 16384, riskscore: 0  },
  { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',           sip: '172.217.20.174', urlsupercat: 'Streaming Media',          urlcat: 'Streaming Media',    respsize: 524288, riskscore: 15 },
  { url: 'https://hub.docker.com/_/node',                          sip: '44.197.161.250', urlsupercat: 'Business and Economy',     urlcat: 'Technology',         respsize: 20480,  riskscore: 0  },
  { url: 'https://registry.npmjs.org/express',                     sip: '104.16.24.34',   urlsupercat: 'Business and Economy',     urlcat: 'Technology',         respsize: 6144,   riskscore: 0  },
  { url: 'https://chat.openai.com/',                               sip: '104.18.32.47',   urlsupercat: 'Business and Economy',     urlcat: 'Technology',         respsize: 131072, riskscore: 20 },
  { url: 'https://figma.com/file/abc123/Design-System',            sip: '35.172.136.200', urlsupercat: 'Business and Economy',     urlcat: 'Technology',         respsize: 163840, riskscore: 0  },
];

const lines = [];

// ─── Section 1: Normal Baseline Traffic (~540 rows) ───────────────────────────
// 10 users × 54 requests each, spread across 08:00–16:59 UTC

let rowCount = 0;
for (let ui = 0; ui < USERS.length; ui++) {
  const user = USERS[ui];
  for (let i = 0; i < 54; i++) {
    const siteIdx  = (ui * 7 + i * 3) % NORMAL_SITES.length;
    const site     = NORMAL_SITES[siteIdx];
    const hourBase = 8 + Math.floor(i / 6);                      // 08:00–16:xx
    const minOff   = (ui * 13 + i * 7) % 60;
    const secOff   = (ui * 31 + i * 11) % 60;
    const t        = at(hourBase, minOff, secOff);

    lines.push(entry({ time: t, login: user.login, cip: user.cip, dept: user.dept, ...site }));
    rowCount++;
  }
}
// → 540 rows

// ─── Section 2: HIGH_REQUEST_RATE — IP 172.17.3.49 (210 rows in 5 min) ───────
// Window: 09:15:00 – 09:19:59 UTC (300 seconds), 210 requests → ~1 request/1.4s
// Triggers R1: same IP > 100 requests in 5-minute window

const SCAN_IP   = '172.17.3.49';
const SCAN_USER = 'svc-scanner@corp.com';
const SCAN_URLS = [
  'http://10.10.0.50/api/users',
  'http://10.10.0.50/api/sessions',
  'http://10.10.0.50/api/config',
  'http://10.10.0.51/api/health',
  'http://10.10.0.52/metrics',
  'http://10.10.0.53/admin',
  'http://10.10.0.54/api/accounts',
  'http://10.10.0.55/debug',
];

for (let i = 0; i < 210; i++) {
  const secOffset = Math.floor(i * (299 / 209));  // spread across 300 s
  const t = at(9, 15, secOffset);
  lines.push(entry({
    time: t, login: SCAN_USER, cip: SCAN_IP,
    sip: '10.10.0.50',
    url: SCAN_URLS[i % SCAN_URLS.length],
    proto: 'HTTP',
    urlsupercat: 'Business and Economy', urlcat: 'Intranet Sites',
    reqsize: 512, respsize: 2048, reqdatasize: 0, respdatasize: 1024,
    riskscore: 20,
    dept: 'Engineering', location: 'HQ-London',
    appname: 'General Browsing', appclass: 'General Browsing',
    ssldecrypted: 'No',
  }));
}
// → 210 rows (total: 750)

// ─── Section 3: REPEATED_BLOCK — IP 10.0.0.5 (15 blocked rows) ──────────────
// Triggers R2: same IP > 10 blocked requests
// Many rows also use malicious urlsupercat → R8 MALICIOUS_CATEGORY
// Some have high riskscore → R4 HIGH_RISK_SCORE

const BLOCKED_IP   = '10.0.0.5';
const BLOCKED_USER = 'malware.host@corp.com';
const MALWARE_SITES = [
  { url: 'http://evil-botnet.ru/gate.php',             sip: '185.220.101.1',  urlsupercat: 'Malicious Content', urlcat: 'Botnet'                 },
  { url: 'http://phishing-kit.xyz/fake-login',         sip: '185.234.219.50', urlsupercat: 'Phishing',          urlcat: 'Phishing'               },
  { url: 'http://malware-drop.io/payload.exe',         sip: '185.220.101.5',  urlsupercat: 'Malicious Content', urlcat: 'Malware'                },
  { url: 'http://c2-server.biz/beacon',                sip: '193.42.60.20',   urlsupercat: 'Command and Control', urlcat: 'Botnet'               },
  { url: 'http://spyware-track.net/collect',           sip: '185.234.219.60', urlsupercat: 'Spyware/Adware',    urlcat: 'Spyware/Adware'         },
];

const BLOCK_HOURS = [9, 9, 10, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15];
const BLOCK_MINS  = [5, 32, 7, 41, 55, 3, 48, 12, 37, 5, 44, 20, 58, 9, 47];

for (let i = 0; i < 15; i++) {
  const site = MALWARE_SITES[i % MALWARE_SITES.length];
  lines.push(entry({
    time:       at(BLOCK_HOURS[i], BLOCK_MINS[i]),
    login:      BLOCKED_USER,
    cip:        BLOCKED_IP,
    sip:        site.sip,
    url:        site.url,
    action:     'Blocked',
    proto:      'HTTP',
    urlsupercat: site.urlsupercat,
    urlcat:     site.urlcat,
    riskscore:  85 + (i % 10),
    respsize:   0,
    respdatasize: 0,
    respcode:   '403',
    ruletype:   'URL Filtering',
    rulelabel:  'Block Malicious',
    reason:     'Policy',
    dept:       'Unknown',
    location:   'HQ-London',
  }));
}
// → 15 rows (total: 765)

// ─── Section 4: THREAT_DETECTED — EICAR test file (3 rows) ──────────────────
// Triggers R3: threatname != None

const EICAR_ENTRIES = [
  { cip: '10.0.0.5',   sip: '45.33.32.156',   login: 'malware.host@corp.com', dept: 'Unknown'     },
  { cip: '172.16.5.23', sip: '104.21.90.100',  login: 'test.user@corp.com',   dept: 'Engineering'  },
  { cip: '10.0.1.199', sip: '199.232.37.140',  login: 'dev.intern@corp.com',  dept: 'Engineering'  },
];

const EICAR_TIMES = [at(10, 14), at(13, 7), at(14, 52)];

for (let i = 0; i < 3; i++) {
  const e = EICAR_ENTRIES[i];
  lines.push(entry({
    time:        EICAR_TIMES[i],
    login:       e.login,
    cip:         e.cip,
    sip:         e.sip,
    url:         'http://www.eicar.org/download/eicar.com.txt',
    action:      'Blocked',
    proto:       'HTTP',
    urlsupercat: 'Malicious Content',
    urlcat:      'Malware',
    threatname:  'EICAR_Test_File',
    malwarecat:  'Malware',
    riskscore:   100,
    respsize:    0,
    respdatasize: 0,
    respcode:    '403',
    ruletype:    'Anti-Malware',
    rulelabel:   'Block Known Threats',
    reason:      'Policy',
    threatseverity: 'Critical',
    dept:        e.dept,
    location:    'HQ-London',
  }));
}
// → 3 rows (total: 768)

// ─── Section 5: SUSPICIOUS_UA — curl / python-requests (8 rows) ──────────────
// Triggers R5: ua matches /curl|python|wget|scrapy/.../i
// 3 IPs × 2-3 requests each → 3 SUSPICIOUS_UA anomalies

const UA_SCANS = [
  { cip: '10.0.1.220', login: 'dev.ops@corp.com', ua: 'curl/7.84.0',                          count: 3, url: 'http://10.10.0.50/api/config',   dept: 'Operations' },
  { cip: '10.0.1.221', login: 'svc-ci@corp.com',  ua: 'python-requests/2.28.1',               count: 3, url: 'http://10.10.0.51/metrics',       dept: 'Engineering' },
  { cip: '10.0.1.222', login: 'svc-monitor@corp.com', ua: 'wget/1.21.3 (linux-gnu)',            count: 2, url: 'http://10.10.0.52/health',       dept: 'Operations' },
];

let uaOffset = 0;
for (const ua of UA_SCANS) {
  for (let i = 0; i < ua.count; i++) {
    lines.push(entry({
      time:        at(11, 20 + uaOffset, i * 30),
      login:       ua.login,
      cip:         ua.cip,
      sip:         '10.10.0.50',
      url:         ua.url,
      proto:       'HTTP',
      ua:          ua.ua,
      urlsupercat: 'Business and Economy', urlcat: 'Intranet Sites',
      riskscore:   30,
      dept:        ua.dept,
      ssldecrypted: 'No',
    }));
    uaOffset++;
  }
}
// → 8 rows (total: 776)

// ─── Section 6: OFF_HOURS_ACCESS — 2:00–2:45 AM UTC (12 rows) ────────────────
// Triggers R6: UTC hour < 7, count >= 5 per IP
// IP 10.0.1.250: 8 requests (>= 5 min threshold) → anomaly
// IP 10.0.1.251: 4 requests (< 5 min threshold) → no anomaly

const OFF_HOURS_ENTRIES = [
  // IP 10.0.1.250 — 8 requests (triggers anomaly)
  { cip: '10.0.1.250', login: 'night.ops@corp.com', m: 0,  s: 5  },
  { cip: '10.0.1.250', login: 'night.ops@corp.com', m: 5,  s: 12 },
  { cip: '10.0.1.250', login: 'night.ops@corp.com', m: 11, s: 44 },
  { cip: '10.0.1.250', login: 'night.ops@corp.com', m: 18, s: 3  },
  { cip: '10.0.1.250', login: 'night.ops@corp.com', m: 25, s: 29 },
  { cip: '10.0.1.250', login: 'night.ops@corp.com', m: 31, s: 0  },
  { cip: '10.0.1.250', login: 'night.ops@corp.com', m: 38, s: 51 },
  { cip: '10.0.1.250', login: 'night.ops@corp.com', m: 44, s: 7  },
  // IP 10.0.1.251 — 4 requests (below threshold, no anomaly)
  { cip: '10.0.1.251', login: 'remote.user@corp.com', m: 3,  s: 20 },
  { cip: '10.0.1.251', login: 'remote.user@corp.com', m: 17, s: 45 },
  { cip: '10.0.1.251', login: 'remote.user@corp.com', m: 30, s: 10 },
  { cip: '10.0.1.251', login: 'remote.user@corp.com', m: 42, s: 55 },
];

for (const e of OFF_HOURS_ENTRIES) {
  lines.push(entry({
    time:        at(2, e.m, e.s),   // 02:xx:xx UTC — before 07:00 UTC
    login:       e.login,
    cip:         e.cip,
    sip:         '10.10.0.50',
    url:         'http://10.10.0.50/api/status',
    proto:       'HTTP',
    urlsupercat: 'Business and Economy', urlcat: 'Intranet Sites',
    riskscore:   10,
    dept:        'Operations',
    location:    'Remote',
    ssldecrypted: 'No',
  }));
}
// → 12 rows (total: 788)

// ─── Section 7: LARGE_TRANSFER — 78 MB download (2 rows) ─────────────────────
// Triggers R7: respdatasize > 52,428,800 (50 MB)

const LARGE_ENTRIES = [
  { cip: '10.0.1.200', login: 'data.analyst@corp.com', size: 78_643_200, sip: '203.0.113.50', url: 'https://data-lake.external.io/export/financial-q4-2024.zip', dept: 'Finance'      },
  { cip: '10.0.1.201', login: 'backup.svc@corp.com',   size: 104_857_600, sip: '198.51.100.5', url: 'https://offsite-backup.io/snapshot-20250115.tar.gz',       dept: 'Operations'   },
];

for (const e of LARGE_ENTRIES) {
  lines.push(entry({
    time:        at(15, e.cip === '10.0.1.200' ? 7 : 42),
    login:       e.login,
    cip:         e.cip,
    sip:         e.sip,
    url:         e.url,
    proto:       'HTTPS',
    urlsupercat: 'Business and Economy', urlcat: 'Cloud Storage',
    reqsize:     1024,
    respsize:    e.size + 10240,
    reqdatasize: 0,
    respdatasize: e.size,  // > 50 MB → triggers R7
    riskscore:   45,
    dept:        e.dept,
    respcode:    '200',
    contenttype: 'application/zip',
  }));
}
// → 2 rows (total: 790)

// ─── Section 8: HIGH_RISK_SCORE extras — 2 additional IPs ────────────────────
// 2 extra IPs with riskscore > 75 to add more variety to R4 detections

const HIGH_RISK_ENTRIES = [
  { cip: '10.0.1.115', login: 'risky.user1@corp.com', rs: 82, url: 'https://pastebin.com/raw/abc123XYZ', dept: 'Engineering',  sip: '104.20.68.51',  urlsupercat: 'Privacy',           urlcat: 'Anonymizer' },
  { cip: '10.0.1.116', login: 'risky.user2@corp.com', rs: 91, url: 'https://proxysite.io/browse?url=http://corp-secrets.txt', dept: 'Finance', sip: '104.21.35.100', urlsupercat: 'Privacy', urlcat: 'Anonymizer' },
];

for (const e of HIGH_RISK_ENTRIES) {
  lines.push(entry({
    time:        at(13, 22, 10),
    login:       e.login,
    cip:         e.cip,
    sip:         e.sip,
    url:         e.url,
    proto:       'HTTPS',
    urlsupercat: e.urlsupercat,
    urlcat:      e.urlcat,
    riskscore:   e.rs,
    dept:        e.dept,
    action:      'Allowed',
  }));
}
// → 2 rows (total: 792)

// ─── Section 9: Additional blocked Security category entries ─────────────────
// Extra Security-category blocked entries for demo richness

const EXTRA_BLOCKED = [
  { cip: '10.0.1.130', login: 'curious.user@corp.com', url: 'https://darkweb-proxy.onion.ws/browse',    sip: '104.18.10.10',  urlsupercat: 'Security', urlcat: 'Hacking', dept: 'Sales' },
  { cip: '10.0.1.131', login: 'intern.x@corp.com',     url: 'https://cracking-tools.net/downloads',    sip: '185.199.108.1', urlsupercat: 'Security', urlcat: 'Hacking', dept: 'HR'   },
  { cip: '10.0.1.130', login: 'curious.user@corp.com', url: 'https://pastebin.com/HACK_SCRIPT',         sip: '104.20.68.51',  urlsupercat: 'Security', urlcat: 'Hacking', dept: 'Sales' },
  { cip: '10.0.1.132', login: 'dev.extern@corp.com',   url: 'http://exploit-db.com/shellcode/12345',   sip: '199.232.33.65', urlsupercat: 'Security', urlcat: 'Hacking', dept: 'Engineering' },
  { cip: '10.0.1.133', login: 'ops.auto@corp.com',     url: 'https://shodan.io/search?query=apache',   sip: '66.240.192.138', urlsupercat: 'Security', urlcat: 'Hacking', dept: 'Operations' },
];

for (let i = 0; i < EXTRA_BLOCKED.length; i++) {
  const e = EXTRA_BLOCKED[i];
  lines.push(entry({
    time:        at(10 + i, 5 + i * 7),
    login:       e.login,
    cip:         e.cip,
    sip:         e.sip,
    url:         e.url,
    proto:       'HTTPS',
    urlsupercat: e.urlsupercat,
    urlcat:      e.urlcat,
    action:      'Blocked',
    riskscore:   75 + i * 3,
    dept:        e.dept,
    respcode:    '403',
    rulelabel:   'Block Security Threats',
    reason:      'Policy',
  }));
}
// → 5 rows (total: 797)

// ─── Section 10: Mixed end-of-day traffic (3 extra normal rows) ──────────────
for (let i = 0; i < 3; i++) {
  const user = USERS[i % USERS.length];
  const site = NORMAL_SITES[(i + 5) % NORMAL_SITES.length];
  lines.push(entry({ time: at(17, 10 + i * 15), login: user.login, cip: user.cip, dept: user.dept, ...site }));
}
// → 3 rows (total: 800)

// ─── Write Output ─────────────────────────────────────────────────────────────

const outputDir  = path.join(__dirname, '..', 'sample_logs');
const outputPath = path.join(outputDir, 'zscaler_sample.log');

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, lines.join('\n') + '\n', 'utf8');

console.log(`✓ Generated ${lines.length} rows → ${outputPath}`);
console.log('\nAnomaly patterns embedded:');
console.log(`  R1 HIGH_REQUEST_RATE  : IP ${SCAN_IP}     — 210 requests in 5 min window`);
console.log(`  R2 REPEATED_BLOCK     : IP ${BLOCKED_IP}      — 15 blocked requests`);
console.log(`  R3 THREAT_DETECTED    : EICAR_Test_File  — 3 entries from 3 IPs`);
console.log(`  R4 HIGH_RISK_SCORE    : Multiple IPs     — riskscore 76–100`);
console.log(`  R5 SUSPICIOUS_UA      : 3 IPs (curl/python/wget) — 8 entries`);
console.log(`  R6 OFF_HOURS_ACCESS   : IP 10.0.1.250    — 8 requests at 02:xx UTC`);
console.log(`  R7 LARGE_TRANSFER     : 78 MB + 100 MB   — 2 entries`);
console.log(`  R8 MALICIOUS_CATEGORY : Malicious Content/Phishing/C2 blocked`);
