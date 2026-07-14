// jobs/dailyTips.job.js
//
// Envoie un conseil quotidien proactif aux agriculteurs qui ont interagi
// avec le bot dans les dernières 24h (fenêtre de service WhatsApp encore
// ouverte = envoi GRATUIT, pas besoin de template approuvé par Meta).
//
// Pour les agriculteurs inactifs depuis plus de 24h, on ne leur envoie rien
// automatiquement ici — les relancer nécessiterait un template "utility"
// payant (voir README, section "Passage à l'échelle"). Le flux principal
// reste donc : l'agriculteur écrit "conseil" quand il veut, gratuitement,
// sans aucune limite.

import cron from 'node-cron';
import { Farmer } from '../models/Farmer.js';
import { sendTextMessage } from '../services/whatsappCloud.service.js';
import { getDailyTip } from '../services/gemini.service.js';
import { getWeatherForLocation, formatWeatherSummary } from '../services/weather.service.js';

async function sendDailyTipsToActiveFarmers() {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const farmers = await Farmer.find({
    onboardingComplete: true,
    dailyTipOptIn: true,
    lastInteractionAt: { $gte: twentyFourHoursAgo },
    'location.latitude': { $exists: true },
  });

  console.log(`[daily-tips] ${farmers.length} agriculteur(s) éligible(s) pour le conseil du jour`);

  for (const farmer of farmers) {
    try {
      let weatherSummary = null;
      try {
        const weather = await getWeatherForLocation(farmer.location.latitude, farmer.location.longitude);
        weatherSummary = formatWeatherSummary(weather);
      } catch (err) {
        console.error(`[daily-tips] Météo indisponible pour ${farmer.whatsappNumber}:`, err.message);
      }

      const tip = await getDailyTip({
        mainCrop: farmer.mainCrop,
        region: farmer.region,
        weatherSummary,
      });

      await sendTextMessage(farmer.whatsappNumber, `🌾 Conseil du jour :\n${tip}`);
    } catch (err) {
      console.error(`[daily-tips] Échec envoi à ${farmer.whatsappNumber}:`, err.message);
    }
  }
}

/**
 * Planifie l'envoi quotidien. Par défaut à 7h du matin, heure du serveur.
 * Ajuste l'expression cron selon le fuseau horaire de ton déploiement.
 */
export function scheduleDailyTips() {
  const schedule = process.env.DAILY_TIP_CRON || '0 7 * * *';
  cron.schedule(schedule, () => {
    console.log('[daily-tips] Exécution du job quotidien...');
    sendDailyTipsToActiveFarmers().catch((err) =>
      console.error('[daily-tips] Erreur inattendue:', err)
    );
  });
  console.log(`[daily-tips] Planifié avec l'expression cron: ${schedule}`);
}
