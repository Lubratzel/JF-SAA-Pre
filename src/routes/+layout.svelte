

<script>
    import "../app.css";
    import Navbar from "$lib/navbar.svelte";
    import Einsaetze from "$lib/einsaetze.svelte";
    import { page } from '$app/stores';

    export let data;

    $: aktuellerPfad = $page.url.pathname;

    $: istMonitorSeite = aktuellerPfad.startsWith('/Monitor');
    $: istSetupSeite = aktuellerPfad.startsWith('/setup');

  </script>

  <svelte:head>
      <title>{data.feuerwehrName ?? 'SSA-JungenFeuerwehr'}</title>
  </svelte:head>

  <main>
      {#if !istMonitorSeite && !istSetupSeite}
          <Navbar name={data.feuerwehrName} />
      {/if}
      <div class="content">
        <slot></slot>
      </div>
  </main>
  
  <style>
      main {
          display: flex;
          height: 100vh;
            overflow: hidden;
        font-family: sans-serif;
      }
  
      .content {
          flex: 1;
          overflow-y: auto;
      }
  </style>
  