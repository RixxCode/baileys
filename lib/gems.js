//=======================================================//
// gems(sock) — rare & powerful helpers most bots miss
//
//   sock.editMessage(jid, key, newText)
//       Edit a message you already sent (plain text).
//
//   sock.decodePollVote(voteMsg, ctx)
//       Decrypt & decode a poll vote — most libraries never
//       expose this, votes usually look like encrypted blobs.
//
//   sock.getQuoted(msg)  (also exported standalone)
//       Pull the quoted/replied message out of any message,
//        through view-once / ephemeral / caption wrappers.
//
//   sock.sendEphemeral(jid, content, { seconds })
//       Send a disappearing message in one call.
//
//   sock.sendViewOnce(jid, content)
//       Send a view-once photo/video/text in one call.
//
// Usage:
//   import { makeWASocket } from "@rixxcodex/baileys";
//   import { gems } from "@rixxcodex/baileys/gems";
//
//   const sock = makeWASocket(config);
//   gems(sock);
//
// Returns a handle with dispose() to remove all helpers.
//=======================================================//

import crypto from "crypto";
import { proto } from "../WAProto/index.js";
import { normalizeMessageContent } from "./Utils/index.js";
import { jidNormalizedUser } from "./WABinary/index.js";
import { decryptPollVote } from "./Utils/process-message.js";
import { getAggregateVotesInPollMessage } from "./Utils/messages.js";
import { hmacSign, sha256, aesEncryptGCM } from "./Utils/crypto.js";

const randomBytes = (n) => crypto.randomBytes(n);

const MESSAGE_EDIT = proto.Message.ProtocolMessage.Type.MESSAGE_EDIT;

function textOf(content) {
	if (!content) return "";
	return (
		content.conversation ||
		content.extendedTextMessage?.text ||
		content.imageMessage?.caption ||
		content.videoMessage?.caption ||
		content.documentMessage?.caption ||
		content.documentWithCaptionMessage?.message?.documentMessage?.caption ||
		""
	);
}

function contextInfoOf(content) {
	return (
		content?.extendedTextMessage?.contextInfo ||
		content?.imageMessage?.contextInfo ||
		content?.videoMessage?.contextInfo ||
		content?.audioMessage?.contextInfo ||
		content?.stickerMessage?.contextInfo ||
		content?.documentMessage?.contextInfo ||
		content?.documentWithCaptionMessage?.message?.documentMessage?.contextInfo ||
		null
	);
}

/**
 * Extract the quoted (replied-to) message from any message,
 * unwrapping view-once / ephemeral / doc-with-caption layers.
 * Returns null when there is no quoted message.
 */
export function getQuoted(msg) {
	if (!msg?.key) return null;
	const content = normalizeMessageContent(msg.message);
	const ctx = contextInfoOf(content);
	if (!ctx?.quotedMessage) return null;
	const quoted = normalizeMessageContent(ctx.quotedMessage);
	return {
		key: {
			remoteJid: ctx.remoteJid || msg.key.remoteJid,
			id: ctx.stanzaId,
			participant: ctx.participant ? jidNormalizedUser(ctx.participant) : undefined,
			fromMe: false,
		},
		text: textOf(quoted),
		message: quoted,
	};
}

/**
 * Build the protocol payload for editing a sent message.
 * Exported so advanced users can craft custom edits.
 */
export function editPayload(key, newText) {
	return {
		protocolMessage: {
			key,
			type: MESSAGE_EDIT,
			editedMessage: { conversation: newText },
		},
	};
}

export function gems(sock) {
	if (!sock || typeof sock.ev?.on !== "function") {
		throw new TypeError("gems() expects a makeWASocket instance");
	}
	if (sock.__rixGems) {
		throw new Error("this socket already has gems");
	}
	sock.__rixGems = true;

	const added = [];
	const removers = [];

	//-------------------------------------------------------//
	// editMessage — edit your own sent text message
	//-------------------------------------------------------//
	sock.editMessage = async (jid, key, newText, opts = {}) => {
		if (!key?.id) throw new TypeError("editMessage: key (of the message to edit) is required");
		const payload = editPayload(key, String(newText));
		return sock.relayMessage(jid, payload, opts);
	};
	added.push("editMessage");

	//-------------------------------------------------------//
	// decodePollVote — decrypt a poll vote message
	//
	// ctx = {
	//   pollEncKey:    messageSecret of the ORIGINAL poll (32 bytes),
	//   pollCreatorJid: chat jid where the poll was sent,
	//   pollMsgId:     id of the ORIGINAL poll message,
	//   voterJid:      jid of the voter (msg.key.participant)
	// }
	// Accepts either the full vote message or its
	// pollVoteMessage content. Returns decoded PollVoteMessage.
	//-------------------------------------------------------//
	sock.decodePollVote = (msg, ctx) => {
		const vote = msg?.message?.pollVoteMessage || msg?.pollVoteMessage || msg;
		if (!vote?.encPayload || !ctx?.pollEncKey) {
			throw new TypeError("decodePollVote: vote message + ctx.pollEncKey are required");
		}
		const voterJid = ctx.voterJid || msg?.key?.participant || msg?.key?.remoteJid;
		const decoded = decryptPollVote(vote, {
			pollCreatorJid: ctx.pollCreatorJid,
			pollMsgId: ctx.pollMsgId,
			pollEncKey: ctx.pollEncKey,
			voterJid,
		});
		const hashes = decoded.selectedOptions || decoded.selectedOptionSha256 || [];
		const selected = hashes.map((b) => Buffer.from(b).toString("base64"));
		return { raw: decoded, selected, selectedCount: selected.length };
	};
	added.push("decodePollVote");

	//-------------------------------------------------------//
	// getQuoted — quoted-message extractor
	//-------------------------------------------------------//
	sock.getQuoted = (msg) => getQuoted(msg);
	added.push("getQuoted");

	//-------------------------------------------------------//
	// sendEphemeral — disappearing message in one call
	//-------------------------------------------------------//
	sock.sendEphemeral = (jid, content, opts = {}) => {
		const seconds = opts.ephemeralExpiration || opts.seconds || 604800;
		return sock.sendMessage(
			jid,
			{ ...content, ephemeralExpiration: seconds },
			{ ...opts, ephemeralExpiration: seconds },
		);
	};
	added.push("sendEphemeral");

	//-------------------------------------------------------//
	// sendViewOnce — view-once in one call
	//-------------------------------------------------------//
	sock.sendViewOnce = (jid, content, opts = {}) =>
		sock.sendMessage(jid, { ...content, viewOnce: true }, opts);
	added.push("sendViewOnce");

	//-------------------------------------------------------//
	// poll suite — quiz, live results, bot voting
	//-------------------------------------------------------//
	// live poll tracking: { `${chat}:${id}`: { poll, updates: [] } }
	const trackedPolls = new Map();
	const trackedRemover = (e) => {
		for (const u of e) {
			const key = u.key && `${u.key.remoteJid}:${u.key.id}`;
			if (key && trackedPolls.has(key)) {
				trackedPolls.get(key).updates.push(...(u.update?.pollUpdates || []));
			}
		}
	};
	sock.ev.on("messages.update", trackedRemover);
	removers.push(() => sock.ev.off("messages.update", trackedRemover));

	// send a quiz poll (correct answer highlighted after close)
	sock.sendQuiz = (jid, quiz, opts = {}) => {
		return sock.sendMessage(
			jid,
			{
				poll: {
					name: quiz.name,
					values: quiz.values,
					selectableCount: 1,
					correctAnswer: quiz.correctAnswer,
					quiz: true,
					messageSecret: quiz.messageSecret,
				},
			},
			opts,
		);
	};
	added.push("sendQuiz");

	// start tracking a poll's live results
	sock.trackPoll = (pollMessage) => {
		const key = `${pollMessage.key?.remoteJid}:${pollMessage.key?.id}`;
		trackedPolls.set(key, { poll: pollMessage, updates: [...(pollMessage.pollUpdates || [])] });
		return key;
	};
	added.push("trackPoll");

	// aggregated poll results: [{ name, voters: [jid...] }]
	sock.pollResults = (pollMessageOrKey) => {
		let entry = null;
		let k;
		if (typeof pollMessageOrKey === "string") {
			k = pollMessageOrKey;
		} else if (pollMessageOrKey?.key) {
			k = `${pollMessageOrKey.key.remoteJid}:${pollMessageOrKey.key.id}`;
		} else {
			// a bare message key: { remoteJid, id }
			k = `${pollMessageOrKey.remoteJid}:${pollMessageOrKey.id}`;
		}
		entry = trackedPolls.get(k);
		if (!entry && typeof pollMessageOrKey !== "string" && pollMessageOrKey?.key) {
			entry = { poll: pollMessageOrKey, updates: pollMessageOrKey.pollUpdates || [] };
		}
		if (!entry) throw new Error("pollResults: poll not found — track it first with trackPoll()");
		return getAggregateVotesInPollMessage(
			{ message: entry.poll.message || entry.poll, pollUpdates: entry.updates },
			sock.user?.id,
		);
	};
	added.push("pollResults");

	// vote in a poll as the bot (encrypted per protocol)
	sock.votePoll = async (jid, pollKey, optionNames, ctx = {}) => {
		if (!pollKey?.id || !pollKey?.remoteJid) throw new TypeError("votePoll: pollKey (message.key of the poll) is required");
		const voterJid = ctx.voterJid || jidNormalizedUser(sock.user?.id || "");
		const pollCreatorJid = ctx.pollCreatorJid || pollKey.remoteJid;
		const pollMsgId = pollKey.id;
		const encKey = ctx.pollEncKey || sock.__pollSecrets?.get(`${pollKey.remoteJid}:${pollKey.id}`);
		if (!encKey) {
			throw new TypeError(
				"votePoll: poll encryption key required — pass ctx.pollEncKey (the poll's messageSecret, 32 bytes)",
			);
		}
		// build encrypted vote — same recipe as decryptPollVote, reversed
		const selectedOptions = (Array.isArray(optionNames) ? optionNames : [optionNames]).map(
			(name) => sha256(Buffer.from(name || "")),
		);
		const plain = proto.Message.PollVoteMessage.encode({ selectedOptions }).finish();
		const sign = Buffer.concat([
			Buffer.from(pollMsgId),
			Buffer.from(pollCreatorJid),
			Buffer.from(voterJid),
			Buffer.from("Poll Vote"),
			new Uint8Array([1]),
		]);
		const key0 = hmacSign(encKey, new Uint8Array(32), "sha256");
		const decKey = hmacSign(sign, key0, "sha256");
		const aad = Buffer.concat([Buffer.from(pollMsgId), Buffer.from([0]), Buffer.from(voterJid)]);
		const iv = randomBytes(12);
		const encPayload = aesEncryptGCM(plain, decKey, iv, aad);
		const msgId = await sock.relayMessage(
			jid,
			{
				pollUpdateMessage: {
					pollCreationMessageKey: pollKey,
					vote: { encPayload, encIv: iv },
					senderTimestampMs: Date.now(),
				},
			},
			{},
		);
		return msgId;
	};
	added.push("votePoll");

	// remember a poll's secret at creation so votePoll can find it later
	sock.rememberPollSecret = (pollKey, messageSecret) => {
		if (!sock.__pollSecrets) sock.__pollSecrets = new Map();
		sock.__pollSecrets.set(`${pollKey.remoteJid}:${pollKey.id}`, messageSecret);
	};
	added.push("rememberPollSecret");

	//-------------------------------------------------------//
	// status & album conveniences
	//-------------------------------------------------------//
	// post a status/story; audience = list of jids allowed to see it
	sock.postStatus = (content, opts = {}) => {
		return sock.sendMessage(
			"status@broadcast",
			content,
			opts.audience ? { statusJidList: opts.audience, backgroundColor: opts.backgroundColor, font: opts.font } : opts,
		);
	};
	added.push("postStatus");

	// send an album (mix of images/videos) in one call
	sock.sendAlbum = (jid, items, opts = {}) => {
		if (!Array.isArray(items) || !items.length) throw new TypeError("sendAlbum: items must be a non-empty array");
		return sock.sendMessage(jid, { album: items }, opts);
	};
	added.push("sendAlbum");

	//-------------------------------------------------------//
	// dispose
	//-------------------------------------------------------//
	return {
		dispose() {
			removers.forEach((off) => off());
			removers.length = 0;
			for (const name of added) {
				try { delete sock[name]; } catch { sock[name] = undefined; }
			}
			try { delete sock.__pollSecrets; } catch { sock.__pollSecrets = undefined; }
			delete sock.__rixGems;
		},
	};
}

export default gems;
