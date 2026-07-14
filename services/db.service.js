// services/db.service.js
import mongoose from 'mongoose';
import { env } from '../config/env.js';

export async function connectDB() {
  try {
    await mongoose.connect(env.mongoUri);
    console.log('[db] MongoDB connecté');
  } catch (err) {
    console.error('[db] Échec de connexion MongoDB:', err.message);
    process.exit(1);
  }
}
