<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Button, Select } from 'flowbite-svelte';
  import { rollcallPager, stopAlarm, startAlarm, triggerSerialPager } from '../../untils/PagerUtlis';

  let pagerList: any[] = [];
  let alarmSound = 'ClockenSpielGong';
  let currentAudio: HTMLAudioElement | null = null;
  let isPlaying = false;
  let isLoading = true;
  let newCarName = '';
  let cars;
  let pagerInputs: Record<number, string> = {};
  let pagerSaveStatus: Record<number, string | null> = {};


  let lastUpdateTime: Date | null = null;
  let updateInterval: any;

  let fdpPos;

  // USB-Pager-Modul (serielle Verbindung)
  let pagerSerialConfig = {
    port: '',
    baudRate: 115200,
    delayMs: 200,
    messageTemplate: 'pager:{id}',
    lineEnding: '\n'
  };
  let availablePorts: { path: string }[] = [];
  let manualPort = '';
  let isLoadingPorts = true;
  let portsError: string | null = null;
  let isSavingPagerConfig = false;
  let pagerConfigStatus: string | null = null;
  let isTestingSerialPager = false;
  let serialTestStatus: string | null = null;

  // Dropdown-Auswahl ins Textfeld übernehmen, damit beide Wege (Liste / manuell) synchron bleiben
  $: if (pagerSerialConfig.port) manualPort = pagerSerialConfig.port;




  import ClockenSpielGong from "../../assets/alarmssound/ClockenSpielGong.mp3";
  import feuerwehr_gong from "../../assets/alarmssound/feuerwehr_gong.mp3";
  import brandmelder_2 from "../../assets/alarmssound/brandmelder_2.mp3";
  import p8gr_alarmton_25 from "../../assets/alarmssound/p8gr_alarmton_25.mp3";


  const sounds = [
    { label: 'ClockenSpiel Gong', value: 'ClockenSpielGong' },
    { label: 'Feuerwehr Gong', value: 'feuerwehr_gong' },
    { label: 'Brandmelder 2', value: 'brandmelder_2' },
    { label: 'P8gr Alarmton', value: 'p8gr_alarmton_25' }
  ];

  function neuesFensterOeffnen() {
      const fenster = window.open('/Monitor', '_blank', 'width=600,height=400');
    }



  function testAlarm(nodeId: number) {
    const pager = [nodeId];
    const payload = {
      nodeIds: pager,
      msg: `Probealarm für ${nodeId}`,
    };
    startAlarm(payload.nodeIds, payload.msg);
    setTimeout(() => stopAlarm(payload.nodeIds), 10000);
  }


  async function save() {
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alarmSound })
  });
}

async function loadCars() {
  const response = await fetch('/api/cars');
  cars = await response.json();

  const updated = { ...pagerInputs };
  for (const car of cars) {
    if (updated[car.id] === undefined) {
      let ids: number[] = [];
      try {
        ids = car.pager ? JSON.parse(car.pager) : [];
      } catch {
        ids = [];
      }
      updated[car.id] = ids.join(', ');
    }
  }
  pagerInputs = updated;
}

function parsePagerInput(value: string): number[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 998);
}

async function saveCarPager(car: { id: number }) {
  const pager = parsePagerInput(pagerInputs[car.id] ?? '');
  pagerSaveStatus = { ...pagerSaveStatus, [car.id]: 'Speichere…' };
  try {
    const res = await fetch('/api/update-cars-pager', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ id: car.id, pager }])
    });
    pagerSaveStatus = { ...pagerSaveStatus, [car.id]: res.ok ? 'Gespeichert' : 'Fehler' };
  } catch (err) {
    console.error('Fehler beim Speichern der Pager-Zuordnung:', err);
    pagerSaveStatus = { ...pagerSaveStatus, [car.id]: 'Fehler' };
  } finally {
    setTimeout(() => {
      pagerSaveStatus = { ...pagerSaveStatus, [car.id]: null };
    }, 3000);
  }
}

function toggleAudio() {
  if (isPlaying && currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    isPlaying = false;
    return;
  }

  let audioPath: string;

  switch (alarmSound) {
    case 'feuerwehr_gong':
      audioPath = feuerwehr_gong;
      break;
    case 'brandmelder_2':
      audioPath = brandmelder_2;
      break;
    case 'p8gr_alarmton_25':
      audioPath = p8gr_alarmton_25;
      break;
    case 'ClockenSpielGong':
    default:
      audioPath = ClockenSpielGong;
  }

  currentAudio = new Audio(audioPath);
  currentAudio.volume = 1.0;
  currentAudio.play();
  isPlaying = true;

  currentAudio.onended = () => {
    isPlaying = false;
  };
}

async function addNewCar() {
  const res = await fetch('/api/addCar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newCarName })
  });

  if (!res.ok) {
    const errorText = await res.text(); // Nicht JSON, also text lesen!
    console.error('❌ Fehler beim API-Call:', errorText);
    return;
  }

  const data = await res.json();
  console.log('✅ Erfolgreich:', data);
  loadCars();
  newCarName = "";
}

async function removeCar(name: string) {
  const res = await fetch('/api/cars', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });

  const data = await res.json();
  if (data.success) {
    console.log('🚗 Fahrzeug erfolgreich gelöscht!');
    loadCars();
  } else {
    console.error('❌ Fehler beim Löschen:', data.error);
  }
}


async function loadPagerList() {
  const result = await rollcallPager();
  if (result?.pager) {
    pagerList = result.pager;
    isLoading = false;
    lastUpdateTime = new Date(); // 👈 hier wird das letzte Update gespeichert
  }
}

async function loadPagerSerialConfig() {
  isLoadingPorts = true;
  portsError = null;
  try {
    const res = await fetch('/api/pager/serial');
    const data = await res.json();
    pagerSerialConfig = data.config;
    availablePorts = data.availablePorts ?? [];
    portsError = data.portsError ?? null;
    manualPort = pagerSerialConfig.port;
  } catch (err) {
    console.warn('Fehler beim Laden der Pager-Modul-Konfiguration:', err);
    portsError = err instanceof Error ? err.message : String(err);
  } finally {
    isLoadingPorts = false;
  }
}

async function savePagerSerialConfigSettings() {
  isSavingPagerConfig = true;
  pagerConfigStatus = null;
  try {
    pagerSerialConfig.port = manualPort;
    const res = await fetch('/api/pager/serial', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pagerSerialConfig)
    });
    const data = await res.json();
    if (data.success) {
      pagerSerialConfig = data.config;
      pagerConfigStatus = '✅ Gespeichert';
    } else {
      pagerConfigStatus = `❌ Fehler: ${data.error}`;
    }
  } catch (err) {
    pagerConfigStatus = `❌ Fehler: ${err}`;
  } finally {
    isSavingPagerConfig = false;
    setTimeout(() => (pagerConfigStatus = null), 4000);
  }
}

async function testSerialPagerModule() {
  isTestingSerialPager = true;
  serialTestStatus = null;
  const result = await triggerSerialPager([1]);
  serialTestStatus = result?.success
    ? '✅ Befehl gesendet'
    : `❌ Fehler: ${result?.error ?? 'unbekannt'}`;
  isTestingSerialPager = false;
  setTimeout(() => (serialTestStatus = null), 5000);
}

async function loadSettings() {
  const res = await fetch('/api/settings');
  const data = await res.json();
  alarmSound = data.alarmSound;
}

  onMount(async () => {
    loadCars();
    loadSettings();
    loadPagerList(); // direkt einmal ausführen
    updateInterval = setInterval(loadPagerList, 20000); // alle 20 Sekunden wiederholen
    loadPagerSerialConfig();
  });


  onDestroy(() => {
  clearInterval(updateInterval);
});

</script>

<main class="p-6 max-w-3xl mx-auto text-white space-y-8">
  <h2 class="text-3xl font-extrabold">🛠️ Alarm Monitor Einstellungen</h2>

  <div class="flex flex-wrap gap-4 items-center">
    <Button color="red" on:click={neuesFensterOeffnen} class="flex items-center gap-2">
      <i class="fa-solid fa-display"></i>
      Alarm Monitor Öffnen
    </Button>
    <Button color="purple" on:click={() => goto('/setup')} class="flex items-center gap-2">
      <i class="fa-solid fa-wand-magic-sparkles"></i>
      Setup erneut ausführen
    </Button>
  </div>

  <!-- Sound Auswahl -->
  <div class="space-y-4">
    <h3 class="text-2xl font-bold flex items-center gap-2">
      <i class="fa-solid fa-volume-high text-blue-400"></i>
      Alarm-Ton auswählen
    </h3>
    <div class="felx">
      <i class="fa fa-info text-blue-400"></i>
      <small>Wenn neuer Alarm Sound ausgewählt wird dann muss der Alarmmonitor aktualisiert bzw. neue geladen werden.</small>
    </div>
    
    

    <div class="flex flex-wrap gap-4 items-center">
      <Select bind:value={alarmSound} class="px-4 py-2 rounded text-black focus:outline-none">
        {#each sounds as { label, value }}
          <option value={value}>{label}</option>
        {/each}
      </Select>

      <Button
      on:click={toggleAudio}
      color={isPlaying ? 'light' : 'green'}
      class="gap-2 w-32 justify-center"
    >
      <i class={`fa-solid ${isPlaying ? 'fa-pause' : 'fa-play'}`}></i>
      <span class="inline-block w-16 text-center">{isPlaying ? 'Stoppen' : 'Testen'}</span>
    </Button>
      <Button color="red" on:click={save} class="gap-2">
        <i class="fa-solid fa-floppy-disk text-green-300"></i> Einstellungen speichern
      </Button>
    </div>
  </div>

  <!-- Pager -->
  <div>
    <h3 class="text-xl font-bold mb-4">📡 Pager Übersicht</h3>
  
    {#if isLoading}
      <div class="flex justify-center items-center my-8">
        <i class="fa-solid fa-spinner fa-spin text-3xl text-blue-400"></i>
        <span class="ml-3">Pager werden geladen...</span>
      </div>
    {:else}
      {#if pagerList.length === 0}
        <p class="text-gray-400 italic">Keine Pager gefunden.</p>
      {:else}
        <ul class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each pagerList as [nodeId, pager]}
            <li class="flex justify-between items-center bg-gray-600 px-4 py-3 rounded shadow">
              <span>
                <strong>{nodeId}</strong>
                <strong>{pager.nodeName}</strong>
                <br>
                  ID: <code>{pager.generatedId}</code>
              </span>
              <Button on:click={() => testAlarm(nodeId)} color="dark" class="gap-1">
                <i class="fa-solid fa-bolt"></i> Test
              </Button>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
    <p class="text-sm text-gray-400 mt-2">
      Letzte Aktualisierung: 
      {#if lastUpdateTime}
        {lastUpdateTime.toLocaleTimeString( )}
      {:else}
        Wird geladen...
      {/if}
    </p>.
  </div>

  <!-- USB Pager Modul -->
  <div class="space-y-4">
    <h3 class="text-xl font-bold flex items-center gap-2">
      <i class="fa-solid fa-plug text-blue-400"></i>
      USB-Pager-Modul (seriell)
    </h3>
    <small class="text-gray-400 block">
      Wähle den Anschluss, an dem das USB-Funkmodul hängt. Steckst du das Modul erst jetzt an, klicke auf
      "Ports aktualisieren".
    </small>

    <div class="flex flex-wrap gap-4 items-end">
      <div>
        <label class="block text-sm mb-1" for="port-select">Erkannte Ports</label>
        <Select
          id="port-select"
          class="px-4 py-2 rounded text-black focus:outline-none min-w-[16rem]"
          bind:value={pagerSerialConfig.port}
        >
          {#if availablePorts.length === 0}
            <option value="" disabled>Keine Ports gefunden</option>
          {/if}
          {#each availablePorts as p}
            <option value={p.path}>{p.path}</option>
          {/each}
        </Select>
      </div>

      <Button color="light" on:click={loadPagerSerialConfig} disabled={isLoadingPorts} class="gap-2">
        <i class={`fa-solid fa-rotate ${isLoadingPorts ? 'fa-spin' : ''}`}></i> Ports aktualisieren
      </Button>
    </div>

    {#if portsError}
      <p class="text-sm text-red-400">
        ⚠️ Ports konnten nicht ausgelesen werden: {portsError}
      </p>
    {/if}

    <div>
      <label class="block text-sm mb-1" for="manual-port">Oder Pfad manuell eingeben</label>
      <input
        id="manual-port"
        bind:value={manualPort}
        placeholder="z. B. /dev/tty.usbserial-0001 oder COM3"
        class="px-4 py-2 rounded text-black w-full max-w-md"
      />
    </div>

    <div class="flex flex-wrap gap-4">
      <div>
        <label class="block text-sm mb-1" for="baud-rate">Baudrate</label>
        <input id="baud-rate" type="number" bind:value={pagerSerialConfig.baudRate} class="px-4 py-2 rounded text-black w-32" />
      </div>
      <div>
        <label class="block text-sm mb-1" for="delay-ms">Delay zwischen Pagern (ms)</label>
        <input id="delay-ms" type="number" bind:value={pagerSerialConfig.delayMs} class="px-4 py-2 rounded text-black w-32" />
      </div>
      <div>
        <label class="block text-sm mb-1" for="msg-template">Nachrichtenformat</label>
        <input
          id="msg-template"
          bind:value={pagerSerialConfig.messageTemplate}
          placeholder="pager:{'{id}'}"
          class="px-4 py-2 rounded text-black w-48"
        />
      </div>
    </div>

    <div class="flex flex-wrap gap-4 items-center">
      <Button color="red" on:click={savePagerSerialConfigSettings} disabled={isSavingPagerConfig} class="gap-2">
        <i class="fa-solid fa-floppy-disk text-green-300"></i> Speichern
      </Button>
      <Button color="dark" on:click={testSerialPagerModule} disabled={isTestingSerialPager} class="gap-2">
        <i class="fa-solid fa-bolt"></i> Test senden
      </Button>
      {#if pagerConfigStatus}<span class="text-sm">{pagerConfigStatus}</span>{/if}
      {#if serialTestStatus}<span class="text-sm">{serialTestStatus}</span>{/if}
    </div>
  </div>

<!--Cars-->
  <div class="mt-8 space-y-3">
    <h3 class="text-xl font-bold">🚗 Fahrzeuge </h3>
    <p class="text-gray-400 text-sm">
      Melder-Nummer(n) des FirePager-Gateways je Fahrzeug (1–998, mehrere durch Komma getrennt, z. B. 1, 2). Wird beim Alarmieren des Fahrzeugs automatisch ausgelöst.
    </p>

    <div class="space-y-2">
      {#if cars}
        {#each cars as car (car.id)}
          <div class="flex flex-wrap items-center gap-3 bg-gray-700/40 rounded-lg px-3 py-2">
            <span class="font-semibold w-28 truncate">{car.name}</span>
            <input
              type="text"
              placeholder="z. B. 1"
              bind:value={pagerInputs[car.id]}
              on:blur={() => saveCarPager(car)}
              class="rounded-lg p-2 text-sm text-black w-32"
            />
            {#if pagerSaveStatus[car.id]}
              <span class="text-xs text-gray-300">{pagerSaveStatus[car.id]}</span>
            {/if}
            <a
              on:click={removeCar(car.name.toString())}
              class="ml-auto text-sm cursor-pointer"
              style="color: #ff0000;"
            >
              Entfernen
            </a>
          </div>
        {/each}
      {/if}
    </div>

    <div class="flex gap-3 items-center">
      <input
        bind:value={newCarName}
        placeholder="Fahrzeugname z. B. TLF"
        class="px-4 py-2 rounded text-black w-full"
      />
      <Button on:click={addNewCar} color="blue" class="gap-2">
        <i class="fa-solid fa-plus"></i> Hinzufügen
      </Button>
    </div>
  </div>
</main>

