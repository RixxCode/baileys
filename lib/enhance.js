//=======================================================//
// enhance(sock, options) — opt-in helpers for bots
//
// Features:
//   antiCall     — auto-reject incoming WhatsApp calls
//   autoRead     — mark incoming messages as read
//   autoTyping   — show "typing..." indicator on new messages
//   antiDelete   — remember recent messages, emit rix.messageDeleted
//                  when someone deletes a message
//   alwaysOnline — keep presence set to "available"
//
// Extra helper:
//   sock.sendContact(jid, { name, number }) or array of contacts
//
// Usage:
//   import { makeWASocket } from "@rixxcodex/baileys";
//   import { enhance } from "@rixxcodex/baileys/enhance";
//
//   const sock = makeWASocket(config);
//   enhance(sock, { antiCall: true, autoRead: true });
//
// Returns a handle with dispose() to remove all listeners.
//=======================================================//

import { proto } from "../WAProto/index.js";

const REVOKE = proto.Message.ProtocolMessage.Type.REVOKE;

const DEFAULTS = {
	antiCall: false,
	autoRead: false,
	autoTyping: false,
	antiDelete: false,
	alwaysOnline: false,
};

// pull plain text out of a cached message for anti-delete resend
function extractText(msg) {
	if (!msg) return "";
	const m = msg.message || {};
	return (
		m.conversation ||
		m.extendedTextMessage?.text ||
		m.imageMessage?.caption ||
		m.videoMessage?.caption ||
		m.documentMessage?.caption ||
		m.documentWithCaptionMessage?.message?.documentMessage?.caption ||
		""
	);
}

export function enhance(sock, options = {}) {
	if (!sock || typeof sock.ev?.on !== "function") {
		throw new TypeError("enhance() expects a makeWASocket instance");
	}
	if (sock.__rixEnhanced) {
		throw new Error("this socket is already enhanced");
	}
	sock.__rixEnhanced = true;

	const opts = {
		antiCall: options.antiCall ?? DEFAULTS.antiCall,
		autoRead: options.autoRead ?? DEFAULTS.autoRead,
		autoTyping: options.autoTyping ?? DEFAULTS.autoTyping,
		antiDelete: options.antiDelete ?? DEFAULTS.antiDelete,
		alwaysOnline: options.alwaysOnline ?? DEFAULTS.alwaysOnline,
	};

	// normalize option shapes
	const callAllow = Array.isArray(opts.antiCall) ? new Set(opts.antiCall) : null;
	const readCfg = typeof opts.autoRead === "object" ? opts.autoRead : {};
	const typingCfg = typeof opts.autoTyping === "object" ? opts.autoTyping : {};
	const delCfg = typeof opts.antiDelete === "object" ? opts.antiDelete : {};
	const antiDeleteOn = !!opts.antiDelete;
	const cacheSize = delCfg.cacheSize || 500;
	const typingDelay = typingCfg.delay || 2500;

	// rolling cache for anti-delete: key = `${chatJid}:${msgId}`
	const cache = new Map();
	const cachePut = (k, v) => {
		if (cache.size >= cacheSize) {
			cache.delete(cache.keys().next().value);
		}
		cache.set(k, v);
	};

	const timers = new Map();
	const removers = [];
	const on = (event, handler) => {
		sock.ev.on(event, handler);
		removers.push(() => sock.ev.off(event, handler));
	};

	//-------------------------------------------------------//
	// alwaysOnline
	//-------------------------------------------------------//
	if (opts.alwaysOnline) {
		on("connection.update", (update) => {
			if (update.connection === "open") {
				sock.sendPresenceUpdate("available").catch(() => {});
			}
		});
	}

	//-------------------------------------------------------//
	// antiCall
	//-------------------------------------------------------//
	if (opts.antiCall) {
		on("call", async (calls) => {
			for (const call of calls) {
				if (callAllow?.has(call.from)) continue;
				try {
					await sock.rejectCall(call.id, call.from);
				} catch {}
			}
		});
	}

	on("messages.upsert", async ({ messages, type }) => {
		if (type !== "notify" || !Array.isArray(messages)) return;

		for (const msg of messages) {
			const key = msg.key || {};
			const chat = key.remoteJid || "";
			const cacheKey = `${chat}:${key.id}`;

			//-------------------------------------------------------//
			// antiDelete — intercept REVOKE protocol messages
			//-------------------------------------------------------//
			const protocol = msg.message?.protocolMessage;
			if (antiDeleteOn && protocol?.type === REVOKE) {
				const deletedKey = protocol.key || {};
				const deletedChat = deletedKey.remoteJid || chat;
				const original = cache.get(`${deletedChat}:${deletedKey.id}`);
				sock.ev.emit("rix.messageDeleted", {
					chat: deletedChat,
					by: key.participant || key.remoteJid,
					key: deletedKey,
					original: original || null,
					text: extractText(original),
				});
				if (delCfg.resend && original && !deletedKey.fromMe && extractText(original)) {
					try {
						await sock.sendMessage(deletedChat, {
							text: `*[ anti-delete ]*\n\n${extractText(original)}`,
						});
					} catch {}
				}
				continue;
			}

			//-------------------------------------------------------//
			// cache for anti-delete
			//-------------------------------------------------------//
			if (antiDeleteOn && key.id) {
				cachePut(cacheKey, msg);
			}

			if (key.fromMe) continue;

			//-------------------------------------------------------//
			// autoRead
			//-------------------------------------------------------//
			if (opts.autoRead && key.id) {
				if (!(readCfg.exceptGroups && chat.endsWith("@g.us"))) {
					try {
						await sock.readMessages([key]);
					} catch {}
				}
			}

			//-------------------------------------------------------//
			// autoTyping
			//-------------------------------------------------------//
			if (opts.autoTyping && chat) {
				try {
					await sock.sendPresenceUpdate("composing", chat);
				} catch {}
				const prev = timers.get(cacheKey);
				if (prev) clearTimeout(prev);
				timers.set(
					cacheKey,
					setTimeout(() => {
						sock.sendPresenceUpdate("paused", chat).catch(() => {});
						timers.delete(cacheKey);
					}, typingDelay),
				);
			}
		}
	});

	//-------------------------------------------------------//
	// sendContact helper
	//-------------------------------------------------------//
	if (typeof sock.sendMessage === "function") {
		sock.sendContact = async (jid, contacts, quoted = null) => {
			const list = Array.isArray(contacts) ? contacts : [contacts];
			const results = [];
			for (const c of list) {
				const vcard =
					"BEGIN:VCARD\n" +
					"VERSION:3.0\n" +
					`FN:${c.name}\n` +
					`TEL;type=CELL;type=VOICE;waid=${c.number}:+${String(c.number).replace(/\D/g, "")}\n` +
					"END:VCARD";
				results.push(
					await sock.sendMessage(
						jid,
						{ contacts: { displayName: c.name, contacts: [{ vcard }] } },
						{ quoted },
					),
				);
			}
			return Array.isArray(contacts) ? results : results[0];
		};
	}

	//-------------------------------------------------------//
	// dispose
	//-------------------------------------------------------//
	return {
		dispose() {
			removers.forEach((off) => off());
			removers.length = 0;
			timers.forEach((t) => clearTimeout(t));
			timers.clear();
			cache.clear();
			delete sock.__rixEnhanced;
			if (typeof sock.sendContact === "function") {
				try { delete sock.sendContact; } catch { sock.sendContact = undefined; }
			}
		},
	};
}

export default enhance;
