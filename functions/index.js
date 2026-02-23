const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

/**
 * Triggered on every new chatMessages document.
 * Sends push notifications for:
 *   1. Direct messages → notify recipient
 *   2. @mentions in group channels → notify each mentioned user
 */
exports.sendChatNotification = functions.firestore
  .document("chatMessages/{messageId}")
  .onCreate(async (snap) => {
    const msg = snap.data();
    if (!msg || !msg.senderUid) return;

    const senderName = formatName(msg.senderName || "Someone");
    const textPreview = (msg.text || "").substring(0, 120);

    // Track who we've already notified (avoid double-notifying)
    const notified = new Set();
    notified.add(msg.senderUid); // never notify the sender

    // 1) DM → notify recipient
    if (msg.isDm && msg.recipientUid && !notified.has(msg.recipientUid)) {
      await sendPush(msg.recipientUid, {
        title: `${senderName}`,
        body: textPreview,
        channel: msg.channel || "",
        isDm: "true",
      });
      notified.add(msg.recipientUid);
    }

    // 2) @mentions → notify each mentioned user
    if (msg.mentions && Array.isArray(msg.mentions)) {
      for (const uid of msg.mentions) {
        if (notified.has(uid)) continue;
        const channelLabel = getChannelLabel(msg.channel);
        await sendPush(uid, {
          title: `${senderName} in ${channelLabel}`,
          body: textPreview,
          channel: msg.channel || "",
          isDm: "false",
        });
        notified.add(uid);
      }
    }
  });

/**
 * Send FCM push to all devices registered to a user.
 * Cleans up invalid tokens automatically.
 */
async function sendPush(uid, { title, body, channel, isDm }) {
  const userDoc = await db.doc(`users/${uid}`).get();
  if (!userDoc.exists) return;

  const tokens = userDoc.data().fcmTokens || [];
  if (!tokens.length) return;

  const invalidTokens = [];

  for (const token of tokens) {
    try {
      await admin.messaging().send({
        token,
        notification: { title, body },
        webpush: {
          notification: {
            icon: "/icons/icon-192.png",
            badge: "/icons/icon-192.png",
            tag: channel || "chat",
            renotify: true,
          },
          fcmOptions: {
            link: "https://store-dashboard-2025.web.app/",
          },
        },
        data: { channel: channel || "", isDm: isDm || "false" },
      });
    } catch (err) {
      // Token is invalid or expired — mark for cleanup
      if (
        err.code === "messaging/invalid-registration-token" ||
        err.code === "messaging/registration-token-not-registered"
      ) {
        invalidTokens.push(token);
      }
      console.warn(`FCM send failed for ${uid}:`, err.message);
    }
  }

  // Remove invalid tokens
  if (invalidTokens.length) {
    const validTokens = tokens.filter((t) => !invalidTokens.includes(t));
    await db.doc(`users/${uid}`).update({ fcmTokens: validTokens });
    console.log(`Cleaned ${invalidTokens.length} invalid tokens for ${uid}`);
  }
}

function formatName(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2)
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  const first =
    parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
  const lastInit = parts[parts.length - 1].charAt(0).toUpperCase() + ".";
  return first + " " + lastInit;
}

function getChannelLabel(channel) {
  const labels = {
    general: "#General",
    sales: "#Sales",
    bdc: "#BDC",
    managers: "#Managers",
  };
  return labels[channel] || `#${channel}`;
}
