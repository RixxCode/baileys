//=======================================================//
// guard(sock, options) — group security suite
//
// Turns system events (message stubs, join requests) into
// meaningful `rix.group.*` events and adds opt-in protection:
//
//   - join request auto-approve / whitelist / auto-reject
//   - anti-nuke detection (rapid kicks/promotes → lockdown)
//   - rate-limited protective actions
//
// Usage:
//   import { makeWASocket } from "@rixxcode/baileys";
//   import { guard } from "@rixxcode/baileys/guard";
//
//   const sock = makeWASocket(config);
//
//   guard(sock, {
//     autoApprove: { whitelist: ["628xx@s.whatsapp.net"] },
//     antiNuke: { threshold: 4, windowMs: 60000, lockdown: true },
//   });
//
//   sock.ev.on("rix.group.event", (e) => {
//     // e.type: member_add | member_remove | promote | demote |
//     //         join_request | join_accepted | admin_revoke |
//     //         invite_link_locked | group_deactivated | ...
//   });
//   sock.ev.on("rix.group.nukeDetected", ({ chat, actor, count }) => {});
//
// Returns a handle with dispose() to remove all listeners.
//=======================================================//

import { proto } from "../WAProto/index.js";
import { jidNormalizedUser } from "./WABinary/index.js";

const Stub = proto.WebMessageInfo.StubType || {};

// stub → friendly event type
const STUB_MAP = {
	[Stub.GROUP_CREATE]: "group_created",
	[Stub.GROUP_CHANGE_SUBJECT]: "subject_changed",
	[Stub.GROUP_CHANGE_ICON]: "icon_changed",
	[Stub.GROUP_CHANGE_INVITE_LINK]: "invite_link_changed",
	[Stub.GROUP_CHANGE_DESCRIPTION]: "description_changed",
	[Stub.GROUP_CHANGE_RESTRICT]: "who_can_send_changed",
	[Stub.GROUP_CHANGE_ANNOUNCE]: "announcement_toggled",
	[Stub.GROUP_PARTICIPANT_ADD]: "member_add",
	[Stub.GROUP_PARTICIPANT_REMOVE]: "member_remove",
	[Stub.GROUP_PARTICIPANT_PROMOTE]: "promote",
	[Stub.GROUP_PARTICIPANT_DEMOTE]: "demote",
	[Stub.GROUP_PARTICIPANT_INVITE]: "member_invite",
	[Stub.GROUP_PARTICIPANT_LEAVE]: "member_leave",
	[Stub.GROUP_PARTICIPANT_CHANGE_NUMBER]: "member_changed_number",
	[Stub.GROUP_DELETE]: "group_deleted",
	[Stub.GROUP_PARTICIPANT_ADD_REQUEST_JOIN]: "join_request",
	[Stub.GROUP_MEMBERSHIP_JOIN_APPROVAL_REQUEST]: "join_request",
	[Stub.GROUP_PARTICIPANT_ACCEPT]: "join_accepted",
	[Stub.GROUP_MEMBERSHIP_JOIN_APPROVAL_MODE]: "approval_mode_changed",
	[Stub.ADMIN_REVOKE]: "admin_revoke",
	[Stub.GROUP_INVITE_LINK_GROWTH_LOCKED]: "invite_link_locked",
	[Stub.GROUP_DEACTIVATED]: "group_deactivated",
	[Stub.SILENCED_UNKNOWN_CALLER_AUDIO]: "unknown_caller_silenced",
	[Stub.SILENCED_UNKNOWN_CALLER_VIDEO]: "unknown_caller_silenced",
	[Stub.CHANGE_EPHEMERAL_SETTING]: "ephemeral_changed",
	[Stub.GROUP_MEMBER_ADD_MODE]: "member_add_mode_changed",
};

const NUKISH = new Set(["member_remove", "promote", "demote"]);

function makeTokenBucket({ max, windowMs }) {
	let count = 0;
	let resetAt = Date.now() + windowMs;
	return () => {
		const now = Date.now();
		if (now >= resetAt) {
			count = 0;
			resetAt = now + windowMs;
		}
		if (count >= max) return false;
		count += 1;
		return true;
	};
}

export function guard(sock, options = {}) {
	if (!sock || typeof sock.ev?.on !== "function") {
		throw new TypeError("guard() expects a makeWASocket instance");
	}
	if (sock.__rixGuard) {
		throw new Error("this socket already has guard");
	}
	sock.__rixGuard = true;

	const opts = {
		autoApprove: options.autoApprove ?? false, // true | { whitelist: [...] } | false
		antiNuke: options.antiNuke ?? false,       // true | { threshold, windowMs, lockdown }
		actionsPerMinute: options.actionsPerMinute ?? 12,
	};

	const approveCfg = typeof opts.autoApprove === "object" ? opts.autoApprove : {};
	const whitelist = Array.isArray(approveCfg.whitelist) ? new Set(approveCfg.whitelist.map((j) => jidNormalizedUser(j))) : null;
	const nukeCfg = typeof opts.antiNuke === "object" ? opts.antiNuke : {};
	const antiNukeOn = !!opts.antiNuke;
	const nukeThreshold = nukeCfg.threshold || 5;
	const nukeWindow = nukeCfg.windowMs || 60000;
	const lockdown = nukeCfg.lockdown !== false;

	const allowAction = makeTokenBucket({ max: opts.actionsPerMinute, windowMs: 60000 });
	const removers = [];
	const on = (event, handler) => {
		sock.ev.on(event, handler);
		removers.push(() => sock.ev.off(event, handler));
	};

	//-------------------------------------------------------//
	// system stub events → rix.group.event
	//-------------------------------------------------------//
	on("messages.upsert", async ({ messages, type }) => {
		if (type !== "notify" || !Array.isArray(messages)) return;
		for (const msg of messages) {
			const stub = msg.messageStubType;
			if (!stub || typeof stub !== "number") continue;
			const eventType = STUB_MAP[stub];
			if (!eventType) continue;
			const chat = msg.key?.remoteJid;
			if (!chat?.endsWith("@g.us")) continue;
			const event = {
				type: eventType,
				chat,
				actor: msg.key?.participant ? jidNormalizedUser(msg.key.participant) : undefined,
				actorPn: msg.key?.participantAlt,
				participants: (msg.messageStubParameters || []).map((p) => p),
				stub,
			};
			sock.ev.emit("rix.group.event", event);

			//-------------------------------------------------------//
			// anti-nuke
			//-------------------------------------------------------//
			if (antiNukeOn && NUKISH.has(eventType)) {
				const actor = event.actor;
				if (!actor || event.actor === jidNormalizedUser(sock.user?.id || "")) continue;
				nukeTrack(actor, event);
			}
		}
	});

	//-------------------------------------------------------//
	// anti-nuke tracker
	//-------------------------------------------------------//
	const nukeWindows = new Map(); // `${chat}:${actor}` → number[]
	function nukeTrack(actor, event) {
		const key = `${event.chat}:${actor}`;
		const now = Date.now();
		let arr = nukeWindows.get(key) || [];
		arr = arr.filter((t) => now - t < nukeWindow);
		arr.push(now);
		nukeWindows.set(key, arr);
		if (arr.length >= nukeThreshold) {
			nukeWindows.set(key, []);
			sock.ev.emit("rix.group.nukeDetected", {
				chat: event.chat,
				actor,
				count: arr.length,
				windowMs: nukeWindow,
			});
			if (lockdown && allowAction()) {
				sock.groupSettingUpdate(event.chat, "announcement").catch(() => {});
				sock.groupJoinApprovalMode(event.chat, "on").catch(() => {});
			}
		}
	}

	//-------------------------------------------------------//
	// join requests → auto approve / whitelist
	//-------------------------------------------------------//
	if (opts.autoApprove) {
		on("group.join-request", async (request) => {
			try {
				const { id: chat, participant, participantPn, action } = request;
				if (action !== "add") return; // only actual join requests
				const who = jidNormalizedUser(participantPn || participant);
				if (!who) return;
				const allowed = whitelist ? whitelist.has(who) : true;
				const verdict = allowed ? "approve" : "reject";
				if (!allowAction()) return;
				await sock.groupParticipantsUpdate(chat, [participantPn || participant], verdict);
				sock.ev.emit("rix.group.joinVerdict", { chat, participant: who, verdict });
			} catch {}
		});
	}

	//-------------------------------------------------------//
	// dispose
	//-------------------------------------------------------//
	return {
		dispose() {
			removers.forEach((off) => off());
			removers.length = 0;
			nukeWindows.clear();
			delete sock.__rixGuard;
		},
	};
}

export default guard;
