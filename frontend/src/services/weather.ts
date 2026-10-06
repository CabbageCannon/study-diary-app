const WEATHER_CACHE_KEY = "study-diary:weather";
const WEATHER_CACHE_MS = 60 * 60 * 1000;

export interface WeatherSnapshot {
  location: string;
  weather: string;
  temperature: number;
  code: number;
  fetchedAt: number;
}

interface LocalityResponse {
  city?: string;
  locality?: string;
  principalSubdivision?: string;
  latitude?: number;
  longitude?: number;
}

export function readWeatherCache() {
  try {
    const value = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || "null") as WeatherSnapshot | null;
    return value && Date.now() - value.fetchedAt < WEATHER_CACHE_MS ? value : null;
  } catch {
    return null;
  }
}

function getCoordinates() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 7000, maximumAge: WEATHER_CACHE_MS });
  });
}

function weatherName(code: number) {
  if (code === 0) return "晴";
  if (code <= 3) return "多云";
  if (code <= 48) return "有雾";
  if (code <= 57) return "细雨";
  if (code <= 67) return "雨";
  if (code <= 77) return "雪";
  if (code <= 82) return "阵雨";
  if (code <= 86) return "阵雪";
  return "雷雨";
}

export async function loadWeather(): Promise<WeatherSnapshot> {
  const cached = readWeatherCache();
  if (cached) return cached;

  let latitude: number | undefined;
  let longitude: number | undefined;
  try {
    const position = await getCoordinates();
    latitude = position.coords.latitude;
    longitude = position.coords.longitude;
  } catch {
    // The reverse-geocode endpoint falls back to IP locality when location permission is unavailable.
  }

  const params = new URLSearchParams({ localityLanguage: "zh" });
  if (latitude !== undefined && longitude !== undefined) {
    params.set("latitude", String(latitude));
    params.set("longitude", String(longitude));
  }
  const locality = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${params}`).then((response) => {
    if (!response.ok) throw new Error("位置读取失败");
    return response.json() as Promise<LocalityResponse>;
  });
  latitude ??= locality.latitude;
  longitude ??= locality.longitude;
  if (latitude === undefined || longitude === undefined) throw new Error("无法确定当前位置");

  const forecast = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`).then((response) => {
    if (!response.ok) throw new Error("天气读取失败");
    return response.json() as Promise<{ current: { temperature_2m: number; weather_code: number } }>;
  });
  const snapshot: WeatherSnapshot = {
    location: locality.city || locality.locality || locality.principalSubdivision || "当前位置",
    weather: weatherName(forecast.current.weather_code),
    temperature: Math.round(forecast.current.temperature_2m),
    code: forecast.current.weather_code,
    fetchedAt: Date.now(),
  };
  try { localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(snapshot)); } catch { /* Memory state remains available. */ }
  return snapshot;
}

export function weatherSentence(snapshot: WeatherSnapshot | null) {
  if (!snapshot) return "把今天留下一点，往后的你会认出此刻。";
  const rainy = snapshot.code >= 51 && snapshot.code <= 99;
  const clear = snapshot.code <= 1;
  const day = Math.floor(Date.now() / 86_400_000);
  const options = rainy
    ? ["雨把世界放慢了一点，也适合把心事写清。", "听一会儿雨，再替今天留下一页。", "云层很低，记得带伞，也记得照顾自己。"]
    : clear
      ? ["光线正好，适合收藏今天的小小进展。", "晴朗不必盛大，记住此刻就很好。", "让今天的光，在字里多停一会儿。"]
      : ["天气温柔而克制，刚好留一点时间给自己。", "普通的一天，也值得拥有自己的页码。", "风景正在经过，写下你真正记得的部分。"];
  return options[day % options.length];
}
