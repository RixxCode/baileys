//=======================================================//
// channel(sock) — WhatsApp Channel (newsletter) suite
//
// Wraps the built-in newsletter protocol methods into one
// consistent API and adds post fetching with parsing.
//
// Usage:
//   import { makeWASocket } from "@rixxcodex/baileys";
//   import { channel } from "@rixxcodex/baileys/channel";
//
//   const sock = makeWASocket(config);
//   channel(sock);
//
//   await sock.channelCreate("My Channel", "Daily updates");
//   await sock.channelPost(jid, { text: "Hello!" });
//   const posts = await sock.channelFetchPosts(jid, 10);
//
// Returns a handle with dispose() to remove all helpers.
//=======================================================//

import { getBinaryNodeChild, getBinaryNodeChildren, getBinaryNodeChildString } from "./WABinary/index.js";

function parsePostsNode(result) {
	// best-effort parse of message_updates response into plain objects
	const out = [];
	const msgUpdates = getBinaryNodeChild(result, "message_updates");
	const children = getBinaryNodeChildren(msgUpdates, "message");
	for (const m of children) {
		const item = {
			serverId: m.attrs.server_id,
			timestamp: m.attrs.t ? Number(m.attrs.t) : undefined,
			type: getBinaryNodeChildString(m, "type") || m.attrs.type,
		};
		const plaintext = getBinaryNodeChild(m, "plaintext");
		if (plaintext?.content) {
			try {
				const parsed = JSON.parse(plaintext.content.toString());
				item.content = parsed;
			} catch {
				item.raw = plaintext.content.toString().slice(0, 2048);
			}
		}
		const reactions = getBinaryNodeChild(m, "reactions_info");
		if (reactions) item.reactions = reactions.attrs;
		const views = getBinaryNodeChild(m, "views_count");
		if (views) item.views = Number(views.attrs?.count || 0);
		out.push(item);
	}
	const last = msgUpdates?.attrs?.last_message_timestamp || msgUpdates?.attrs?.after;
	return { posts: out, cursor: last ? Number(last) : undefined };
}

export function channel(sock) {
	if (!sock || typeof sock.ev?.on !== "function") {
		throw new TypeError("channel() expects a makeWASocket instance");
	}
	if (sock.__rixChannel) {
		throw new Error("this socket already has channel");
	}
	sock.__rixChannel = true;

	const added = [];
	const wrap = (alias, source, fn) => {
		if (typeof sock[source] !== "function") {
			throw new Error(`channel: underlying sock.${source} is not available — newsletter socket missing`);
		}
		sock[alias] = fn;
		added.push(alias);
	};

	//-------------------------------------------------------//
	// lifecycle
	//-------------------------------------------------------//
	wrap("channelCreate", "newsletterCreate", (name, description) => sock.newsletterCreate(name, description));
	wrap("channelDelete", "newsletterDelete", (jid) => sock.newsletterDelete(jid));

	//-------------------------------------------------------//
	// audience
	//-------------------------------------------------------//
	wrap("channelFollow", "newsletterFollow", (jid) => sock.newsletterFollow(jid));
	wrap("channelUnfollow", "newsletterUnfollow", (jid) => sock.newsletterUnfollow(jid));
	wrap("channelMute", "newsletterMute", (jid) => sock.newsletterMute(jid));
	wrap("channelUnmute", "newsletterUnmute", (jid) => sock.newsletterUnmute(jid));

	//-------------------------------------------------------//
	// profile
	//-------------------------------------------------------//
	wrap("channelUpdateName", "newsletterUpdateName", (jid, name) => sock.newsletterUpdateName(jid, name));
	wrap("channelUpdateDescription", "newsletterUpdateDescription", (jid, description) => sock.newsletterUpdateDescription(jid, description));
	wrap("channelUpdatePicture", "newsletterUpdatePicture", (jid, content) => sock.newsletterUpdatePicture(jid, content));
	wrap("channelRemovePicture", "newsletterRemovePicture", (jid) => sock.newsletterRemovePicture(jid));

	//-------------------------------------------------------//
	// admin
	//-------------------------------------------------------//
	wrap("channelAdminCount", "newsletterAdminCount", (jid) => sock.newsletterAdminCount(jid));
	wrap("channelChangeOwner", "newsletterChangeOwner", (jid, newOwnerJid) => sock.newsletterChangeOwner(jid, newOwnerJid));
	wrap("channelDemote", "newsletterDemote", (jid, userJid) => sock.newsletterDemote(jid, userJid));

	//-------------------------------------------------------//
	// content
	//-------------------------------------------------------//
	wrap("channelPost", "sendMessage", (jid, content, opts) => {
		if (!jid?.includes("@newsletter")) {
			throw new TypeError("channelPost: jid must be a channel jid (@newsletter)");
		}
		return sock.sendMessage(jid, content, opts);
	});
	wrap("channelReact", "newsletterReactMessage", (jid, serverId, reaction) => sock.newsletterReactMessage(jid, serverId, reaction));

	//-------------------------------------------------------//
	// read — fetch posts with parsing
	//-------------------------------------------------------//
	wrap("channelFetchPosts", "newsletterFetchMessages", async (jid, count = 10, since, after) => {
		const result = await sock.newsletterFetchMessages(jid, count, since, after);
		try {
			return parsePostsNode(result);
		} catch {
			return { posts: [], cursor: undefined, raw: result };
		}
	});
	wrap("channelLiveUpdates", "subscribeNewsletterUpdates", (jid) => sock.subscribeNewsletterUpdates(jid));

	//-------------------------------------------------------//
	// dispose
	//-------------------------------------------------------//
	return {
		dispose() {
			for (const name of added) {
				try { delete sock[name]; } catch { sock[name] = undefined; }
			}
			delete sock.__rixChannel;
		},
	};
}

export default channel;
