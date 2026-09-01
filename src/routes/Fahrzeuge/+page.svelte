<script lang="ts">
  import type { PageData } from "./$types";
  import { onMount } from "svelte";
  import { Card, Button, Input, Modal, Badge } from 'flowbite-svelte';

  export let data: PageData;

  interface MissionInfo {
    id: number;
    mission_mark: string;
    mission_des: string;
    locString: string;
    time: string;
  }

  interface CarView {
    id: number;
    name: string;
    isAvailable?: number; // 1 = Frei, 0 = Belegt/Einsatz
    status?: string;
    currentMission?: MissionInfo | null;
    pagerArray: number[];
  }

  let editedCars: CarView[] = [];
  let newCarName = '';
  let showAddCarModal = false;

  async function loadCarsData() {
    try {
      // 1. Fahrzeuge und aktive Einsätze parallel abfragen
      const [resCars, resMissions] = await Promise.all([
        fetch('/api/cars'),
        fetch('/api/missions')
      ]);

      const cars = await resCars.json();
      const allMissions = await resMissions.json();

      // Nur noch laufende Einsätze (nicht erledigt)
      const activeMissions = allMissions.filter((m: any) => m.isDone === 0 || m.isDone === false);

      editedCars = cars.map((car: any) => {
        // Suche den aktiven Einsatz, in dem dieses Fahrzeug alarmiert ist
        const matchingMission = activeMissions.find((m: any) => {
          if (!m.cars) return false;
          try {
            const carList = typeof m.cars === 'string' ? JSON.parse(m.cars) : m.cars;
            return Array.isArray(carList) && carList.includes(car.name);
          } catch (e) {
            return false;
          }
        });

        const isBusy = !!matchingMission || car.isAvailable === 0;

        return {
          id: car.id,
          name: car.name,
          isAvailable: isBusy ? 0 : 1,
          status: isBusy ? 'Im Einsatz' : 'Frei',
          currentMission: matchingMission
            ? {
                id: matchingMission.id,
                mission_mark: matchingMission.mission_mark,
                mission_des: matchingMission.mission_des,
                locString: matchingMission.locString,
                time: matchingMission.time
              }
            : null,
          pagerArray: car.pager ? JSON.parse(car.pager) : []
        };
      });
    } catch (e) {
      console.error('Fehler beim Laden der Fahrzeug- und Einsatzdaten', e);
    }
  }

  onMount(() => {
    loadCarsData();
  });

  async function addNewCar() {
    if (!newCarName.trim()) return;

    const res = await fetch('/api/addCar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCarName })
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('❌ Fehler beim API-Call:', errorText);
      return;
    }

    showAddCarModal = false;
    newCarName = "";
    await loadCarsData();
  }
</script>

<div class="p-6 sm:p-10 bg-gray-900 min-h-screen text-white">
  
  <div class="flex items-center justify-between mb-8">
    <h1 class="text-3xl font-extrabold">Fahrzeuge & Status-Übersicht</h1>
    
    <Button color="blue" on:click={() => (showAddCarModal = true)}>
      Fahrzeug hinzufügen
    </Button>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
    {#each editedCars as car (car.id || car.name)}
      {@const istFrei = car.isAvailable === 1}

      <Card 
        class="text-white  p-5 {istFrei ? 'bg-green-800' : 'bg-red-800'}"
      >
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-2xl font-bold">{car.name}</h2>
          
          {#if istFrei}
            <Badge color="green" class="text-sm font-semibold px-3 py-1">
              Frei
            </Badge>
          {:else}
            <Badge color="red" class="text-sm font-semibold px-3 py-1 animate-pulse">
              Im Einsatz
            </Badge>
          {/if}
        </div>

        <div class=" rounded-lg p-4 space-y-2 border border-gray-700/50">
          <div class="text-xs text-gray-400 font-semibold uppercase tracking-wider">Aktueller Status</div>
          
          {#if istFrei}
            <p class="text-sm text-gray-300">
              Einsatzbereit im Feuerwehrhaus
            </p>
          {:else}
            <p class="text-sm font-semibold text-red-400">
              Gebunden in Einsatz
            </p>

            {#if car.currentMission}
              <div class="mt-2 pt-2 border-t border-gray-700/60 space-y-1">
                <div class="text-sm font-bold text-white">
                  {car.currentMission.mission_mark} – {car.currentMission.mission_des}
                </div>
                {#if car.currentMission.locString}
                  <div class="text-xs text-gray-300">
                    Ort: {car.currentMission.locString}
                  </div>
                {/if}
                {#if car.currentMission.time}
                  <div class="text-xs text-gray-400">
                    Alarmzeit: {new Date(Number(car.currentMission.time)).toLocaleTimeString('de-DE')} Uhr
                  </div>
                {/if}
              </div>
            {/if}
          {/if}
        </div>
      </Card>
    {/each}
  </div>
</div>

<Modal title="Neues Fahrzeug hinzufügen" bind:open={showAddCarModal} size="sm" autoclose={false}>
  <div class="space-y-4">
    <label for="car-name-input" class="block text-sm font-bold">
      Fahrzeugname / Funkrufname
    </label>
    <Input
      id="car-name-input"
      bind:value={newCarName}
      placeholder="z. B. TLF 16/25"
      class="text-black"
    />
  </div>

  <svelte:fragment slot="footer">
    <Button color="green" on:click={addNewCar} disabled={!newCarName.trim()}>
      Hinzufügen
    </Button>
    <Button color="alternative" on:click={() => (showAddCarModal = false)}>
      Abbrechen
    </Button>
  </svelte:fragment>
</Modal>