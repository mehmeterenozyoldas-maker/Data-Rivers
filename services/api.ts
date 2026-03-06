import { WeatherData } from '../types';

export const fetchWeatherData = async (lat: number, lon: number): Promise<WeatherData> => {
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m`
    );
    const data = await response.json();
    return {
      temp: data.current.temperature_2m,
      wind: data.current.wind_speed_10m,
    };
  } catch (error) {
    console.error("Weather fetch failed", error);
    // Return fallback data if API fails
    return { temp: 15, wind: 10 };
  }
};
