// services/whatsappCloud.service.js
// Remplace Baileys par l'API officielle WhatsApp Cloud (Meta Graph API)
// ESM, Node.js — même style que le reste de ton projet StatusBot

import 'dotenv/config';

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

const BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}`;

/**
 * Appel générique à l'API Graph. Centralise la gestion d'erreurs
 * pour ne pas la dupliquer dans chaque fonction d'envoi.
 */
async function graphRequest(endpoint, body) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    const err = new Error(
      data?.error?.message || `WhatsApp API error (${res.status})`
    );
    err.details = data?.error;
    throw err;
  }

  return data;
}

/**
 * Envoie un message texte simple.
 * GRATUIT si envoyé dans les 24h suivant le dernier message du destinataire
 * (fenêtre de service). Sinon, il faut un template approuvé.
 */
export async function sendTextMessage(to, text) {
  return graphRequest('/messages', {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text, preview_url: false },
  });
}

/**
 * Envoie un message avec un template pré-approuvé par Meta.
 * Nécessaire pour les messages proactifs (ex: conseil hebdomadaire)
 * envoyés HORS fenêtre de service.
 * Les templates doivent être créés et approuvés dans Meta Business Manager
 * avant de pouvoir être utilisés ici.
 */
export async function sendTemplateMessage(to, templateName, languageCode = 'fr', components = []) {
  return graphRequest('/messages', {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components,
    },
  });
}

/**
 * Envoie une image (ex: réponse à un diagnostic de maladie de culture)
 * via une URL publique déjà hébergée (ex: Cloudinary, comme dans StatusBot).
 */
export async function sendImageMessage(to, imageUrl, caption = '') {
  return graphRequest('/messages', {
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: { link: imageUrl, caption },
  });
}

/**
 * Envoie un message avec un bouton natif "Partager la localisation".
 * L'utilisateur clique, WhatsApp ouvre son sélecteur de position — beaucoup
 * plus fiable que de lui demander de le faire manuellement via le trombone.
 */
export async function sendLocationRequestMessage(to, bodyText) {
  return graphRequest('/messages', {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'location_request_message',
      body: { text: bodyText },
      action: { name: 'send_location' },
    },
  });
}

/**
 * Marque un message entrant comme lu (coche bleue).
 * messageId vient du webhook (voir routes/whatsapp.webhook.routes.js).
 */
export async function markAsRead(messageId) {
  return graphRequest('/messages', {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  });
}

/**
 * Télécharge un média entrant (photo envoyée par l'agriculteur pour diagnostic,
 * ou message vocal pour transcription).
 * Étape 1: récupérer l'URL temporaire du média via son ID.
 * Étape 2: télécharger le binaire depuis cette URL (nécessite aussi le token).
 */
export async function downloadMedia(mediaId) {
  const metaRes = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`,
    { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
  );
  const meta = await metaRes.json();

  if (!metaRes.ok) {
    throw new Error(meta?.error?.message || 'Échec récupération métadonnées média');
  }

  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });

  if (!fileRes.ok) {
    throw new Error('Échec téléchargement du média');
  }

  const buffer = Buffer.from(await fileRes.arrayBuffer());
  return { buffer, mimeType: meta.mime_type };
}
