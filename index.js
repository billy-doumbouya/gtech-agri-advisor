// index.js
import express from 'express';
import { env } from './config/env.js';
import { connectDB } from './services/db.service.js';
import whatsappWebhookRouter from './routes/whatsapp.webhook.routes.js';
import { scheduleDailyTips } from './jobs/dailyTips.job.js';

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.send('G-tech Agri Advisor — en ligne');
});

app.use('/webhook/whatsapp', whatsappWebhookRouter);

async function start() {
  await connectDB();
  scheduleDailyTips();
  app.listen(env.port, () => {
    console.log(`[server] Démarré sur le port ${env.port}`);
  });
}

start();
