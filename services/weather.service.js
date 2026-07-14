// services/weather.service.js
// Open-Meteo — API météo gratuite, sans clé requise, illimitée en usage raisonnable.
// Docs: https://open-meteo.com/en/docs

const WEATHER_CODE_LABELS = {
  0: 'ciel dégagé',
  1: 'plutôt dégagé',
  2: 'partiellement nuageux',
  3: 'couvert',
  45: 'brouillard',
  48: 'brouillard givrant',
  51: 'bruine légère',
  53: 'bruine modérée',
  55: 'bruine forte',
  61: 'pluie légère',
  63: 'pluie modérée',
  65: 'forte pluie',
  66: 'pluie verglaçante légère',
  67: 'pluie verglaçante forte',
  80: 'averses légères',
  81: 'averses modérées',
  82: 'averses violentes',
  95: 'orage',
  96: 'orage avec grêle légère',
  99: 'orage avec grêle forte',
};

function describeWeatherCode(code) {
  return WEATHER_CODE_LABELS[code] || 'conditions incertaines';
}

/**
 * Récupère la météo actuelle + prévisions 3 jours pour une position donnée.
 * Retourne un objet simplifié, prêt à être injecté dans un prompt Gemini.
 */
export async function getWeatherForLocation(latitude, longitude) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', latitude);
  url.searchParams.set('longitude', longitude);
  url.searchParams.set('current', 'temperature_2m,precipitation,weathercode,relative_humidity_2m');
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode');
  url.searchParams.set('forecast_days', '3');
  url.searchParams.set('timezone', 'auto');

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Échec récupération météo (${res.status})`);
  }
  const data = await res.json();

  const current = {
    temperature: data.current.temperature_2m,
    humidity: data.current.relative_humidity_2m,
    precipitation: data.current.precipitation,
    condition: describeWeatherCode(data.current.weathercode),
  };

  const forecast = data.daily.time.map((date, i) => ({
    date,
    tempMax: data.daily.temperature_2m_max[i],
    tempMin: data.daily.temperature_2m_min[i],
    precipitation: data.daily.precipitation_sum[i],
    condition: describeWeatherCode(data.daily.weathercode[i]),
  }));

  return { current, forecast };
}

/**
 * Formatte la météo en une phrase courte, injectable dans un prompt
 * ou envoyable telle quelle si Gemini n'est pas disponible.
 */
export function formatWeatherSummary({ current, forecast }) {
  const today = forecast[0];
  const tomorrow = forecast[1];

  let summary = `Aujourd'hui : ${current.condition}, ${Math.round(current.temperature)}°C, humidité ${current.humidity}%.`;
  if (today?.precipitation > 5) {
    summary += ` Pluie attendue aujourd'hui (${today.precipitation}mm).`;
  }
  if (tomorrow) {
    summary += ` Demain : ${tomorrow.condition}, ${Math.round(tomorrow.tempMin)}-${Math.round(tomorrow.tempMax)}°C.`;
    if (tomorrow.precipitation > 5) {
      summary += ` Pluie probable demain (${tomorrow.precipitation}mm).`;
    }
  }
  return summary;
}
