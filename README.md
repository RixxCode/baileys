<div align="center">

<img src="https://camo.githubusercontent.com/c1f3b7dcf8145e1a0d91e90aae2b7080e761e88b7d770e0e8429c369d7311425/68747470733a2f2f66696c65732e636174626f782e6d6f652f6335733967302e6a7067" alt="WhatsApp Baileys" width="100%" />

<br/>
<br/>

# @rixxcodex/baileys

<p>
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" />
  <img src="https://img.shields.io/badge/WebSocket-010101?style=for-the-badge&logo=socketdotio&logoColor=white" />
  <img src="https://img.shields.io/badge/Open%20Source-FF4500?style=for-the-badge&logo=github&logoColor=white" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" />
</p>

**Open-source WhatsApp automation library 2014 no browser required.**  
Built on WebSocket for speed, stability, and full multi-device support.

<br/>

[Installation](#getting-started) [Documentation](#sendmessage-documentation) [Features](#main-features) [Telegram](https://t.me/Xskycode)

</div>

---

## What is @rixxcodex/baileys?

**@rixxcodex/baileys** is a powerful, open-source library for developers who need reliable WhatsApp automation without the overhead of a browser. Powered by **WebSocket technology**, it supports message management, group administration, interactive messages, and action buttons all in a lightweight and modular package.

Actively maintained with continuous improvements to **pairing stability**, **session management**, and **WhatsApp multi-device compatibility**.

Perfect for:
- Business bots & chat automation
- Customer service systems
- Broadcast & notification tools
- E-commerce integrations

---

## Main Features

| Feature | Description |
|---|---|
| **Custom Pairing** | Stable pairing with your own codes no disconnection issues |
| **Interactive Messages** | Buttons, menus, native flows, and more |
| **Session Management** | Automatic, efficient, and long-term stable |
| **Multi-Device Support** | Fully compatible with WhatsApp's latest multi-device API |
| **Lightweight & Modular** | Easy to integrate into any Node.js project |
| **Rich Documentation** | Comprehensive guides and example code included |
| **Secure Auth** | Improved authentication flow with fixed prior vulnerabilities |

---

## Getting Started

Install via npm or yarn:

```bash
npm install @rixxcodex/baileys
# or
yarn add @rixxcodex/baileys
```

Then import and initialize:

```javascript
const { makeWASocket, useMultiFileAuthState } = require("@rixxcodex/baileys");

const { state, saveCreds } = await useMultiFileAuthState("auth_info");
const sock = makeWASocket({ auth: state });

sock.ev.on("creds.update", saveCreds);
```

---

## Additional Functions

### Get Channel ID
```javascript
await sock.newsletterId(url);
```

### Check Banned Number
```javascript
await sock.checkWhatsApp(target);
```

---

## SendMessage Documentation

<details>
<summary><b>Group Status Message (V2)</b></summary>
<br/>

```javascript
await sock.sendMessage(target, {
    groupStatusMessage: {
        text: "Hello World"
    }
});
```
</details>

<details>
<summary><b>Album Message (Multiple Images)</b></summary>
<br/>

```javascript
await sock.sendMessage(target, {
    albumMessage: [
        { image: cihuy, caption: "First photo" },
        { image: { url: "IMAGE_URL" }, caption: "Second photo" }
    ]
}, { quoted: m });
```
</details>

<details>
<summary><b>Event Message</b></summary>
<br/>

```javascript
await sock.sendMessage(target, {
    eventMessage: {
        isCanceled: false,
        name: "Event Name",
        description: "Event description here",
        location: {
            degreesLatitude: 0,
            degreesLongitude: 0,
            name: "Location Name"
        },
        joinLink: "https://call.whatsapp.com/video/example",
        startTime: "1763019000",
        endTime: "1763026200",
        extraGuestsAllowed: false
    }
}, { quoted: m });
```
</details>

<details>
<summary><b>Poll Result Message</b></summary>
<br/>

```javascript
await sock.sendMessage(target, {
    pollResultMessage: {
        name: "Poll Title",
        pollVotes: [
            { optionName: "Option A", optionVoteCount: "112233" },
            { optionName: "Option B", optionVoteCount: "1" }
        ]
    }
}, { quoted: m });
```
</details>

<details>
<summary><b>Simple Interactive Message</b></summary>
<br/>

```javascript
await sock.sendMessage(target, {
    interactiveMessage: {
        header: "Hello World",
        title: "Hello World",
        footer: "telegram: @Xskycode",
        buttons: [
            {
                name: "cta_copy",
                buttonParamsJson: JSON.stringify({
                    display_text: "Copy Code",
                    id: "123456789",
                    copy_code: "ABC123XYZ"
                })
            }
        ]
    }
}, { quoted: m });
```
</details>

<details>
<summary><b>Interactive Message with Native Flow</b></summary>
<br/>

```javascript
await sock.sendMessage(target, {
    interactiveMessage: {
        header: "Hello World",
        title: "Hello World",
        footer: "telegram: @Xskycode",
        image: { url: "https://example.com/image.jpg" },
        nativeFlowMessage: {
            messageParamsJson: JSON.stringify({
                limited_time_offer: {
                    text: "Limited offer text",
                    url: "https://t.me/Xskycode",
                    copy_code: "PROMO2024",
                    expiration_time: Date.now() * 999
                },
                bottom_sheet: {
                    in_thread_buttons_limit: 2,
                    divider_indices: [1, 2, 3, 4, 5, 999],
                    list_title: "List Title",
                    button_title: "Button Title"
                },
                tap_target_configuration: {
                    title: "Title",
                    description: "Description text",
                    canonical_url: "https://t.me/Xskycode",
                    domain: "shop.example.com",
                    button_index: 0
                }
            }),
            buttons: [
                {
                    name: "single_select",
                    buttonParamsJson: JSON.stringify({ has_multiple_buttons: true })
                },
                {
                    name: "call_permission_request",
                    buttonParamsJson: JSON.stringify({ has_multiple_buttons: true })
                },
                {
                    name: "single_select",
                    buttonParamsJson: JSON.stringify({
                        title: "Select an Option",
                        sections: [
                            {
                                title: "Section Title",
                                highlight_label: "Label",
                                rows: [
                                    {
                                        title: "Row Title",
                                        description: "Row description",
                                        id: "row_1"
                                    }
                                ]
                            }
                        ],
                        has_multiple_buttons: true
                    })
                },
                {
                    name: "cta_copy",
                    buttonParamsJson: JSON.stringify({
                        display_text: "Copy Code",
                        id: "123456789",
                        copy_code: "ABC123XYZ"
                    })
                }
            ]
        }
    }
}, { quoted: m });
```
</details>

<details>
<summary><b>Interactive Message with Thumbnail</b></summary>
<br/>

```javascript
await sock.sendMessage(target, {
    interactiveMessage: {
        header: "Hello World",
        title: "Hello World",
        footer: "telegram: @Xskycode",
        image: { url: "https://example.com/image.jpg" },
        buttons: [
            {
                name: "cta_copy",
                buttonParamsJson: JSON.stringify({
                    display_text: "Copy Code",
                    id: "123456789",
                    copy_code: "ABC123XYZ"
                })
            }
        ]
    }
}, { quoted: m });
```
</details>

---

## ✨ Extra helpers (`enhance`)

Opt-in bot helpers built into the library — no extra dependency:

```js
const { makeWASocket } = require("@rixxcodex/baileys");
const { enhance } = require("@rixxcodex/baileys/enhance");

const sock = makeWASocket(config);

enhance(sock, {
  antiCall: true,        // auto-reject calls
  autoRead: true,        // mark incoming messages as read
  autoTyping: true,      // show "typing..." indicator
  antiDelete: { resend: true }, // detect & resend deleted messages
  alwaysOnline: true,    // keep presence "available"
});

// events emitted for you
sock.ev.on("rix.messageDeleted", ({ chat, by, text, original }) => {
  console.log(`deleted in ${chat} by ${by}: ${text}`);
});

// extra helper
await sock.sendContact("628xxxxxxxxxx@s.whatsapp.net", {
  name: "Rixx", number: "628xxxxxxxxxx",
});
```

| Option | Type | What it does |
|---|---|---|
| `antiCall` | `bool` or `{ allow: [jids] }` | Auto-reject incoming calls |
| `autoRead` | `bool` or `{ exceptGroups: bool }` | Mark messages as read |
| `autoTyping` | `bool` or `{ delay: ms }` | Typing indicator on new messages |
| `antiDelete` | `bool` or `{ cacheSize, resend }` | Detect deleted messages, optional resend |
| `alwaysOnline` | `bool` | Keep presence "available" |

---

## 💎 Hidden gems (`gems`)

Rare helpers most libraries never expose:

```js
const { gems } = require("@rixxcodex/baileys/gems");
gems(sock);

// 1. edit a message you already sent
await sock.editMessage(jid, sentMessageKey, "new text");

// 2. decrypt a poll vote (votes arrive as encrypted blobs!)
const { selected } = sock.decodePollVote(voteMsg, {
  pollEncKey: pollMessage.messageContextInfo.messageSecret,
  pollCreatorJid: pollMsg.key.remoteJid,
  pollMsgId: pollMsg.key.id,
});

// 3. quoted message through any wrapper (view-once, ephemeral...)
const q = sock.getQuoted(msg); // → { key, text, message } | null

// 4. disappearing message in one call
await sock.sendEphemeral(jid, { text: "byeee" }, { seconds: 86400 });

// 5. view-once in one call
await sock.sendViewOnce(jid, { image: { url } , caption: "peek 👀" });
```

---

## 📢 Channel Suite (`channel`)

Post, react, moderate and read WhatsApp Channels:

```js
const { channel } = require("@rixxcodex/baileys/channel");
channel(sock);

await sock.channelCreate("My Channel", "Daily updates");     // create
await sock.channelPost(jid, { text: "Hello!" });             // post (also media)
await sock.channelReact(jid, serverId, "🔥");                // react to a post
await sock.channelFollow(jid);                               // follow/unfollow/mute/unmute
await sock.channelUpdateName(jid, "New Name");               // rename / desc / picture
const { posts } = await sock.channelFetchPosts(jid, 10);     // read posts
await sock.channelLiveUpdates(jid);                          // subscribe to live updates
// live events: sock.ev.on("newsletter.view" | "newsletter.reaction", ...)
```

## 🛡 Group Guard (`guard`)

Group security suite — turns system stubs into events, auto-approves join
requests, detects nuking:

```js
const { guard } = require("@rixxcodex/baileys/guard");
guard(sock, {
  autoApprove: { whitelist: ["628xx@s.whatsapp.net"] }, // approve list, reject rest
  antiNuke: { threshold: 4, windowMs: 60000, lockdown: true }, // auto announcement+approval on burst
});

sock.ev.on("rix.group.event", (e) => console.log(e.type, e.chat, e.actor));
// types: member_add, member_remove, promote, demote, join_request,
//        admin_revoke, invite_link_locked, group_deactivated, ...
sock.ev.on("rix.group.nukeDetected", ({ chat, actor, count }) => { /* alert */ });
```

## ⏳ Time Machine (`pdo`)

On-demand history sync & server-side link previews via companion data ops:

```js
const { pdo } = require("@rixxcodex/baileys/pdo");
pdo(sock);

await sock.requestHistory("628xx@s.whatsapp.net", { count: 50 });
// → history arrives via "messaging-history.set"

const preview = await sock.requestLinkPreview("https://example.com/post");
// → { url, title, description, ... } | null
```

## 💎 Polls, Quiz & more (`gems`)

```js
const { gems } = require("@rixxcodex/baileys/gems");
gems(sock);

// quiz poll — correct answer revealed after close
const q = await sock.sendQuiz(jid, { name: "1+1?", values: ["2","3"], correctAnswer: "2" });
sock.rememberPollSecret(q.key, q.messageContextInfo?.messageSecret);

// track & read live results
sock.trackPoll(q);
sock.ev.on("messages.update", async (u) => {
  const results = sock.pollResults(q.key);   // [{ name, voters:[...] }]
});

// the bot votes in its own poll
await sock.votePoll(jid, q.key, ["2"]);

// status & album
await sock.postStatus({ text: "hi" }, { audience: ["628xx@s.whatsapp.net"] });
await sock.sendAlbum(jid, [{ image: { url: a } }, { video: { url: b } }]);
```

`gems` also keeps: `editMessage`, `decodePollVote`, `getQuoted`,
`sendEphemeral`, `sendViewOnce`. `enhance` keeps: `antiCall`, `autoRead`,
`autoTyping`, `antiDelete`, `alwaysOnline`, `sendContact`.
