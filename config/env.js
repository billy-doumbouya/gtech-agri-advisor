// config/env.js
import 'dotenv/config';

function required(key) {
  const value = process.env[key];
  if (!value) {
    console.warn(`[env] Variable manquante: ${key}`);
  }
  return value;
}

export const env = {
  port: process.env.PORT || 3000,

  mongoUri: required('MONGO_URI'),

  whatsapp: {
    accessToken: required('WHATSAPP_ACCESS_TOKEN'),
    phoneNumberId: required('WHATSAPP_PHONE_NUMBER_ID'),
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    verifyToken: required('WHATSAPP_VERIFY_TOKEN'),
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION || 'v21.0',
  },

  gemini: {
    apiKey: required('GEMINI_API_KEY'),
  },
};
