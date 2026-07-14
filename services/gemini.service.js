// services/gemini.service.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';

const genAI = new GoogleGenerativeAI(env.gemini.apiKey);
const textModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
const visionModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

/**
 * Répond à une question libre d'un agriculteur en tenant compte
 * de sa culture principale, sa région, et optionnellement la météo du jour.
 */
export async function getAgronomicAdvice(question, { mainCrop, region, weatherSummary } = {}) {
  const prompt = `Tu es un conseiller agricole pour de petits exploitants en Guinée.
Culture principale de l'agriculteur : ${mainCrop || 'non précisée'}.
Région : ${region || 'non précisée'}.
${weatherSummary ? `Météo actuelle : ${weatherSummary}` : ''}
Réponds en français simple, en 3-4 phrases maximum, de façon pratique et actionnable.
Si la météo est fournie et pertinente pour la question, tiens-en compte.

Question de l'agriculteur : ${question}`;

  const result = await textModel.generateContent(prompt);
  return result.response.text();
}

/**
 * Génère un conseil quotidien proactif, basé sur la culture et la météo du jour.
 * Utilisé à la fois pour les demandes explicites ("conseil du jour") et pour
 * le cron d'envoi automatique (voir jobs/dailyTips.job.js).
 */
export async function getDailyTip({ mainCrop, region, weatherSummary }) {
  const prompt = `Tu es un conseiller agricole pour de petits exploitants en Guinée.
Culture principale : ${mainCrop || 'non précisée'}.
Région : ${region || 'non précisée'}.
Météo du jour : ${weatherSummary || 'non disponible'}.

Donne UN conseil pratique et concret pour aujourd'hui, adapté à cette culture et cette météo
(ex: quand irriguer, protéger contre la pluie, traiter, semer, récolter).
Maximum 3 phrases, en français simple. Commence directement par le conseil, sans formule d'introduction.`;

  const result = await textModel.generateContent(prompt);
  return result.response.text();
}

/**
 * Diagnostique une maladie de culture à partir d'une photo.
 * imageBuffer: Buffer de l'image téléchargée depuis WhatsApp.
 */
export async function diagnoseCropImage(imageBuffer, mimeType, { mainCrop } = {}) {
  const prompt = `Tu es un conseiller agricole. Un agriculteur cultivant ${mainCrop || 'une culture non précisée'} 
t'envoie une photo de sa plante. Identifie si tu vois une maladie, un ravageur, ou une carence.
Réponds en français simple en 3 parties courtes:
1. Ce que tu observes
2. Cause probable
3. Action recommandée immédiate

Si l'image n'est pas exploitable ou pas une plante, dis-le clairement et demande une nouvelle photo plus nette.`;

  const result = await visionModel.generateContent([
    prompt,
    {
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType,
      },
    },
  ]);

  return result.response.text();
}
