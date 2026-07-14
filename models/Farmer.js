// models/Farmer.js
import mongoose from 'mongoose';

const farmerSchema = new mongoose.Schema(
  {
    whatsappNumber: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: '' },
    mainCrop: { type: String, default: '' }, // ex: riz, maïs, arachide, fonio
    region: { type: String, default: '' },
    location: {
      latitude: Number,
      longitude: Number,
    },
    preferredLanguage: { type: String, default: 'fr' },
    onboardingComplete: { type: Boolean, default: false },
    locationRequested: { type: Boolean, default: false },
    dailyTipOptIn: { type: Boolean, default: true },
    lastInteractionAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const Farmer = mongoose.model('Farmer', farmerSchema);
