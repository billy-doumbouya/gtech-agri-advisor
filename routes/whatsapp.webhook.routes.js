// routes/whatsapp.webhook.routes.js
// Webhook Meta pour recevoir les messages WhatsApp entrants.
// À monter dans ton app Express 5, ex: app.use('/webhook/whatsapp', whatsappWebhookRouter)
//
// IMPORTANT: Meta exige une URL PUBLIQUE HTTPS pour le webhook.
// - En local: utilise ngrok (ngrok http 3000) pour tester
// - En prod: ton URL Railway fonctionne directement

import { Router } from "express";
import {
  markAsRead,
  downloadMedia,
  sendTextMessage,
  sendLocationRequestMessage,
} from "../services/whatsappCloud.service.js";
import {
  getAgronomicAdvice,
  getDailyTip,
  diagnoseCropImage,
} from "../services/gemini.service.js";
import {
  getWeatherForLocation,
  formatWeatherSummary,
} from "../services/weather.service.js";
import { Farmer } from "../models/Farmer.js";

const router = Router();

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN; // choisi par toi, à mettre aussi dans le dashboard Meta

// Mots-clés qui déclenchent le conseil du jour
const DAILY_TIP_KEYWORDS = [
  "conseil",
  "conseil du jour",
  "meteo",
  "météo",
  "🌾",
];

/**
 * GET — Vérification du webhook par Meta (une seule fois, à la config).
 * Meta appelle cette route avec un challenge à renvoyer tel quel.
 */
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[whatsapp webhook] Vérification réussie");
    return res.status(200).send(challenge);
  }

  console.warn("[whatsapp webhook] Vérification échouée — token invalide");
  return res.sendStatus(403);
});

/**
 * POST — Réception des messages entrants et des mises à jour de statut.
 * Répond 200 immédiatement (Meta re-essaie sinon), puis traite en tâche de fond.
 */
router.post("/", async (req, res) => {
  // Répondre tout de suite pour éviter les re-essais de Meta
  res.sendStatus(200);

  // LOG DE DIAGNOSTIC — confirme si Meta atteint bien ce endpoint.
  // À retirer ou réduire une fois le flux confirmé fonctionnel (payload complet = verbeux).
  console.log("[whatsapp webhook] POST reçu:", JSON.stringify(req.body));

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    // Cas 1: mise à jour de statut (livré, lu...) — pas un message entrant
    if (value?.statuses) {
      console.log("[whatsapp webhook] Mise à jour de statut, ignorée.");
      return;
    }

    const message = value?.messages?.[0];
    if (!message) {
      console.log(
        "[whatsapp webhook] Aucun message exploitable dans ce payload.",
      );
      return;
    }

    const from = message.from; // numéro de l'agriculteur (format international sans +)
    const messageId = message.id;

    console.log(
      `[whatsapp webhook] Message de type "${message.type}" reçu de ${from}`,
    );

    await markAsRead(messageId);
    await touchLastInteraction(from);

    switch (message.type) {
      case "text": {
        const text = message.text.body;
        await handleTextMessage(from, text);
        break;
      }

      case "image": {
        const { buffer, mimeType } = await downloadMedia(message.image.id);
        const caption = message.image.caption || "";
        await handleImageMessage(from, buffer, mimeType, caption);
        break;
      }

      case "audio": {
        const { buffer, mimeType } = await downloadMedia(message.audio.id);
        await handleAudioMessage(from, buffer, mimeType);
        break;
      }

      case "location": {
        const { latitude, longitude } = message.location;
        await handleLocationMessage(from, latitude, longitude);
        break;
      }

      case "interactive": {
        // Réponses à des boutons interactifs (hors localisation, qui arrive en type 'location')
        console.log(
          "[whatsapp webhook] Message interactif reçu, non traité spécifiquement",
        );
        break;
      }

      default:
        console.log(
          `[whatsapp webhook] Type de message non géré: ${message.type}`,
        );
    }
  } catch (err) {
    console.error("[whatsapp webhook] Erreur de traitement:", err);
  }
});

// --- Handlers métier ---

async function getOrCreateFarmer(whatsappNumber) {
  let farmer = await Farmer.findOne({ whatsappNumber });
  if (!farmer) {
    farmer = await Farmer.create({ whatsappNumber });
  }
  return farmer;
}

async function touchLastInteraction(whatsappNumber) {
  await Farmer.updateOne(
    { whatsappNumber },
    { $set: { lastInteractionAt: new Date() } },
    { upsert: false },
  );
}

/**
 * Demande la localisation via le bouton natif WhatsApp (plus fiable
 * que de demander à l'agriculteur de le faire manuellement).
 */
async function requestLocation(from, farmer) {
  farmer.locationRequested = true;
  await farmer.save();
  await sendLocationRequestMessage(
    from,
    "Pour te donner des conseils adaptés à ta météo locale, partage ta position 📍 (clique sur le bouton ci-dessous).",
  );
}

/**
 * Récupère la météo actuelle si l'agriculteur a une localisation enregistrée.
 * Retourne null si pas de localisation ou en cas d'échec (on ne bloque jamais
 * le conseil pour une histoire de météo indisponible).
 */
async function tryGetWeatherSummary(farmer) {
  if (!farmer.location?.latitude || !farmer.location?.longitude) return null;
  try {
    const weather = await getWeatherForLocation(
      farmer.location.latitude,
      farmer.location.longitude,
    );
    return formatWeatherSummary(weather);
  } catch (err) {
    console.error("[weather] Échec récupération météo:", err.message);
    return null;
  }
}

async function handleTextMessage(from, rawText) {
  const farmer = await getOrCreateFarmer(from);
  const text = rawText.trim();
  const lowerText = text.toLowerCase();

  // --- Étape 1 de l'onboarding: culture principale ---
  if (!farmer.mainCrop) {
    farmer.mainCrop = text;
    await farmer.save();
    await sendTextMessage(
      from,
      `Merci ! Je note que tu cultives : ${farmer.mainCrop}.`,
    );
    await requestLocation(from, farmer);
    return;
  }

  // --- Étape 2 de l'onboarding: localisation pas encore reçue ---
  if (!farmer.location?.latitude && !farmer.locationRequested) {
    await requestLocation(from, farmer);
    return;
  }

  if (!farmer.onboardingComplete && farmer.mainCrop) {
    farmer.onboardingComplete = true;
    await farmer.save();
  }

  // --- Mot-clé "conseil du jour" ---
  if (DAILY_TIP_KEYWORDS.some((kw) => lowerText.includes(kw))) {
    const weatherSummary = await tryGetWeatherSummary(farmer);
    const tip = await getDailyTip({
      mainCrop: farmer.mainCrop,
      region: farmer.region,
      weatherSummary,
    });
    await sendTextMessage(from, `🌾 Conseil du jour :\n${tip}`);
    return;
  }

  // --- Question libre ---
  const weatherSummary = await tryGetWeatherSummary(farmer);
  const advice = await getAgronomicAdvice(text, {
    mainCrop: farmer.mainCrop,
    region: farmer.region,
    weatherSummary,
  });
  await sendTextMessage(from, advice);
}

async function handleImageMessage(from, buffer, mimeType) {
  const farmer = await getOrCreateFarmer(from);
  const diagnosis = await diagnoseCropImage(buffer, mimeType, {
    mainCrop: farmer.mainCrop,
  });
  await sendTextMessage(from, diagnosis);
}

async function handleAudioMessage(from, buffer, mimeType) {
  // TODO: transcrire via Whisper/Google Speech-to-Text, puis appeler handleTextMessage(from, transcript)
  console.log(
    `[audio] ${from}, type: ${mimeType} — transcription non encore branchée`,
  );
  await sendTextMessage(
    from,
    "J'ai bien reçu ton message vocal, mais je ne peux pas encore l'écouter. Peux-tu l'écrire en texte pour l'instant ?",
  );
}

async function handleLocationMessage(from, latitude, longitude) {
  const farmer = await getOrCreateFarmer(from);
  farmer.location = { latitude, longitude };
  const wasFirstLocation = !farmer.onboardingComplete;
  farmer.onboardingComplete = true;
  await farmer.save();

  if (wasFirstLocation) {
    await sendTextMessage(
      from,
      'Localisation enregistrée ✅. Tu es prêt !\n\nÉcris "conseil" chaque jour pour recevoir ton conseil agricole du jour, adapté à ta météo locale. Tu peux aussi m\'envoyer une photo de ta plante pour un diagnostic, ou me poser directement une question.',
    );
  } else {
    await sendTextMessage(from, "Localisation mise à jour, merci.");
  }
}

export default router;
