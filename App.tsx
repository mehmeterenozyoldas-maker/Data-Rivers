import React, { useState, useEffect } from 'react';
import Scene3D from './components/Scene3D';
import { fetchWeatherData } from './services/api';
import { BiomeConfig, WeatherData, BiomeKey } from './types';

const BIOMES: Record<BiomeKey, BiomeConfig> = {
  'GreatBarrierReef': {
    name: 'GreatBarrierReef',
    lat: -18.28, lon: 147.70,
    // Coral Pink, Turquoise, Sunlight Gold
    palette: ['#db2777', '#2dd4bf', '#fde047'],
    bgColor: '#0f172a',
    geometryType: 'fish',
    flowSpeed: 0.3,
    bloom: 0.6
  },
  'MarianaTrench': {
    name: 'MarianaTrench',
    lat: 11.34, lon: 142.20,
    // Bioluminescent Blue, Deep Black, Abyssal Purple
    palette: ['#000000', '#1e1b4b', '#4f46e5'],
    bgColor: '#000000',
    geometryType: 'fish',
    flowSpeed: 0.1,
    bloom: 0.8
  },
  'AbyssalNeedleTrench': {
    name: 'AbyssalNeedleTrench',
    lat: 11.34, lon: 142.20,
    // Void Black, Deepest Purple, faint Bioluminescence
    palette: ['#010002', '#06000a', '#1a0027'],
    bgColor: '#000000',
    geometryType: 'needle',
    flowSpeed: 0.15,
    bloom: 0.85
  },
  'StockholmArchipelago': {
    name: 'StockholmArchipelago',
    lat: 59.32, lon: 18.06,
    // Brackish Green, Steel Grey, Ice White
    palette: ['#115e59', '#64748b', '#e2e8f0'],
    bgColor: '#042f2e',
    geometryType: 'fish',
    flowSpeed: 0.2,
    bloom: 0.5
  },
  'NileDelta': {
    name: 'NileDelta',
    lat: 30.04, lon: 31.23,
    // Silt Brown, Teal, Gold
    palette: ['#451a03', '#0d9488', '#fbbf24'],
    bgColor: '#1a120b', 
    geometryType: 'fish',
    flowSpeed: 0.15,
    bloom: 0.45
  },
  'SargassoSea': {
    name: 'SargassoSea',
    lat: 28.00, lon: -65.00,
    // Algae Green, Deep Blue, Foam White
    palette: ['#14532d', '#1e3a8a', '#dbeafe'],
    bgColor: '#020617',
    geometryType: 'fish',
    flowSpeed: 0.25,
    bloom: 0.5
  },
  'OpenOcean': {
    name: 'OpenOcean',
    lat: 25.00, lon: -150.00,
    // Deep Navy, Ocean Blue, Foam White
    palette: ['#0a1128', '#034078', '#f8f9fa'],
    bgColor: '#001d3d',
    geometryType: 'fish',
    flowSpeed: 0.35,
    bloom: 0.55
  }
};

const NOISE_SVG = `data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.6' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E`;

const App: React.FC = () => {
  const [activeBiome, setActiveBiome] = useState<BiomeKey>('AbyssalNeedleTrench');
  const [weather, setWeather] = useState<WeatherData>({ temp: 10, wind: 10 });
  const [syncLevel, setSyncLevel] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadWeather = async () => {
      const b = BIOMES[activeBiome];
      const data = await fetchWeatherData(b.lat, b.lon);
      setWeather(data);
    };
    loadWeather();
  }, [activeBiome]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black text-white select-none font-sans">
      
      {/* Cinematic Vignette - Adjusted for a more subtle, lens-like falloff */}
      <div className="fixed inset-0 pointer-events-none z-10 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(0,0,0,0.4)_60%,rgba(0,0,0,0.95)_100%)]" />
      
      {/* Film Grain Texture - Enhanced overlay blend */}
      <div 
        className="fixed inset-0 pointer-events-none z-20 opacity-[0.07] mix-blend-overlay contrast-150 brightness-100" 
        style={{ backgroundImage: `url("${NOISE_SVG}")` }} 
      />

      {/* 3D Scene */}
      <Scene3D 
        biome={BIOMES[activeBiome]} 
        weather={weather} 
        onSyncUpdate={(val) => setSyncLevel(val)}
        onLoaded={() => setLoading(false)}
      />

      {/* Loading Screen */}
      <div 
        className={`absolute inset-0 flex items-center justify-center bg-black transition-opacity duration-1000 z-50 pointer-events-none ${loading ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-[1px] bg-white/30"></div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-white/60 animate-pulse font-light">
            Loading Swarm
            </div>
            <div className="w-12 h-[1px] bg-white/30"></div>
        </div>
      </div>

      {/* HUD UI */}
      <div className="absolute bottom-12 left-12 z-30 flex flex-col gap-6 md:flex-row md:gap-16 font-light text-white/80">
        
        {/* Location / Biome Selector */}
        <div className="group">
          <span className="block text-[9px] tracking-[0.25em] text-white/40 uppercase mb-2 border-l border-white/20 pl-3">Ecosystem</span>
          <div className="relative pl-3">
            <select 
              value={activeBiome}
              onChange={(e) => setActiveBiome(e.target.value as BiomeKey)}
              className="appearance-none bg-transparent text-sm tracking-[0.15em] uppercase focus:outline-none cursor-pointer hover:text-white transition-colors text-white/70"
            >
              {Object.keys(BIOMES).map((k) => (
                <option key={k} value={k} className="bg-black text-white/70">{k}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute top-1/2 -translate-y-1/2 right-[-12px] text-[8px] text-white/30">▼</div>
          </div>
        </div>

        {/* Atmosphere Data */}
        <div>
          <span className="block text-[9px] tracking-[0.25em] text-white/40 uppercase mb-2 border-l border-white/20 pl-3">Surface Data</span>
          <span className="block text-sm tracking-[0.15em] pl-3 tabular-nums text-white/70">
            {weather.temp.toFixed(1)}°C <span className="text-white/20 mx-2">|</span> {weather.wind.toFixed(1)} KPH
          </span>
        </div>

        {/* Neural Sync Data */}
        <div>
          <span className="block text-[9px] tracking-[0.25em] text-white/40 uppercase mb-2 border-l border-white/20 pl-3">Swarm Sync</span>
          <div className="pl-3 flex items-center gap-3">
            <div className="w-16 h-[2px] bg-white/10 overflow-hidden">
                <div 
                    className="h-full bg-white transition-all duration-300 ease-out" 
                    style={{ width: `${syncLevel * 100}%`, opacity: syncLevel > 0 ? 0.8 : 0 }}
                />
            </div>
            <span className={`block text-sm tracking-[0.15em] tabular-nums transition-colors duration-500 ${syncLevel > 0.5 ? 'text-white' : 'text-white/40'}`}>
              {(syncLevel * 100).toFixed(0)}%
            </span>
          </div>
        </div>

      </div>

      {/* Decoration: Top Right */}
      <div className="absolute top-12 right-12 z-30 text-right opacity-50 mix-blend-difference">
        <div className="text-[9px] tracking-[0.3em] uppercase border-b border-white/20 pb-2 mb-1">Aesthetic Engine</div>
        <div className="text-[8px] tracking-widest text-white/60">SCHOOL OF FISH // V3.0</div>
      </div>

    </div>
  );
};

export default App;