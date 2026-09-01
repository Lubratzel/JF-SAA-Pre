<script lang="ts">
    import {Button, Label, Input, Dropdown, Tooltip, Checkbox, Helper, Search, Radio, Modal, MultiSelect, StepIndicator  } from 'flowbite-svelte';
    import {newMission} from '../stores/mission.store';
    import {newMissionDialog} from '../stores/mission.store';
    import Map from "$lib/map.svelte";
    import type {Mission} from "../interface/mission";
    import {formatAddress} from '../untils/MissionUtils';
    import alarmstichworte_RLP_24 from '../assets/alarmstichworte_RLP_24.json';
    import type { LngLat } from 'maplibre-gl';
    import tooltipContent from '../assets/tooltipContent.json';
    import { onMount } from 'svelte';
  

    interface alarmstichwort {
        alarmLevel: string;
        keywords: string;
        MessageScreen: string;
        checked: boolean;
    }

    const alarmstichwortelist: alarmstichwort[] = alarmstichworte_RLP_24;

    let searchTerm = ''
    let selectedItem: null = null;
    let isInterative = true

    $: filteredItems = alarmstichwortelist.filter((alarmstichwort) => {
        const level = String(alarmstichwort.alarmLevel).toLowerCase();
        const keywords = String(alarmstichwort.keywords).toLowerCase();
        const search = searchTerm.toLowerCase();
        
        return level.includes(search) || keywords.includes(search);
    });


    let alarmTime = '';
    let immediateAlarm = false;
    let showWaring = false;
    let newAddress = "";



    let currentStep = 1;
    let steps = ['', '', ''];
    let nextButtonText = 'Weiter'



    let adresse: string | null = null;
    let markerLocCor: { lat: number; lng: number } | null = null;
    let marker: { lngLat: { lat: number; lng: number } } | null = null;

    let addressQuery = '';
    let addressSuggestions: any[] = [];
    let isSearchingAddress = false;
    let showAddressSuggestions = false;
    let addressSearchTimeout: ReturnType<typeof setTimeout>;

    let new_mission: Mission = {
        pre_alarm: false,
        mission_mark: "",
        mission_des: "",
        cars: [],
        loc: "",
        isCustomLoc: false,
        locCor: null,
        time: "",
        immediateAlarm: false

    };

    async function addToArray() {
    $newMissionDialog= false;
    showWaring = false;
    let aktuelleAdresse;
    let isCustomLoc;

    if (newAddress){
        aktuelleAdresse = newAddress;
        isCustomLoc = true;
    } else {
        aktuelleAdresse = adresse;
        isCustomLoc = false;
    }

    const newEntry = {
        pre_alarm: new_mission.pre_alarm,
        mission_mark: new_mission.mission_mark,
        mission_des: new_mission.mission_des,
        cars: new_mission.cars,
        locCor: markerLocCor,
        loc: aktuelleAdresse,
        isCustomLoc: isCustomLoc,
        time: alarmTime,
        immediateAlarm: immediateAlarm
    };

    if (immediateAlarm){
        newEntry.time =  String(Date.now())

    }else{
        newEntry.time = alarmTime;
    }

    console.log(newEntry)

    $newMission = [...$newMission, newEntry];
    let place

    if(isCustomLoc){
        place = newAddress; 
    }else{
        place = String(formatAddress(newEntry.loc))
    }

    try {
        const response = await fetch('/api/missions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mission_mark: newEntry.mission_mark,
                mission_des: newEntry.mission_des,
                locString: place,
                locCor: newEntry.locCor,
                time: newEntry.time,
                immediateAlarm: newEntry.immediateAlarm,
                isDone: false,
                lat: String(newEntry.locCor?.lat),
                lng: String(newEntry.locCor?.lng),
                cars: JSON.stringify(newEntry.cars)
            })
        });

        // Die Melder werden serverseitig ausgelöst (siehe /api/missions), sobald der Einsatz angelegt ist.

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Fehler beim Speichern');
        }


    } catch (err) {
        console.error('Fehler beim Speichern:', err);
        alert('Fehler beim Speichern der Mission');
    }
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

            // Vorschläge in der Nähe der Feuerwache (bzw. des bereits gesetzten
            // Markers) bevorzugen, ohne andere Ergebnisse auszuschließen
            const bias = markerLocCor ?? FEUERWACHE;
            if (bias) {
                const delta = 0.35;
                params.set(
                    'viewbox',
                    [bias.lng - delta, bias.lat + delta, bias.lng + delta, bias.lat - delta].join(',')
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
        adresse = result.address ?? null;
        addressQuery = result.display_name;
        addressSuggestions = [];
        showAddressSuggestions = false;
    }

    function confirmNextStep() {
        if (currentStep < 3) {
            currentStep++;
            if (currentStep === 3) {
                nextButtonText = 'Erstellen';
            }
        } else {
            checkNewMission();
        }
    }

    function checkNewMission(){
        if (immediateAlarm){
            showWaring = true;
        }else{
            addToArray()
        }
    }

    function goback() {
        currentStep--;
        nextButtonText = 'Weiter';
    }

    function handleClick(alarmstichwort: any) {
        filteredItems = filteredItems.map(item => ({
            ...item,
            checked: item === alarmstichwort
        }));
        new_mission.mission_mark = alarmstichwort.alarmLevel;
        selectedItem = alarmstichwort.alarmLevel;
        new_mission.mission_des = alarmstichwort.keywords;
        searchTerm = '';
    }

    function toggleSchedule() {
        immediateAlarm = !immediateAlarm;
        if (immediateAlarm) {
            alarmTime = ''; 
        }
    }

    let cars: any[] = [];
    let allCarObjects: any = [];
    let busyCarNames: string[] = [];
    let FEUERWACHE: { lat: number; lng: number } | null = null;

onMount(async () => {
  try {
    // 0. Feuerwache laden, damit die Karte darauf zentriert startet
    const resSettings = await fetch('/api/settings');
    const settingsData = await resSettings.json();
    if (settingsData.stationLat != null && settingsData.stationLng != null) {
      FEUERWACHE = { lat: settingsData.stationLat, lng: settingsData.stationLng };
    }

    // 1. Alle Fahrzeuge laden
    const resCars = await fetch('/api/cars');
    allCarObjects = await resCars.json();
    cars = allCarObjects.map((car: { name: any }) => car.name);

    // 2. Aktive Einsätze laden
    const resMissions = await fetch('/api/missions');
    const allMissions = await resMissions.json();
    
    // Nur nicht-erledigte Einsätze filtern
    const activeMissions = allMissions.filter((m: any) => m.isDone === 0);

    // Alle Fahrzeugnamen sammeln, die in aktiven Einsätzen gebunden sind
    const busy = new Set<string>();
    for (const mission of activeMissions) {
      if (mission.cars) {
        try {
          // Falls cars als JSON-String in der DB liegt (z.B. '["TLF","LF"]')
          const parsed = typeof mission.cars === 'string' ? JSON.parse(mission.cars) : mission.cars;
          if (Array.isArray(parsed)) {
            parsed.forEach((carName: string) => busy.add(carName));
          }
        } catch (e) {
          console.error("Fehler beim Parsen der Fahrzeugliste", e);
        }
      }
    }
    busyCarNames = Array.from(busy);
  } catch (err) {
    console.error("Fehler beim Laden der Fahrzeugdaten", err);
  }
});

</script>


<StepIndicator {currentStep} {steps}/>

{#if currentStep === 1}
    <div class="flex place-items-center">
        <h3>Alarm Art:</h3>
        <i class="fa-solid fa-circle-question ml-2.5"></i>
        <Tooltip>{tooltipContent.alarmArt}</Tooltip>
    </div>

    <div class="flex space-x-4">

        <Radio name="example" bind:group={new_mission.pre_alarm} value={false}>Normaler Alarm</Radio>

        <Radio name="example" bind:group={new_mission.pre_alarm} value={true}>Voralarm</Radio>


    </div>
    <h3>Einsatz Kennzeichnung:</h3>

    <div class="flex">
        <Search
                class="dots-menu"
                bind:value={searchTerm}
                placeholder={selectedItem ? `Ausgewählt: ${selectedItem}` : 'Suche...'}
        />
    </div>

    <Dropdown triggeredBy=".dots-menu" class="overflow-y-auto px-3 pb-3 text-sm h-44 w-full">
        {#each filteredItems as alarmstichwort (alarmstichwort.alarmLevel)}
            <li
                    class="rounded p-2 hover:bg-gray-100 dark:hover:bg-gray-600"
                    on:click={() => handleClick(alarmstichwort)}
            >
                <Checkbox bind:checked={alarmstichwort.checked}>{alarmstichwort.alarmLevel}</Checkbox>
                <Helper class="ps-6">{alarmstichwort.keywords}</Helper>
            </li>
        {/each}
    </Dropdown>


    <h3>Einsatz Beschreibung:</h3>
    <Input
            id="mission-des"
            placeholder="z.B.: Kleinbrand"
            bind:value={new_mission.mission_des}
    />

   <h3>Fahrzeuge:</h3>
<Label>
  <div class="flex flex-wrap gap-3">
    {#each allCarObjects as car (car.id || car.name)}
      {@const isBusy = car.isAvailable === 0}

      <div class="flex items-center gap-2 p-2 rounded border border-gray-700 {isBusy ? 'opacity-50 bg-gray-800' : 'bg-gray-700'}">
        <Checkbox
          disabled={isBusy}
          checked={new_mission.cars.includes(car.name)}
          on:change={() => {
            if (new_mission.cars.includes(car.name)) {
              new_mission.cars = new_mission.cars.filter(name => name !== car.name);
            } else {
              new_mission.cars = [...new_mission.cars, car.name];
            }
          }}
        >
          <span class="font-semibold {isBusy ? 'line-through text-gray-400' : 'text-white'}">
            {car.name}
          </span>
        </Checkbox>

        {#if isBusy}
          <span class="text-xs bg-red-900 text-red-300 px-1.5 py-0.5 rounded">Einsatz</span>
        {:else}
          <span class="text-xs bg-green-900 text-green-300 px-1.5 py-0.5 rounded">Frei</span>
        {/if}
      </div>
    {/each}
  </div>
</Label>

{:else if currentStep === 2}
    <div class="relative mb-3">
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
    <Map {isInterative} feuerwache={FEUERWACHE} bind:marker bind:markerAddress={adresse} bind:markerLocCor={markerLocCor}/>
    {#if (adresse)}
        <div class="flex items-center gap-2">
            <p>Adresse:</p>
            <Input bind:value={newAddress} placeholder={formatAddress(adresse)}/>
            <i class="fa-regular fa-pen-to-square"></i>
        </div>
    {/if}

    {:else if currentStep === 3}
        <div class="flex flex-col gap-4">
            <h3>Alarm-Einstellungen</h3>
                <Checkbox  bind:checked={immediateAlarm} on:click={toggleSchedule()}>Sofort Auslösen?</Checkbox>
            {#if !immediateAlarm}
                <div>
                    <label for="alarm-time">Wähle die Uhrzeit für die Auslösung:</label>
                    <Input
                            type="time"
                            id="alarm-time"
                            bind:value={alarmTime}
                            placeholder="HH:MM"
                            required
                    />
                </div>
            {/if}

            <p>
                {immediateAlarm
                    ? 'Der Alarm wird sofort ausgelöst.'
                    : alarmTime
                        ? `Der Alarm wird um ${alarmTime} ausgelöst.`
                        : 'Bitte wähle eine Uhrzeit aus.'}
            </p>
        </div>
    {/if}


{#if currentStep > 1 }
    <Button on:click="{goback}">Zurück</Button>
{/if}

<Button on:click="{confirmNextStep}">{nextButtonText}</Button>




<Modal bind:open={showWaring} size="xs">
    <div class="text-center">
        <i class="fa-solid fa-circle-exclamation fa-2xl" style="color: #FFD43B;"></i>
        <h3 class="mb-5 text-lg font-normal text-gray-500 dark:text-gray-400">
            Wollen Sie wirklich, dass der Alarm sofort ausgeführt wird?
        </h3>
        <Button color="red" class="me-2" on:click={addToArray}>Ja</Button>
        <Button color="alternative">Abbrechen</Button>
    </div>
</Modal>
<style lang="scss">


</style>