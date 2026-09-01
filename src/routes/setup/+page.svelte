<script lang="ts">
  import { onMount } from 'svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { Button, Kbd } from 'flowbite-svelte';
  import MapView from '$lib/map.svelte';

  const steps = ['Feuerwehr', 'Fahrzeuge', 'Feuerwache', 'Fertig'];
  let step = 0;

  let feuerwehrName = '';
  let dispatcherName = '';

  let cars: any[] = [];
  let newCarName = '';

  let marker: { lngLat: { lat: number; lng: number } } | null = null;
  let markerLocCor: { lat: number; lng: number } | null = null;
  let markerAddress: any = null;

  let isSaving = false;
  let isLoading = true;

  let addressQuery = '';
  let addressSuggestions: any[] = [];
  let isSearchingAddress = false;
  let showAddressSuggestions = false;
  let addressSearchTimeout: ReturnType<typeof setTimeout>;

  async function loadExisting() {
    const res = await fetch('/api/settings');
    const data = await res.json();
    feuerwehrName = data.feuerwehrName ?? '';
    dispatcherName = data.dispatcherName ?? '';
    if (data.stationLat != null && data.stationLng != null) {
      const lngLat = { lat: data.stationLat, lng: data.stationLng };
      marker = { lngLat };
      markerLocCor = lngLat;
    }
    await loadCars();
    isLoading = false;
  }

  async function loadCars() {
    const res = await fetch('/api/cars');
    cars = await res.json();
  }

  async function addNewCar() {
    if (!newCarName.trim()) return;
    const res = await fetch('/api/addCar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCarName })
    });
    if (res.ok) {
      newCarName = '';
      await loadCars();
    }
  }

  async function removeCar(name: string) {
    const res = await fetch('/api/cars', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    if (res.ok) await loadCars();
  }

  function scheduleAddressSearch() {
    clearTimeout(addressSearchTimeout);
    if (addressQuery.trim().length < 3) {
      addressSuggestions = [];
      showAddressSuggestions = false;
      return;
    }
    addressSearchTimeout = setTimeout(() => searchAddress(addressQuery), 350);
  }

  async function searchAddress(query: string) {
    isSearchingAddress = true;
    try {
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        addressdetails: '1',
        limit: '6',
        'accept-language': 'de'
      });

      // Ergebnisse in der Nähe der bereits gewählten Feuerwache bevorzugen
      // (bounded=0 → Vorschläge außerhalb werden nicht ausgeschlossen, nur niedriger gereiht)
      if (markerLocCor) {
        const delta = 0.35;
        params.set(
          'viewbox',
          [
            markerLocCor.lng - delta,
            markerLocCor.lat + delta,
            markerLocCor.lng + delta,
            markerLocCor.lat - delta
          ].join(',')
        );
        params.set('bounded', '0');
      }

      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
      const data = await res.json();
      addressSuggestions = Array.isArray(data) ? data : [];
      showAddressSuggestions = addressSuggestions.length > 0;
    } catch (err) {
      console.error('Fehler bei der Adresssuche:', err);
      addressSuggestions = [];
    } finally {
      isSearchingAddress = false;
    }
  }

  function waehleAdresse(result: any) {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    marker = { lngLat: { lat, lng } };
    markerLocCor = { lat, lng };
    markerAddress = result.address ?? null;
    addressQuery = result.display_name;
    addressSuggestions = [];
    showAddressSuggestions = false;
  }

  function weiter() {
    if (step < steps.length - 1) step += 1;
  }

  function zurueck() {
    if (step > 0) step -= 1;
  }

  async function fertigstellen() {
    isSaving = true;
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        feuerwehrName,
        dispatcherName,
        stationLat: markerLocCor?.lat ?? null,
        stationLng: markerLocCor?.lng ?? null,
        setupCompleted: true
      })
    });
    isSaving = false;
    await invalidateAll();
    goto('/');
  }

  onMount(loadExisting);
</script>

<main class="p-6 max-w-3xl mx-auto text-white space-y-8">
  <h2 class="text-3xl font-extrabold">🧙 Ersteinrichtung</h2>

  {#if isLoading}
    <div class="flex items-center gap-3 text-gray-400">
      <i class="fa-solid fa-spinner fa-spin text-2xl"></i>
      Lade aktuelle Einstellungen...
    </div>
  {:else}

  <!-- Fortschritt -->
  <div class="flex items-center gap-2">
    {#each steps as label, i}
      <div class="flex items-center gap-2">
        <div
          class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border-2
          {i === step ? 'bg-red-700 border-red-400' : i < step ? 'bg-green-700 border-green-400' : 'bg-gray-700 border-gray-500'}"
        >
          {#if i < step}✓{:else}{i + 1}{/if}
        </div>
        <span class="text-sm {i === step ? 'font-bold' : 'text-gray-400'}">{label}</span>
        {#if i < steps.length - 1}
          <div class="w-8 h-0.5 bg-gray-600"></div>
        {/if}
      </div>
    {/each}
  </div>

  {#if step === 0}
    <div class="space-y-8">
      <div class="space-y-4">
        <h3 class="text-2xl font-bold flex items-center gap-2">
          <i class="fa-solid fa-fire-flame-curved text-blue-400"></i>
          Feuerwehr
        </h3>
        <p class="text-gray-400 text-sm">Wie soll die Feuerwehr/Jugendfeuerwehr in der Navigation angezeigt werden?</p>
        <input
          bind:value={feuerwehrName}
          placeholder="z. B. Jugendfeuerwehr Münchweiler"
          class="px-4 py-2 rounded text-black w-full max-w-md"
        />
      </div>
      <div class="space-y-4">
        <h3 class="text-2xl font-bold flex items-center gap-2">
          <i class="fa-solid fa-user-tie text-blue-400"></i>
          Disponent
        </h3>
        <p class="text-gray-400 text-sm">Wie soll der diensthabende Disponent angezeigt werden?</p>
        <input
          bind:value={dispatcherName}
          placeholder="Name des Disponenten"
          class="px-4 py-2 rounded text-black w-full max-w-md"
        />
      </div>
    </div>
  {:else if step === 1}
    <div class="space-y-4">
      <h3 class="text-2xl font-bold flex items-center gap-2">
        <i class="fa-solid fa-car text-blue-400"></i>
        Fahrzeuge
      </h3>
      <p class="text-gray-400 text-sm">Welche Fahrzeuge stehen zur Verfügung?</p>
      <div class="flex flex-wrap gap-2">
        {#each cars as car}
          <Kbd class="px-2 py-1.5 gap-3">
            {car.name}
            <a on:click={() => removeCar(car.name.toString())} style="color: #ff0000;">
              <i class="fa-solid fa-xmark" style="color: #ff0000;"></i>
            </a>
          </Kbd>
        {/each}
      </div>
      <div class="flex gap-3 items-center">
        <input
          bind:value={newCarName}
          placeholder="Fahrzeugname z. B. TLF"
          class="px-4 py-2 rounded text-black w-full max-w-md"
          on:keydown={(e) => e.key === 'Enter' && addNewCar()}
        />
        <Button on:click={addNewCar} color="blue" class="gap-2">
          <i class="fa-solid fa-plus"></i> Hinzufügen
        </Button>
      </div>
    </div>
  {:else if step === 2}
    <div class="space-y-4">
      <h3 class="text-2xl font-bold flex items-center gap-2">
        <i class="fa-solid fa-map-location-dot text-blue-400"></i>
        Feuerwache
      </h3>
      <p class="text-gray-400 text-sm">
        Adresse eingeben oder direkt auf der Karte klicken, um den Standort der Feuerwache festzulegen.
      </p>

      <div class="relative max-w-md">
        <input
          bind:value={addressQuery}
          on:input={scheduleAddressSearch}
          on:focus={() => (showAddressSuggestions = addressSuggestions.length > 0)}
          placeholder="Adresse eingeben, z. B. Hauptstraße 1"
          autocomplete="off"
          class="px-4 py-2 rounded text-black w-full"
        />
        {#if isSearchingAddress}
          <i class="fa-solid fa-spinner fa-spin absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"></i>
        {/if}
        {#if showAddressSuggestions}
          <ul class="absolute z-10 mt-1 w-full bg-white text-black rounded shadow-lg max-h-64 overflow-y-auto">
            {#each addressSuggestions as result}
              <li>
                <button
                  type="button"
                  class="w-full text-left px-4 py-2 hover:bg-gray-200 text-sm border-b border-gray-200 last:border-0"
                  on:click={() => waehleAdresse(result)}
                >
                  {result.display_name}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <MapView isInterative={true} bind:marker bind:markerLocCor bind:markerAddress />
      {#if markerAddress}
        <p class="text-sm text-gray-300">
          📍 {markerAddress.road ?? ''} {markerAddress.house_number ?? ''}, {markerAddress.postcode ?? ''} {markerAddress.city ?? markerAddress.town ?? markerAddress.village ?? ''}
        </p>
      {:else if markerLocCor}
        <p class="text-sm text-gray-300">📍 {markerLocCor.lat.toFixed(5)}, {markerLocCor.lng.toFixed(5)}</p>
      {/if}
    </div>
  {:else if step === 3}
    <div class="space-y-4">
      <h3 class="text-2xl font-bold flex items-center gap-2">
        <i class="fa-solid fa-circle-check text-green-400"></i>
        Zusammenfassung
      </h3>
      <ul class="space-y-2 text-gray-200">
        <li><strong>Feuerwehr:</strong> {feuerwehrName || '–'}</li>
        <li><strong>Disponent:</strong> {dispatcherName || '–'}</li>
        <li><strong>Fahrzeuge:</strong> {cars.map((c) => c.name).join(', ') || '–'}</li>
        <li>
          <strong>Feuerwache:</strong>
          {#if markerLocCor}
            {markerLocCor.lat.toFixed(5)}, {markerLocCor.lng.toFixed(5)}
          {:else}
            – (kein Standort gewählt)
          {/if}
        </li>
      </ul>
    </div>
  {/if}

  <div class="flex justify-between pt-4">
    <Button color="light" on:click={zurueck} disabled={step === 0} class="gap-2">
      <i class="fa-solid fa-arrow-left"></i> Zurück
    </Button>

    {#if step < steps.length - 1}
      <Button color="red" on:click={weiter} class="gap-2">
        Weiter <i class="fa-solid fa-arrow-right"></i>
      </Button>
    {:else}
      <Button color="green" on:click={fertigstellen} disabled={isSaving} class="gap-2">
        <i class="fa-solid fa-floppy-disk"></i> Fertigstellen
      </Button>
    {/if}
  </div>

  {/if}
</main>
