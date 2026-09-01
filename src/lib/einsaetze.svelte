<script lang="ts">
    import { Button, Modal, Kbd } from 'flowbite-svelte';
    import { newMission, newMissionDialog } from '../stores/mission.store';
    import NewMissonDialog from './newMissonDialog.svelte';
    import MapView from "$lib/map.svelte";
    import EinsatzDetail from '$lib/einsatzDetail.svelte';
    import { startAlarm, rollcallPager } from '../untils/PagerUtlis';
    import { onMount } from 'svelte';
  
    let missionen: any[] = [];
    let lastUpdate: any = null;
  
    let selectedMission = null;
    let showMissionModal = false;

    // Vollbild-Ansicht statt normalem Modal
    let modalGross = false;
  
    let FEUERWACHE: { lat: number; lng: number } | null = null;
  
    // Karten-Marker für Hauptkarte
    $: markerCoordinates = missionen
      .filter(m => m.lat != null && m.lng != null)
      .map(m => ({
        lat: Number(m.lat),
        lng: Number(m.lng),
        label: m.mission_mark + ' ' + m.mission_des
      }));
  
    onMount(() => {
      ladeEinstellungen();
      ladeMissionen();
      const intervall = setInterval(ladeMissionen, 5000);
      return () => clearInterval(intervall);
    });

    async function ladeEinstellungen() {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.stationLat != null && data.stationLng != null) {
        FEUERWACHE = { lat: data.stationLat, lng: data.stationLng };
      }
    }
  
    async function ladeMissionen() {
      try {
        const res = await fetch('/api/missions');
        const alleMissionen = await res.json();

        lastUpdate = Date.now();
        const aktuelleAktive = alleMissionen.filter((m: any) => m.isDone === 0);

        // Prüfen, ob sich der Inhalt von 'missionen' wirklich geändert hat (z. B. IDs & Koordinaten)
        const bisherigeData = JSON.stringify(missionen.map(m => ({ id: m.id, lat: m.lat, lng: m.lng })));
        const neueData = JSON.stringify(aktuelleAktive.map(m => ({ id: m.id, lat: m.lat, lng: m.lng })));

        // Nur neu zuweisen, wenn sich Einsätze geändert haben oder ein neuer dazugekommen ist!
        if (bisherigeData !== neueData) {
          missionen = aktuelleAktive;
        }
      } catch (error) {
        console.error('Fehler beim Laden der Missionen', error);
      }
} 
  
    function testAlarm() {
      const allPager = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const payload = {
        nodeIds: allPager,
        msg: 'Probealarm für Alle'
      };
      startAlarm(payload.nodeIds, payload.msg);
    }

    function einsatzOeffnen(m: any) {
      selectedMission = m;
      showMissionModal = true;
      modalGross = false; // immer in normaler Größe starten
    }

    function einsatzSchliessen() {
      showMissionModal = false;
      modalGross = false;
    }
  
    async function markMissionDone(id) {
      const res = await fetch('/api/mission-done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
  
      const data = await res.json();
      if (data.success) {
        einsatzSchliessen();
        await ladeMissionen();
      } else {
        alert('Fehler beim Aktualisieren!');
      }
    }
  </script>
  
  <!-- Layout -->
   <div class="text-center text-4xl m-5 font-bold">Leitstelle</div>
  <div class="flex flex-row gap-4 p-4">
    <div class="basis-1/3">
      <div class="title">Einsätze</div>
  
      <div class="buttons">
        <Button on:click={() => ($newMissionDialog = true)}>Neuer Einsatz</Button>
        <!--<Button on:click={() => testAlarm()}>Probealarm</Button>-->
      </div>
  
      <div class="section-title">Aktuell:</div>
      <div class="CM">
        <div id="content">
          {#each missionen as m (m.id)}
          <div class="einsatz mb-4 bg-gray-500 p-4 rounded shadow relative">
            <!-- Button oben rechts -->
            <Button
              size="xs"
              on:click={() => einsatzOeffnen(m)}
              class="absolute top-2 right-2"
              color="dark"
            >
              Details
            </Button>
          
            <!-- Mission Info -->
            <h2 class="text-xl font-semibold">{m.mission_mark} – {m.mission_des}</h2>
            <p><strong>Ort:</strong> {m.locString}</p>
            <div class="flex gap-2 items-center">
              <strong>Zeit:</strong>
              <p>{new Date(Number(m.time)).toLocaleString()}</p>
            </div>
          </div>
          {/each}
        </div>
      </div>
  
      <div class="spacer"></div>
      <small>Letztes Update: {new Date(lastUpdate).toLocaleTimeString()}</small>
    </div>
  
    <!-- Rechte Seite: Karte -->
    <div class="basis-2/3">
      <div class="min-h-[500px] mt-5">
        <div class="rounded shadow-lg h-full min-h-[500px] top-20">
          <MapView isInterative={false} {markerCoordinates} feuerwache={FEUERWACHE} />
        </div>
      </div>
    </div>
  </div>
  
  <!-- Neuer Einsatz -->
  <Modal title="Neuer Einsatz anlegen" bind:open={$newMissionDialog} class="p-5" size="lg">
    <NewMissonDialog />
  </Modal>

  <!-- Einsatzdetails: entweder normales Modal ODER Vollbild-Ansicht -->
  {#if showMissionModal}
    {#if modalGross}
      <!-- Vollbild-Ansicht (wie eine eigene Seite) -->
      <div class="fixed inset-0 z-[100] bg-gray-900 text-white overflow-y-auto">
        <div class="sticky top-0 z-10 flex items-center justify-between gap-4 bg-gray-900/95 backdrop-blur border-b border-gray-700 px-6 py-4">
          <h2 class="text-2xl font-bold">
            Einsatz: {selectedMission?.mission_mark ?? ''}
          </h2>
          <div class="flex items-center gap-2">
            <Button
              color="green"
              disabled={!selectedMission}
              on:click={() => selectedMission && markMissionDone(selectedMission.id)}
            >
              Erledigt
            </Button>
            <Button size="sm" color="light" on:click={() => (modalGross = false)}>
              Verkleinern
            </Button>
            <Button size="sm" color="light" on:click={einsatzSchliessen}>
              Schließen
            </Button>
          </div>
        </div>

        <div class="max-w-5xl mx-auto p-6">
          <EinsatzDetail mission={selectedMission} />
        </div>
      </div>
    {:else}
      <!-- Normales Modal -->
      <Modal
        title={`Einsatz: ${selectedMission?.mission_mark ?? ''}`}
        bind:open={showMissionModal}
        class="modal-bg w-full max-w-3xl"
        autoclose={false}
      >
        <div class="flex justify-end -mt-2 mb-2">
          <Button size="xs" color="light" on:click={() => (modalGross = true)}>
            Vergrößern
          </Button>
        </div>

        {#if selectedMission}
          <EinsatzDetail mission={selectedMission} light={true} />
        {:else}
          <p class="p-4 text-gray-500">Keine Mission ausgewählt.</p>
        {/if}

        <svelte:fragment slot="footer">
          <Button
            color="green"
            disabled={!selectedMission}
            on:click={() => selectedMission && markMissionDone(selectedMission.id)}>
            Erledigt
          </Button>
          <Button color="light" on:click={einsatzSchliessen}>Schließen</Button>
        </svelte:fragment>
      </Modal>
    {/if}
  {/if}
  
  <style lang="scss">
    // :global() ist hier nötig, weil diese Klasse als Prop an die Flowbite-Modal-Komponente
    // durchgereicht wird – Svelte scoped die Klasse sonst nur für Elemente im eigenen Template
    // und wendet sie nie tatsächlich an. Modal bleibt hell (Flowbite-Standard); die dunkel
    // gestalteten Texte in EinsatzDetail bekommen dafür über die "light"-Variante schwarze
    // Textfarben, siehe einsatzDetail.svelte.
    :global(.modal-bg) {
      border: 1px solid rgba(0, 0, 0, 0.08);
    }
  .container {
    padding: 20px;
    font-family: sans-serif;
    max-width: 100%;
  }
  
  .title {
    font-size: 2em;
    font-weight: bold;
    margin-bottom: 20px;
  }
  
  .buttons {
    display: flex;
    gap: 20px;
    margin-bottom: 40px;
    flex-wrap: wrap;
  }
  
  .section-title {
    font-size: 1.5em;
    font-weight: bold;
    margin-top: 30px;
    margin-bottom: 10px;
  }
  
  .spacer {
    height: 40px;
  }
  
  .CM {
    margin: 15px 0;
  }
  </style>