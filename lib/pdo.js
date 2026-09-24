//=======================================================//
// pdo(sock) — Time Machine: companion data operations
//
// Your number's main phone is a "companion device" peer.
// These helpers ask the phone/server for data that the
// normal socket APIs don't provide directly:
//
//   - requestHistory(chatJid)  → on-demand history sync
//   - requestLinkPreview(url)  → server-generated link preview
//   - requestStickerReupload() → re-upload sticker packs
//
// Usage:
//   import { pdo } from "@rixxcode/baileys/pdo";
//   pdo(sock);
//
//   const reqId = await sock.requestHistory("628xx@s.whatsapp.net");
//   // history arrives via "messaging-history.set" event
//
//   const preview = await sock.requestLinkPreview("https://x.com/post");
//   // → { url, title, description, ... } | null (timeout)
//
// Returns a handle with dispose() to remove all helpers.
//=======================================================//

import { proto } from "../WAProto/index.js";

const PDOType = proto.Message?.PeerDataOperationRequestType || {};

export function pdo(sock) {
	if (!sock || typeof sock.ev?.on !== "function") {
		throw new TypeError("pdo() expects a makeWASocket instance");
	}
	if (typeof sock.sendPeerDataOperationMessage !== "function") {
		throw new TypeError("pdo: sock.sendPeerDataOperationMessage is not available");
	}
	if (sock.__rixPdo) {
		throw new Error("this socket already has pdo");
	}
	sock.__rixPdo = true;

	const removers = [];
	const on = (event, handler) => {
		sock.ev.on(event, handler);
		removers.push(() => sock.ev.off(event, handler));
	};

	//-------------------------------------------------------//
	// on-demand history sync for a chat
	//-------------------------------------------------------//
	sock.requestHistory = async (chatJid, opts = {}) => {
		if (!chatJid) throw new TypeError("requestHistory: chatJid is required");
		return sock.sendPeerDataOperationMessage({
			peerDataOperationRequestType: PDOType.HISTORY_SYNC_ON_DEMAND,
			historySyncOnDemandRequest: {
				chatJid,
				oldestMsgId: opts.oldestMsgId || undefined,
				oldestMsgFromMe: !!opts.oldestMsgFromMe,
				onDemandMsgCount: opts.count || 50,
			},
		});
	};

	//-------------------------------------------------------//
	// server-side link preview
	//-------------------------------------------------------//
	sock.requestLinkPreview = (url, opts = {}) => {
		if (!url) throw new TypeError("requestLinkPreview: url is required");
		const timeoutMs = opts.timeoutMs || 30000;
		return new Promise(async (resolve) => {
			let done = false;
			const handler = (preview) => {
				if (done || !preview || (preview.url && preview.url !== url)) return;
				done = true;
				offHandler();
				clearTimeout(timer);
				resolve(preview);
			};
			const offHandler = () => sock.ev.off("rix.link-preview", handler);
			const timer = setTimeout(() => {
				if (!done) {
					done = true;
					offHandler();
					resolve(null);
				}
			}, timeoutMs);
			on("rix.link-preview", handler);
			try {
				await sock.sendPeerDataOperationMessage({
					peerDataOperationRequestType: PDOType.GENERATE_LINK_PREVIEW,
					requestUrlPreview: [{ url, includeHqThumbnail: !!opts.hqThumbnail }],
				});
			} catch (e) {
				if (!done) {
					done = true;
					offHandler();
					clearTimeout(timer);
					resolve(null);
				}
			}
		});
	};

	//-------------------------------------------------------//
	// sticker re-upload
	//-------------------------------------------------------//
	sock.requestStickerReupload = (stickerMessages) => {
		return sock.sendPeerDataOperationMessage({
			peerDataOperationRequestType: PDOType.UPLOAD_STICKER,
			requestStickerReupload: stickerMessages.map((s) => ({ fileSha256: s.fileSha256 })),
		});
	};

	//-------------------------------------------------------//
	// dispose
	//-------------------------------------------------------//
	return {
		dispose() {
			removers.forEach((off) => off());
			removers.length = 0;
			delete sock.requestHistory;
			delete sock.requestLinkPreview;
			delete sock.requestStickerReupload;
			delete sock.__rixPdo;
		},
	};
}

export default pdo;
