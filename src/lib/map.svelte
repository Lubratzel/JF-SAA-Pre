<script lang="ts">
  import {
    Control,
    ControlButton,
    ControlGroup,
    mapContext,
    MapLibre,
    Marker,
    Popup
  } from 'svelte-maplibre';
  import MapEvents from 'svelte-maplibre/MapEvents.svelte';
  import DefaultMarker from 'svelte-maplibre/DefaultMarker.svelte';

  import maplibregl from 'maplibre-gl';
  const { LngLatBounds, LngLat } = maplibregl;

  import { onMount } from "svelte";

  export let marker: { lngLat: LngLat } | null = null;
  export let isInterative: boolean;
  export let markerAddress: Address = null;
  export let markerCoordinates: { lat: number; lng: number; label: string }[] = [];
  export let markerLocCor: LngLat = null;
  export let missionen: any[] = [];

  // 🧭 Navigation: Route (als [lng, lat]-Paare) und optionaler Startpunkt (Feuerwache)
  export let routeCoordinates: [number, number][] = [];
  export let feuerwache: { lat: number; lng: number } | null = null;

  // 🎨 Farben — hier anpassen
  const ROUTE_COLOR = '#F54927';       // Rot – Routenlinie
  const ZIEL_FARBE = '#dc2626';        // Rot – Marker am Einsatzort
  const FEUERWACHE_FARBE = '#16a34a';  // Grün – Marker an der Feuerwache
  const ROUTE_WIDTH = 5;

  let map: any;
  let routeListenerBound = false;

  interface Address {
    house_number?: string;
    road?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    postcode?: string;
    state?: string;
    country?: string;
  }

  // 🧭 Wenn eine Route vorhanden ist: Karte so zentrieren/zoomen, dass die
  // GESAMTE Route (Feuerwache → Ziel) sichtbar ist. Reagiert bewusst NUR auf
  // routeCoordinates/feuerwache, damit das ständige Nachladen der Missionen
  // (alle 5s) die Karte nicht ununterbrochen neu zentriert und dabei per
  // setStyle() die gezeichnete Route wieder löscht.
  $: if (!isInterative && map && routeCoordinates.length > 0) {
    const bounds = new LngLatBounds();
    for (const [lng, lat] of routeCoordinates) {
      bounds.extend([lng, lat]);
    }
    if (feuerwache) {
      bounds.extend([feuerwache.lng, feuerwache.lat]);
    }
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 80, duration: 1000 });
    }
  }

  // 🧭 Idle-Zustand: keine Route, keine Einsatz-Marker → Karte auf die
  // Feuerwache zentrieren, weit rausgezoomt für den Überblick.
  $: if (!isInterative && map && feuerwache && routeCoordinates.length === 0 && markerCoordinates.length === 0) {
    map.flyTo({ center: [feuerwache.lng, feuerwache.lat], zoom: 12, duration: 1000 });
  }

  // 🧭 automatische Zentrierung auf einzelne/mehrere Marker, wenn (noch) keine
  // Route vorliegt — unverändert zur bisherigen Logik.
  $: if (!isInterative && map && routeCoordinates.length === 0 && markerCoordinates.length > 0) {
    if (markerCoordinates.length === 1) {
      const coord = markerCoordinates[0];
      map.setStyle("https://api.maptiler.com/maps/hybrid/style.json?key=aVM9cMDhzhxBcqpkuMp2");
      map.flyTo({ center: [parseFloat(coord.lng), parseFloat(coord.lat)], zoom: 15 });
    } else {
      const bounds = new LngLatBounds();
      for (const coord of markerCoordinates) {
        bounds.extend([parseFloat(coord.lng), parseFloat(coord.lat)]);
      }

      if (!bounds.isEmpty()) {
        map.setStyle("https://api.maptiler.com/maps/hybrid/style.json?key=aVM9cMDhzhxBcqpkuMp2");
        map.fitBounds(bounds, {
          padding: 100,
          duration: 1000
        });
      }
    }
  }

  // 🧭 Interaktiver Modus: EINMALIG beim Öffnen zentrieren, danach nie wieder
  // automatisch (sonst würde jeder Klick des Nutzers die Karte wegreißen).
  // Vorhandener Marker (z. B. beim Bearbeiten der Feuerwache im Setup) hat
  // Vorrang, sonst wird auf die Feuerwache zentriert (z. B. beim Anlegen
  // eines neuen Einsatzes), damit sie sichtbar ist. Ohne beides bleibt es
  // beim Standard-Ausschnitt (ganz Deutschland).
  let initialZentrierungErledigt = false;
  $: if (isInterative && map && !initialZentrierungErledigt) {
    initialZentrierungErledigt = true;
    if (marker) {
      map.jumpTo({ center: [marker.lngLat.lng, marker.lngLat.lat], zoom: 14 });
    } else if (feuerwache) {
      map.jumpTo({ center: [feuerwache.lng, feuerwache.lat], zoom: 13 });
    }
  }

  // 🔎 Wird der Marker von außen gesetzt (z. B. per Adresssuche statt Klick),
  // fliegt die Karte zur neuen Position, damit die Auswahl sichtbar wird.
  $: if (isInterative && map && initialZentrierungErledigt && marker) {
    map.flyTo({ center: [marker.lngLat.lng, marker.lngLat.lat], zoom: 15, duration: 800 });
  }

  // 🖱️ Marker auf Karte setzen (interaktiv)
  function addMarker(e: CustomEvent<MapMouseEvent>) {
    const lngLat = e.detail.lngLat;
    marker = { lngLat };
    markerLocCor = lngLat;

    getAddress(lngLat.lat, lngLat.lng).then((address) => {
      markerAddress = address;
    });
  }

  async function getAddress(lat: number, lon: number): Promise<Address> {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data?.address) return data.address;
      throw new Error("Keine Adresse gefunden");
    } catch (error) {
      console.error("Fehler beim Abrufen der Adresse:", error);
      return {};
    }
  }

  // 🧭 Route als GeoJSON-Linie auf der Karte zeichnen/aktualisieren/entfernen
  function zeichneRoute() {
    if (!map) return;

    try {
      const bestehendeSource: any = map.getSource('route');

      // Kein Einsatz mehr aktiv → Route wieder entfernen
      if (!routeCoordinates || routeCoordinates.length === 0) {
        if (map.getLayer('route-line')) map.removeLayer('route-line');
        if (map.getSource('route')) map.removeSource('route');
        return;
      }

      const geojson = {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: routeCoordinates
        }
      };

      if (bestehendeSource) {
        bestehendeSource.setData(geojson);
      } else {
        map.addSource('route', {
          type: 'geojson',
          data: geojson
        });
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': ROUTE_COLOR,
            'line-width': ROUTE_WIDTH,
            'line-opacity': 0.85
          }
        });
      }
    } catch (err) {
      // Style ist evtl. gerade noch am Laden (z.B. direkt nach setStyle) —
      // 'style.load'/'load'-Listener unten zeichnet die Route dann automatisch nach
      console.warn("Route konnte noch nicht gezeichnet werden, versuche es erneut:", err);
    }
  }

  // Beim ersten verfügbaren map-Objekt Listener registrieren, damit die Route
  // auch nach einem Kartenstil-Wechsel (setStyle) automatisch neu gezeichnet wird
  $: if (map && !routeListenerBound) {
    routeListenerBound = true;
    map.on('load', zeichneRoute);
    map.on('style.load', zeichneRoute);
  }

  // Route neu zeichnen, sobald sich die Koordinaten ändern
  $: if (map) {
    routeCoordinates;
    zeichneRoute();
  }
</script>


<MapLibre
  bind:map
  center={[10.4515, 51.1657]}
  zoom={5.5}
  class="map"
  standardControls
  style="https://api.maptiler.com/maps/streets-v2/style.json?key=aVM9cMDhzhxBcqpkuMp2"
>
  <!-- 🧭 Stil-Kontrollleiste -->

  {#if isInterative}
  <Control class="flex flex-col gap-y-2">
    <ControlGroup>
      <ControlButton on:click={() => map.setStyle("https://api.maptiler.com/maps/hybrid/style.json?key=aVM9cMDhzhxBcqpkuMp2")}>
        <i class="fa-solid fa-satellite text-black"></i>
      </ControlButton>
      <ControlButton on:click={() => map.setStyle("https://api.maptiler.com/maps/streets-v2/style.json?key=aVM9cMDhzhxBcqpkuMp2")}>
        <i class="fa-solid fa-road text-black"></i>
      </ControlButton>
      <ControlButton on:click={() => map.setStyle("https://api.maptiler.com/maps/a2fceddd-cd4c-4026-8b6f-7c5d97d5850b/style.json?key=aVM9cMDhzhxBcqpkuMp2")}>
        <i class="fa-solid fa-moon text-black"></i>
      </ControlButton>
    </ControlGroup>
  </Control>
  {/if}

 {#if feuerwache}
  <Marker lngLat={[Number(feuerwache.lng), Number(feuerwache.lat)]}>
    <div class="relative flex flex-col items-center group">
      <div class="flex items-center justify-center w-8 h-8 bg-green-600 text-white font-bold border-2 border-white rounded-full rounded-br-full -rotate-45 shadow-lg">
        <span class="rotate-45 text-sm">A</span>
      </div>
    </div>

  </Marker>
{/if}

  <!-- Interaktiver Modus: Marker setzen -->
  {#if isInterative}
    <MapEvents on:click={addMarker} />
    {#if marker}
      <DefaultMarker lngLat={marker.lngLat} />
    {/if}

 {:else if markerCoordinates.length > 0}
    {#each markerCoordinates as coord, i (i)}
  {@const istNeuester = i === markerCoordinates.length - 1}
  {@const markerStyle = istNeuester 
    ? 'bg-red-600 text-white border-red-400' 
    : 'bg-gray-600 text-gray-300 border-gray-500'}

  <Marker lngLat={[coord.lng, coord.lat]}>
    <div class="flex items-center justify-center w-8 h-8 font-bold border-2 shadow-lg rounded-full rounded-br-full {markerStyle}">
      {#if istNeuester}B{/if}
    </div>

    <Popup openOn="hover" offset={[0, -15]}>
      <div class="p-2 text-black max-w-xs">
        <h4 class="font-bold text-base text-red-600 mb-1">{coord.label}</h4>
      </div>
    </Popup>
  </Marker>
{/each}

  <!-- Fallback: missionen anzeigen (z. B. bei Übersicht) -->
  {:else}
    {#each missionen as m (m.id)}
      {#if m.lat != null && m.lng != null}
        <Marker lngLat={[m.lng, m.lat]}
          class={`grid h-5 w-5 place-items-center rounded-b-[0.4rem] border border-red-600 border-2
            ${m.immediateAlarm ? 'bg-white' : 'bg-gray-400'}
          text-black shadow-2xl focus:outline-2 focus:outline-black relative`}>
          <Popup openOn="hover" offset={[0, -20]}>
            <div class="text-lg font-bold">{m.mission_mark}</div>
            <div class="text-sm">{m.mission_des}</div>
            <div class="text-xs mt-2">{m.locString}</div>
          </Popup>
        </Marker>
      {/if}
    {/each}
  {/if}
</MapLibre>

<style>
  :global(.map) {
    height: 500px;
  }
</style>