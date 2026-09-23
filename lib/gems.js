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
	// dispose
	//-------------------------------------------------------//
	return {
		dispose() {
			for (const name of added) {
				try { delete sock[name]; } catch { sock[name] = undefined; }
			}
			delete sock.__rixGems;
		},
	};
}

export default gems;
