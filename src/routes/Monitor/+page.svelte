<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import MapView from "$lib/map.svelte";
  import { alarmSound } from '../../stores/alarmSound.store';
  import { get } from 'svelte/store';
  import { speakPartFuerMark, bereinigeOrtFuerAnsage } from '$lib/missionSpeech';

  import ClockenSpielGong from "../../assets/alarmssound/ClockenSpielGong.mp3";
  import feuerwehr_gong from "../../assets/alarmssound/feuerwehr_gong.mp3";
  import brandmelder_2 from "../../assets/alarmssound/brandmelder_2.mp3";
  import p8gr_alarmton_25 from "../../assets/alarmssound/p8gr_alarmton_25.mp3";

  let missionen: any[] = [];
  let lastUpdate: any;
  let audioAlert;
  let showClockScreen = true;
  let currentTime = new Date();
  let timeInterval;
  let wetter: any = null;
  let allCarObjects: any[] = [];
  let cars: string[] = [];
  let announcedMissionIds = new Set<string>();
  let bekannteFahrzeugeProMission = new Map<string, string[]>();
  let audioSound;

  // 📰 News-Diashow für den Ruhebildschirm (Bild + Schlagzeile, wechselt automatisch)
  interface NewsItem { title: string; description: string; image: string | null }
  let newsItems: NewsItem[] = [];
  let activeSlide = 0;
  $: slidesMitBild = newsItems.filter((n) => n.image);

  // 🖼️ Einbrennschutz: Uhr/Wetter-Anzeige alle paar Minuten minimal verschieben,
  // damit auf Dauerbetrieb-Displays keine statischen Pixel eingebrannt werden.
  let burnInOffset = { x: 0, y: 0 };
  const BURN_IN_OFFSETS = [
    { x: 0, y: 0 }, { x: 18, y: -14 }, { x: -20, y: 10 }, { x: 12, y: 16 },
    { x: -16, y: -18 }, { x: 20, y: 4 }, { x: -12, y: -8 }
  ];
  let burnInIndex = 0;

  function parseCarsList(carsField: string | null | undefined): string[] {
    if (!carsField) return [];
    try {
      const parsed = JSON.parse(carsField);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  // 🚒 Standort der Feuerwache (Startpunkt der Navigation) — wird über /api/settings geladen (Setup-Wizard)
  let FEUERWACHE: { lat: number; lng: number } | null = null;

  // Route (Straßenführung) zum aktuellsten Einsatz, als [lng, lat]-Paare für die Karte
  let routeCoordinates: [number, number][] = [];
  let letzteRoutenMissionId: string | null = null;

  $: markerCoordinates = missionen
    .filter(m => m.lat != null && m.lng != null)
    .map(m => ({ lat: Number(m.lat), lng: Number(m.lng), label: m.mission_mark }));

  $: sortierteMissionen = [...missionen].sort((a, b) => Number(b.time) - Number(a.time));

  // Neuester aktiver Einsatz (zeitlich)
  $: neuesteMission = sortierteMissionen[0] ?? null;

  // Welches Fahrzeug gehört zu welchem/welchen Einsatzstichwort/en?
  $: carAssignments = (() => {
    const map = new Map<string, string[]>();
    missionen.forEach(m => {
      let carsInMission: string[] = [];
      try {
        carsInMission = JSON.parse(m.cars);
      } catch {
        carsInMission = [];
      }
      carsInMission.forEach((c: string) => {
        if (!map.has(c)) map.set(c, []);
        map.get(c)!.push(m.mission_mark);
      });
    });
    return map;
  })();

  // Status pro Fahrzeug: 'neu' (Teil des neuesten Einsatzes), 'raus' (bereits bei älterem Einsatz alarmiert), 'frei'
  $: carStatus = (() => {
    const status = new Map<string, { state: 'neu' | 'raus' | 'frei'; missions: string[] }>();
    cars.forEach(car => {
      const zugeordneteEinsaetze = carAssignments.get(car) ?? [];
      if (zugeordneteEinsaetze.length === 0) {
        status.set(car, { state: 'frei', missions: [] });
      } else if (neuesteMission && zugeordneteEinsaetze.includes(neuesteMission.mission_mark)) {
        status.set(car, { state: 'neu', missions: zugeordneteEinsaetze });
      } else {
        status.set(car, { state: 'raus', missions: zugeordneteEinsaetze });
      }
    });
    return status;
  })();

  // 🧭 Bei neuem Einsatz: Route von der Feuerwache zum Einsatzort laden
  $: if (neuesteMission && neuesteMission.id !== letzteRoutenMissionId) {
    letzteRoutenMissionId = neuesteMission.id;
    ladeRoute(neuesteMission);
  }

  // Kein aktiver Einsatz mehr → Route wieder entfernen
  $: if (!neuesteMission && routeCoordinates.length > 0) {
    routeCoordinates = [];
    letzteRoutenMissionId = null;
  }

  async function ladeRoute(mission: any) {
    if (mission.lat == null || mission.lng == null || !FEUERWACHE) {
      routeCoordinates = [];
      return;
    }
    try {
      const start = `${FEUERWACHE.lng},${FEUERWACHE.lat}`;
      const ziel = `${mission.lng},${mission.lat}`;
      const url = `https://router.project-osrm.org/route/v1/driving/${start};${ziel}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();

      if (data?.routes?.length > 0) {
        routeCoordinates = data.routes[0].geometry.coordinates;
      } else {
        console.warn("Keine Route gefunden:", data);
        routeCoordinates = [];
      }
    } catch (err) {
      console.error("Fehler beim Laden der Route:", err);
      routeCoordinates = [];
    }
  }

  async function ladeFahrzeuge() {
    try {
      const res = await fetch('/api/cars');
      allCarObjects = await res.json();
      cars = allCarObjects.map((car: { name: any }) => car.name);
    } catch (err) {
      console.error("Fehler beim Laden der Fahrzeuge:", err);
    }
  }

  async function ladeSound() {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.stationLat != null && data.stationLng != null) {
      FEUERWACHE = { lat: data.stationLat, lng: data.stationLng };
    }
    const selected = data.alarmSound ?? 'ClockenSpielGong';

    switch (selected) {
      case 'feuerwehr_gong':
        audioAlert = new Audio(feuerwehr_gong);
        break;
      case 'brandmelder_2':
        audioAlert = new Audio(brandmelder_2);
        break;
      case 'p8gr_alarmton_25':
        audioAlert = new Audio(p8gr_alarmton_25);
        break;
      default:
        audioAlert = new Audio(ClockenSpielGong);
    }
  }

  async function ladeWetter() {
    if (!FEUERWACHE) return;
    const lat = FEUERWACHE.lat;
    const lon = FEUERWACHE.lng;
    const key = 'a75a559648e66c22c290d4fb04a25fc2';
    try {
      const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=de&appid=${key}`);
      wetter = await res.json();
      console.log("Wetterdaten:", wetter);
    } catch (err) {
      console.error("Fehler beim Laden des Wetters:", err);
    }
  }

  async function ladeNews() {
    try {
      const res = await fetch('/api/news');
      const data = await res.json();
      newsItems = Array.isArray(data.items) ? data.items : [];
      activeSlide = 0;
    } catch (err) {
      console.error("Fehler beim Laden der Nachrichten:", err);
    }
  }

  function naechsteSlide() {
    if (slidesMitBild.length === 0) return;
    activeSlide = (activeSlide + 1) % slidesMitBild.length;
  }

  function pixelVerschieben() {
    burnInIndex = (burnInIndex + 1) % BURN_IN_OFFSETS.length;
    burnInOffset = BURN_IN_OFFSETS[burnInIndex];
  }

  async function ladeMissionen() {
    try {
      const res = await fetch('/api/missions');
      const alleMissionen = await res.json();
      lastUpdate = Date.now();
      missionen = alleMissionen.filter((m: any) => m.isDone === 0);

      if (missionen.length > 0) {
        showClockScreen = false;
        const neue = missionen.filter(m => !announcedMissionIds.has(m.id));

        if (neue.length > 0) {
          const m = neue[0];
          const speakPartMM = speakPartFuerMark(m.mission_mark);
          const cleanedLoc = bereinigeOrtFuerAnsage(m.locString);

          queueAnnouncement([speakPartMM, m.mission_des, m.cars, `Ort: ${cleanedLoc}`]);

          neue.forEach(m => {
            announcedMissionIds.add(m.id);
            bekannteFahrzeugeProMission.set(m.id, parseCarsList(m.cars));
          });
        }

        // 📣 Nachalarmierung erkennen: bereits angesagte Einsätze, denen neue Fahrzeuge hinzugefügt wurden
        missionen.forEach(m => {
          if (!announcedMissionIds.has(m.id)) return;

          const bisherigeFahrzeuge = bekannteFahrzeugeProMission.get(m.id) ?? [];
          const aktuelleFahrzeuge = parseCarsList(m.cars);
          const neueFahrzeuge = aktuelleFahrzeuge.filter(c => !bisherigeFahrzeuge.includes(c));

          if (neueFahrzeuge.length > 0) {
            bekannteFahrzeugeProMission.set(m.id, aktuelleFahrzeuge);

            const cleanedLoc = bereinigeOrtFuerAnsage(m.locString);
            queueAnnouncement([
              'Achtung Nachalarmierung',
              m.mission_des,
              neueFahrzeuge.join(', '),
              `Ort: ${cleanedLoc}`
            ]);
          }
        });
      } else {
        showClockScreen = true;
        announcedMissionIds.clear();
        bekannteFahrzeugeProMission.clear();
      }
    } catch (error) {
      console.error("Fehler beim Laden der Missionen", error);
    }
  }

  // 📣 Manuelle Ansagen (z. B. Einsatzstufe erhöht), die im Dispatcher-UI ausgelöst werden.
  // Der Server merkt sich, welche schon abgeholt wurden (siehe /api/announcements), damit
  // sie bei mehreren offenen Monitoren nicht mehrfach vorgelesen werden.
  async function pruefeAnsagen() {
    try {
      const res = await fetch('/api/announcements');
      const items: { id: number; mission_id: any; cars: string[]; parts: string[] }[] = await res.json();

      items.forEach((item) => {
        // Fahrzeuge, die schon Teil dieser Ansage waren (z. B. bei einer Einsatzstufen-Erhöhung
        // mit Fahrzeugalarmierung), als "bekannt" vormerken – sonst würde die normale
        // Nachalarmierungs-Erkennung unten sie gleich nochmal (mit zweitem Gong) ansagen.
        if (item.mission_id != null && item.cars.length > 0) {
          const bisherige = bekannteFahrzeugeProMission.get(item.mission_id) ?? [];
          bekannteFahrzeugeProMission.set(item.mission_id, Array.from(new Set([...bisherige, ...item.cars])));
        }
        queueAnnouncement(item.parts);
      });
    } catch (err) {
      console.error('Fehler beim Laden der Ansagen:', err);
    }
  }

  // 📣 Ansage-Warteschlange: verhindert, dass sich zwei Ansagen (z. B. neuer Einsatz +
  // Nachalarmierung im selben Poll-Zyklus) gegenseitig unterbrechen.
  let ansageWarteschlange: string[][] = [];
  let ansageLaeuft = false;

  function queueAnnouncement(parts: string[]) {
    ansageWarteschlange.push(parts);
    if (!ansageLaeuft) verarbeiteAnsageWarteschlange();
  }

  async function verarbeiteAnsageWarteschlange() {
    const parts = ansageWarteschlange.shift();
    if (!parts) {
      ansageLaeuft = false;
      return;
    }
    ansageLaeuft = true;
    await speakWithPauses(parts);
    verarbeiteAnsageWarteschlange();
  }

  function speakWithPauses(parts: string[]): Promise<void> {
    if (!audioAlert) return Promise.resolve();

    return new Promise((resolve) => {
      let angesagt = false;

      const jetztAnsagen = async () => {
        if (angesagt) return; // z. B. wenn Gong sowohl "ended" feuert als auch play() zuvor ablehnte
        angesagt = true;

        const voice = await getVoice("Microsoft Stefan", "de-DE");
        if (!voice) {
          console.warn("⚠️ Stimme nicht gefunden, fallback wird verwendet.");
        }

        let delay = 0;
        parts.forEach((part) => {
          setTimeout(() => {
            const utterance = new SpeechSynthesisUtterance(part);
            utterance.voice = voice;
            utterance.lang = 'de-DE';
            utterance.pitch = 0.9;
            speechSynthesis.speak(utterance);
          }, delay);
          delay += part.length * 80 + 300;
        });

        setTimeout(resolve, delay);
      };

      audioAlert.currentTime = 0;
      audioAlert.onended = jetztAnsagen;

      // Browser können Autoplay ohne vorherige Nutzerinteraktion blockieren (Promise wird abgelehnt,
      // "ended" feuert dann nie). Dann trotzdem ansagen, statt die Warteschlange für immer zu blockieren.
      const playResult = audioAlert.play();
      if (playResult?.catch) {
        playResult.catch((err: unknown) => {
          console.warn('⚠️ Alarmton konnte nicht automatisch abgespielt werden:', err);
          jetztAnsagen();
        });
      }
    });
  }

  function getVoice(preferredName: string, lang: string): Promise<SpeechSynthesisVoice | null> {
    return new Promise((resolve) => {
      const loadVoices = () => {
        const voices = speechSynthesis.getVoices();
        const preferred = voices.find(v => v.name.includes(preferredName));
        const fallback = voices.find(v => v.lang === lang);
        resolve(preferred || fallback || null);
      };

      if (speechSynthesis.getVoices().length > 0) {
        loadVoices();
      } else {
        speechSynthesis.addEventListener('voiceschanged', loadVoices, { once: true });
      }
    });
  }

  onMount(async () => {
    await ladeSound();
    ladeFahrzeuge();
    ladeMissionen();
    ladeWetter();
    ladeNews();

    timeInterval = setInterval(() => currentTime = new Date(), 1000);
    // Ansagen IMMER vor dem Missions-Poll abfragen (nicht als getrennte Timer!): so sind
    // Fahrzeuge aus einer kombinierten Ansage (z. B. Einsatzstufe + Fahrzeuge) schon als
    // "bekannt" vorgemerkt, bevor die Nachalarmierungs-Diff-Erkennung unten läuft – sonst
    // könnte ein ungünstiges Timing zwischen zwei unabhängigen Timern zu einer doppelten
    // Ansage (zweimal Gong) für dieselben Fahrzeuge führen.
    setInterval(async () => {
      await pruefeAnsagen();
      await ladeMissionen();
    }, 5000);
    setInterval(ladeWetter, 1800000);
    setInterval(ladeNews, 900000);
    setInterval(pixelVerschieben, 180000);
    setInterval(naechsteSlide, 10000);
  });

  onDestroy(() => clearInterval(timeInterval));
</script>

<main class="min-h-screen text-white p-4">

  {#if showClockScreen}
    <div class="fixed inset-0 text-white overflow-hidden">

      <!-- 🖼️ Diashow: großflächige News-Slides mit Bild als Hintergrund -->
      {#if slidesMitBild.length > 0}
        {#each slidesMitBild as slide, i (slide.title)}
          <div
            class="absolute inset-0 transition-opacity duration-1000 ease-in-out"
            style="opacity: {i === activeSlide ? 1 : 0};"
          >
            <img src={slide.image} alt="" class="w-full h-full object-cover" />
            <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/30"></div>
          </div>
        {/each}

        <div class="absolute bottom-24 left-16 right-16 max-w-4xl">
          {#each slidesMitBild as slide, i (slide.title)}
            {#if i === activeSlide}
              <h2 class="text-4xl font-bold drop-shadow-lg mb-3 leading-snug">{slide.title}</h2>
              <p class="text-lg text-gray-200 drop-shadow leading-relaxed">{slide.description}</p>
            {/if}
          {/each}
        </div>

        <!-- Tab-Punkte: zeigen, welche Slide gerade aktiv ist -->
        <div class="absolute bottom-10 left-16 flex gap-2">
          {#each slidesMitBild as _, i}
            <div
              class={`h-1.5 rounded-full transition-all duration-500 ${i === activeSlide ? 'w-8 bg-white' : 'w-1.5 bg-white/40'}`}
            ></div>
          {/each}
        </div>
      {:else}
        <div class="absolute inset-0 bg-gray-900 flex items-center justify-center">
          <p class="text-base text-gray-500 tracking-wide animate-pulse">Warten auf Alarm …</p>
        </div>
      {/if}

      <!-- Uhr/Datum: klein und fest oben links, damit sie immer sichtbar bleibt -->
      <div
        class="absolute top-6 left-6 transition-transform duration-[3000ms] ease-in-out"
        style="transform: translate({burnInOffset.x}px, {burnInOffset.y}px);"
      >
        <div class="text-5xl font-bold font-mono tracking-wider drop-shadow-lg">
          {currentTime.toLocaleTimeString('de-DE')}
        </div>
        <div class="mt-1 text-sm text-gray-300 capitalize drop-shadow">
          {currentTime.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        </div>
        {#if slidesMitBild.length > 0}
          <div class="mt-1 text-xs text-gray-400 tracking-wide animate-pulse">Warten auf Alarm …</div>
        {/if}
      </div>

      {#if wetter && wetter.weather && wetter.weather.length > 0}
        <div
          class="absolute top-6 right-6 backdrop-blur-md border border-gray-700/60 rounded-2xl px-5 py-3 flex items-center gap-3 shadow-2xl transition-transform duration-[3000ms] ease-in-out"
          style="transform: translate({burnInOffset.x}px, {burnInOffset.y}px);"
        >
          <img
            src={`https://openweathermap.org/img/wn/${wetter.weather[0].icon}@2x.png`}
            alt="Wetter"
            class="w-12 h-12 -my-2"
          />
          <div>
            <div class="text-2xl font-bold leading-tight">{Math.round(wetter.main.temp)}°C</div>
            <div class="text-xs text-gray-300 capitalize">{wetter.weather[0].description}</div>
            <div class="text-xs text-gray-500">{wetter.name}</div>
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <h1 class="text-3xl font-bold mb-6 items-center gap-2">
      <span>Alarm Monitor</span>
    </h1>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start mb-8">
      <div class="flex flex-col gap-5">
        {#each sortierteMissionen as m (m.id)}
          {@const istNeueste = neuesteMission && m.id === neuesteMission.id}
          
          <div
  class="relative rounded-2xl shadow-2xl transition-all duration-300 overflow-hidden
    {istNeueste 
      ? 'p-8 bg-red-900 text-white border-red-800 ring-2 ring-red-500/50' 
      : 'p-4 bg-gray-900/80 opacity-60'}"
>
  
      

            <div class="flex items-center justify-between mb-3">
              <span class={istNeueste ? "text-4xl font-extrabold tracking-wide" : "text-xl font-bold text-gray-400"}>
                {m.mission_mark}
              </span>
              {#if !istNeueste}
                <span class="text-xs text-gray-400"> {new Date(Number(m.time)).toLocaleString('de-DE')}</span>
              {/if}
            </div>

            {#if istNeueste}
              <div class="text-xs text-red-300/80 mb-3 flex items-center gap-1 font-medium">
                <span> Alarmiert um:</span>
                <span class="font-bold">{new Date(Number(m.time)).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} Uhr</span>
              </div>
            {/if}
            
            <div class={istNeueste ? "text-2xl font-bold text-white mb-6 leading-snug" : "text-lg text-gray-300 mb-2"}>
              {m.mission_des}
            </div>
            
            {#if istNeueste}
              <div class="border-2 p-4 bg-black rounded-xl flex items-start gap-4 shadow-inner">
                <div class="flex-1">
                  <div class="text-xs font-bold uppercase mb-1">
                    Ziel / Einsatzort:
                  </div>
                  <div class="text-2xl font-black tracking-wide leading-tight">
                    {m.locString}
                  </div>
                </div>
              </div>
            {:else}
              <div class="text-sm text-gray-400 flex items-center gap-1 mt-2">
               <span>{m.locString}</span>
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <div class="bg-gray-800/80 backdrop-blur-sm p-4 rounded-2xl shadow-xl border border-gray-700/50">
        <h2 class="text-xl mb-3 font-semibold flex items-center gap-2">Einsatzkarte & Anfahrt</h2>
        <MapView isInterative={false} {markerCoordinates} {routeCoordinates} feuerwache={FEUERWACHE} />
      </div>
    </div>

    {#if cars.length > 0}
      <div class="mt-8">
        <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 class="text-xl font-bold flex items-center gap-2">Fahrzeuge</h2>
          <div class="flex items-center gap-4 text-xs text-gray-400">
            <div class="flex items-center gap-1.5">
              <span class="w-3 h-3 rounded-full inline-block" style="background-color: var(--color-neu);"></span> Neuer Einsatz
            </div>
            <div class="flex items-center gap-1.5">
              <span class="w-3 h-3 rounded-full inline-block" style="background-color: var(--color-raus);"></span> Bereits draußen
            </div>
            <div class="flex items-center gap-1.5">
              <span class="w-3 h-3 rounded-full inline-block" style="background-color: var(--color-frei);"></span> Frei
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
          {#each cars as car}
            {@const status = carStatus.get(car) ?? { state: 'frei', missions: [] }}
            <div
              class={`relative rounded-2xl m-3 text-center font-bold shadow-lg transition-all duration-300 hover:brightness-110 flex flex-col items-center justify-center
                ${status.state === 'neu'
                  ? 'py-6 px-4 animate-pulseandscale '
                  : status.state === 'raus'
                    ? 'py-3 px-2 scale-80 opacity-80'
                    : 'py-6 px-4'}`}
              style="
                background-color: {status.state === 'neu' ? 'var(--color-neu)' : status.state === 'raus' ? 'var(--color-raus)' : 'var(--color-frei)'};
                color: {status.state === 'frei' ? 'var(--color-text-frei)' : '#ffffff'};
              "
            >
              <div class={status.state === 'raus' ? 'text-sm' : 'text-lg'}>{car}</div>
              {#if status.missions.length > 0}
                <div class="text-[11px] font-normal mt-1 opacity-80">{status.missions.join(', ')}</div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</main>

<style>
  :global(:root) {
    --color-neu: #e71212;        /* Neuer Einsatz */
    --color-raus: #0b3b63;       /* Fahrzeug bereits im Einsatz */
    --color-frei: #374151;       /* Fahrzeug frei / verfügbar */
    --color-text-frei: #d1d5db;  /* Textfarbe auf "frei" */
  }

  ::-webkit-scrollbar {
    width: 8px;
  }
  ::-webkit-scrollbar-track {
    background: #374151;
    border-radius: 4px;
  }
  ::-webkit-scrollbar-thumb {
    background: #4B5563;
    border-radius: 4px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: #6B7280;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  @keyframes pulseandscale {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.1); }
  }

  .animate-pulse {
    animation: pulse 1.5s infinite;
  }

  .animate-pulseandscale {
    animation: pulseandscale 1.5s infinite;
  }
</style>