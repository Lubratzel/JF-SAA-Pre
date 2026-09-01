<script lang="ts">
    import { formatAddress, type Address } from '../untils/MissionUtils';
    import { Card } from 'flowbite-svelte';
    import {onDestroy} from "svelte";
    export let mDes;
    export let mMark;
    export let pre_alarm;
    export let loc;
    export let isCustomLoc;
    export let time;
    export let immediateAlarm = false; // Neue Eigenschaft für sofortigen Alarm

    let elapsedTime = 0; // Zeit, die seit Auslösung des Alarms vergangen ist
    let timerInterval: any;

    // Starte den Timer, wenn der Alarm sofort ausgelöst wird
    if (immediateAlarm) {
        startTimer();
    }

    // Funktion zum Starten des Timers
    function startTimer() {
        if (timerInterval) return; // Verhindern, dass mehrere Intervalle gestartet werden

        timerInterval = setInterval(() => {
            elapsedTime += 1;
        }, 1000);
    }

    // Funktion zum Formatieren der Zeit (in Minuten und Sekunden)
    function formatElapsedTime(seconds: any) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    // Stoppe den Timer, wenn die Komponente zerstört wird
    onDestroy(() => {
        clearInterval(timerInterval);
    });
</script>

<!-- Card-Layout -->
<Card class="w-full {immediateAlarm ? 'bg-red-100' : ''}">
    <div class="flex justify-between">
        <h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{mMark} {mDes}</h5>
        <!-- Zeitanzeige (Aktuelle Uhrzeit oder Timer) -->
        {#if immediateAlarm}
            <strong>{formatElapsedTime(elapsedTime)}</strong>
        {:else}
            <strong>{time}</strong>
        {/if}
    </div>
    {#if (isCustomLoc)}
        <small class="font-normal text-gray-700 dark:text-gray-400 leading-tight">{loc}</small>
    {:else }
    <small class="font-normal text-gray-700 dark:text-gray-400 leading-tight">{formatAddress(loc)}</small>
    {/if}
    <!-- Fahrzeuge-Icons -->

</Card>

<style lang="scss">
  .icons {
    margin-top: 20px;
    display: flex;
    justify-content: center;
    width: 100%;
  }

  .icon {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 5px;
  }

  .icon img {
    width: 40px;
    height: 40px;
  }

 
  .bg-red-500 {
    background-color: #fff0f0;
    color: white;
  }
</style>
