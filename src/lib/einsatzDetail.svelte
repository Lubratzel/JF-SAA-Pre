<script lang="ts">
  import { onMount } from 'svelte';
  import { Kbd, Button } from 'flowbite-svelte';
  import MapView from '$lib/map.svelte';
  import alarmstichworte_RLP_24 from '../assets/alarmstichworte_RLP_24.json';
  import { speakPartFuerMark } from '$lib/missionSpeech';

  export let mission: any = null;
  // true = eingebettet in das normale (helle) Flowbite-Modal, false = dunkle Vollbild-Ansicht
  export let light: boolean = false;

  $: metaText = light ? 'text-gray-700' : 'text-gray-300';
  $: metaLabel = 'text-gray-500';
  $: titleText = light ? 'text-gray-900' : '';
  $: sectionBorder = light ? 'border-gray-300' : 'border-gray-700';
  $: cardClass = light
    ? 'bg-gray-100 border border-gray-300 rounded-lg p-4'
    : 'bg-gray-800/60 border border-gray-700 rounded-lg p-4';
  $: cardLabel = `text-xs font-semibold uppercase tracking-wide mb-2 ${light ? 'text-gray-500' : 'text-gray-400'}`;
  $: mutedText = light ? 'text-gray-600' : 'text-gray-400';
  $: pillContainerClass = light ? 'bg-gray-200' : 'bg-gray-700/50';
  $: pillInactiveClass = light ? 'text-gray-600 hover:text-black' : 'text-gray-300 hover:text-white';
  $: formContainerClass = light
    ? 'bg-gray-100 border border-gray-300 rounded-lg p-3'
    : 'bg-gray-700/30 rounded-lg p-3';
  $: formLabelClass = light ? 'text-gray-600' : 'text-gray-300';
  $: formInputClass = light
    ? 'w-full rounded-lg p-2 text-sm text-black border border-gray-300'
    : 'w-full rounded-lg p-2 text-sm text-black';
  $: toggleInactiveClass = light
    ? 'bg-gray-200 border-gray-300 text-gray-800 hover:bg-gray-300'
    : 'bg-gray-700/70 border-gray-600- text-white hover:bg-gray-600/70';
  $: totalValueClass = light ? 'text-gray-900' : 'text-white';

  // 📔 Einsatztagebuch: Notizen, Status- und Stärkemeldungen in einer gemeinsamen Zeitleiste
  const STATUS_OPTIONEN = [
    { value: '1', label: 'Status 1 – Einsatzbereit über Funk' },
    { value: '2', label: 'Status 2 – Einsatzbereit auf Wache' },
    { value: '3', label: 'Status 3 – Einsatzauftrag übernommen' },
    { value: '4', label: 'Status 4 – Am Einsatzort eingetroffen' },
    { value: '5', label: 'Status 5 – Sprechwunsch' },
    { value: '6', label: 'Status 6 – Nicht einsatzbereit' }
  ];

  let tagebuchEintraege: any[] = [];
  let tagebuchLaden = false;
  let eintragSpeichern = false;
  let eintragAutor = 'Disponent';
  let eintragTyp: 'notiz' | 'status' | 'staerke' = 'notiz';

  let neueNotizText = '';
  let statusAuswahl = STATUS_OPTIONEN[0].value;
  let staerkeFuehrung = 0;
  let staerkeUnterfuehrer = 0;
  let staerkeMannschaft = 0;
  $: staerkeGesamt = (Number(staerkeFuehrung) || 0) + (Number(staerkeUnterfuehrer) || 0) + (Number(staerkeMannschaft) || 0);

  // 🚒 Status und Stärkemeldung werden auf ein konkretes Fahrzeug des Einsatzes gemappt
  let einsatzFahrzeuge: string[] = [];
  let eintragFahrzeug = '';
  $: if (mission?.cars) {
    parseCars(mission.cars).then(list => {
      einsatzFahrzeuge = list;
      if (!list.includes(eintragFahrzeug)) eintragFahrzeug = '';
    });
  } else {
    einsatzFahrzeuge = [];
    eintragFahrzeug = '';
  }

  $: eintragGueltig =
    eintragTyp === 'notiz' ? neueNotizText.trim().length > 0 : eintragFahrzeug !== '';

  onMount(async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.dispatcherName) eintragAutor = data.dispatcherName;
    } catch (err) {
      console.error('Fehler beim Laden des Disponenten-Namens:', err);
    }
  });

  // 📣 Nachalarmierung: weitere Fahrzeuge zu diesem Einsatz rufen
  let alleCars: { name: string; isAvailable: number }[] = [];
  let ausgewaehlteCars: string[] = [];
  let fahrzeugeLaden = false;
  let nachalarmierenLaeuft = false;

  $: bereitsAlarmiert = (() => {
    try {
      return mission?.cars ? JSON.parse(mission.cars) : [];
    } catch {
      return [];
    }
  })();

  $: verfuegbareCars = alleCars.filter(
    c => c.isAvailable === 1 && !bereitsAlarmiert.includes(c.name)
  );

  // Einsatztagebuch automatisch (neu) laden, sobald sich der übergebene Einsatz ändert
  $: if (mission) {
    ladeTagebuch(mission.id);
    ladeVerfuegbareCars();
  }

  // 🔺 Einsatzstufe erhöhen (z. B. B1 -> B2): mögliche Ziele sind alle "Grundstufe"-Einträge
  // (Alarmlevel ohne Punkt, z. B. "B2") derselben Kategorie mit höherer Stufenzahl.
  let eskalationZiel = '';
  let eskalationStichwort = '';
  let letzteEskalationZiel = '';
  let eskalationMitFahrzeugen = false;
  let eskalationCars: string[] = [];
  let eskalationAnsagen = true;
  let eskalationZusatztext = '';
  let eskalationLaeuft = false;

  $: eskalationOptionen = (() => {
    const match = /^([A-Z]+)(\d+)/.exec(mission?.mission_mark ?? '');
    if (!match) return [];
    const [, buchstabe, zahlStr] = match;
    const aktuelleZahl = Number(zahlStr);
    const stufenMuster = new RegExp(`^${buchstabe}(\\d+)$`);

    return (alarmstichworte_RLP_24 as { alarmLevel: string; keywords: string }[])
      .filter((a) => {
        const treffer = stufenMuster.exec(a.alarmLevel);
        return treffer !== null && Number(treffer[1]) > aktuelleZahl;
      })
      .sort((a, b) => Number(a.alarmLevel.slice(buchstabe.length)) - Number(b.alarmLevel.slice(buchstabe.length)));
  })();

  $: if (mission && !eskalationOptionen.some((o) => o.alarmLevel === eskalationZiel)) {
    eskalationZiel = eskalationOptionen[0]?.alarmLevel ?? '';
  }

  // Stichwort-Vorschlag nur bei Wechsel der Zielstufe neu setzen (nicht bei jedem Tastendruck),
  // damit man das voreingetragene "Grundstufe" (o. Ä.) durch eine echte Beschreibung ersetzen kann.
  $: if (eskalationZiel !== letzteEskalationZiel) {
    letzteEskalationZiel = eskalationZiel;
    eskalationStichwort = eskalationOptionen.find((o) => o.alarmLevel === eskalationZiel)?.keywords ?? '';
  }

  // Spiegelt exakt den Ansagetext, den /api/mission-escalate serverseitig erzeugt (siehe dort)
  $: ansageVorschau = [
    `Achtung, Einsatzstufenerhöhung auf ${speakPartFuerMark(eskalationZiel)}`,
    ...(eskalationMitFahrzeugen && eskalationCars.length > 0 ? [`für ${eskalationCars.join(', ')}`] : []),
    eskalationZusatztext.trim() || eskalationStichwort.trim() || mission?.mission_des || '',
    `Ort: ${mission?.locString ?? ''}`
  ].join(', ');

  function toggleEskalationCar(name: string) {
    eskalationCars = eskalationCars.includes(name)
      ? eskalationCars.filter((c) => c !== name)
      : [...eskalationCars, name];
  }

  async function einsatzstufeErhoehen() {
    if (!mission || !eskalationZiel) return;

    eskalationLaeuft = true;
    try {
      const res = await fetch('/api/mission-escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mission_id: mission.id,
          newMark: eskalationZiel,
          announce: eskalationAnsagen,
          zusatztext: eskalationZusatztext,
          cars: eskalationMitFahrzeugen ? eskalationCars : [],
          stichwort: eskalationStichwort
        })
      });
      const data = await res.json();
      if (!data.success) {
        alert('Fehler beim Erhöhen der Einsatzstufe!');
        return;
      }
      // Stufe, Stichwort UND Fahrzeuge kommen aus derselben Antwort – ein Serveraufruf, eine Ansage.
      mission = {
        ...mission,
        mission_mark: eskalationZiel,
        mission_des: data.mission_des,
        cars: JSON.stringify(data.cars)
      };

      eskalationCars = [];
      eskalationMitFahrzeugen = false;
      eskalationZusatztext = '';
      await ladeTagebuch(mission.id);
      await ladeVerfuegbareCars();
    } catch (err) {
      console.error('Fehler beim Erhöhen der Einsatzstufe:', err);
      alert('Fehler beim Erhöhen der Einsatzstufe!');
    } finally {
      eskalationLaeuft = false;
    }
  }

  async function parseCars(carString: string): Promise<string[]> {
    try {
      const cleaned = carString.replaceAll('\\', '');
      const trimmed =
        cleaned.startsWith('"') && cleaned.endsWith('"') ? cleaned.slice(1, -1) : cleaned;
      const parsed = JSON.parse(trimmed);
      return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
    } catch (e) {
      console.error('Fehler beim Parsen von cars:', e);
      return [];
    }
  }

  async function ladeTagebuch(missionId: number) {
    tagebuchLaden = true;
    try {
      const res = await fetch(`/api/mission-notes?mission_id=${missionId}`);
      tagebuchEintraege = await res.json();
    } catch (err) {
      console.error('Fehler beim Laden des Einsatztagebuchs:', err);
      tagebuchEintraege = [];
    } finally {
      tagebuchLaden = false;
    }
  }

  async function eintragHinzufuegen() {
    if (!mission || !eintragGueltig) return;

    const author = eintragAutor.trim() || 'Unbekannt';
    let payload: Record<string, unknown>;

    if (eintragTyp === 'notiz') {
      payload = { type: 'notiz', content: neueNotizText.trim() };
    } else if (eintragTyp === 'status') {
      const status = STATUS_OPTIONEN.find(s => s.value === statusAuswahl);
      payload = {
        type: 'status',
        content: `${eintragFahrzeug}: ${status?.label ?? ''}`,
        car_name: eintragFahrzeug,
        status_value: statusAuswahl
      };
    } else {
      payload = {
        type: 'staerke',
        content: `${eintragFahrzeug} – Stärkemeldung: ${staerkeFuehrung}/${staerkeUnterfuehrer}/${staerkeMannschaft}/${staerkeGesamt}`,
        car_name: eintragFahrzeug,
        fuehrungskraefte: staerkeFuehrung,
        unterfuehrer: staerkeUnterfuehrer,
        mannschaft: staerkeMannschaft,
        gesamt: staerkeGesamt
      };
    }

    eintragSpeichern = true;
    try {
      const res = await fetch('/api/mission-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mission_id: mission.id, author, ...payload })
      });

      const data = await res.json();
      if (data.success) {
        if (eintragTyp === 'notiz') neueNotizText = '';
        if (eintragTyp === 'staerke') {
          staerkeFuehrung = 0;
          staerkeUnterfuehrer = 0;
          staerkeMannschaft = 0;
        }
        if (eintragTyp !== 'notiz') eintragFahrzeug = '';
        await ladeTagebuch(mission.id);
      } else {
        alert('Fehler beim Speichern des Eintrags!');
      }
    } catch (err) {
      console.error('Fehler beim Speichern des Eintrags:', err);
      alert('Fehler beim Speichern des Eintrags!');
    } finally {
      eintragSpeichern = false;
    }
  }
  async function ladeVerfuegbareCars() {
    fahrzeugeLaden = true;
    try {
      const res = await fetch('/api/cars');
      alleCars = await res.json();
    } catch (err) {
      console.error('Fehler beim Laden der Fahrzeuge:', err);
      alleCars = [];
    } finally {
      fahrzeugeLaden = false;
    }
  }

  function toggleAuswahl(name: string) {
    ausgewaehlteCars = ausgewaehlteCars.includes(name)
      ? ausgewaehlteCars.filter(c => c !== name)
      : [...ausgewaehlteCars, name];
  }

  async function nachalarmieren() {
    if (!mission || ausgewaehlteCars.length === 0) return;

    nachalarmierenLaeuft = true;
    try {
      const res = await fetch('/api/mission-cars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mission_id: mission.id, cars: ausgewaehlteCars })
      });

      const data = await res.json();
      if (data.success) {
        // Lokale Anzeige sofort aktualisieren, ohne auf den nächsten Poll zu warten
        mission = { ...mission, cars: JSON.stringify(data.cars) };
        // Die zugeordneten Melder löst /api/mission-cars bereits serverseitig aus.

        ausgewaehlteCars = [];
        await ladeVerfuegbareCars();
      } else {
        alert('Fehler beim Nachalarmieren!');
      }
    } catch (err) {
      console.error('Fehler beim Nachalarmieren:', err);
      alert('Fehler beim Nachalarmieren!');
    } finally {
      nachalarmierenLaeuft = false;
    }
  }
</script>

{#if mission}
  <div class="space-y-5">
    <div class="pb-4 border-b {sectionBorder}">
      <div class="flex items-center gap-2 mb-2">
        <span class="px-2 py-0.5 rounded text-sm font-bold bg-red-700 text-white">{mission.mission_mark}</span>
        <p class="text-xl font-semibold {titleText}">{mission.mission_des}</p>
      </div>
      <div class="flex flex-wrap gap-x-6 gap-y-1 text-sm {metaText}">
        <span><span class={metaLabel}>Ort:</span> {mission.locString}</span>
        <span><span class={metaLabel}>Zeit:</span> {new Date(Number(mission.time)).toLocaleString()}</span>
      </div>
    </div>

    {#if eskalationOptionen.length > 0}
      <div class={cardClass}>
        <p class={cardLabel}>Einsatzstufe erhöhen</p>

        <select bind:value={eskalationZiel} class="{formInputClass} mb-3" style="width: auto;">
          {#each eskalationOptionen as option}
            <option value={option.alarmLevel}>{option.alarmLevel} – {option.keywords}</option>
          {/each}
        </select>

        <div class="mb-3">
          <label class="block text-xs {formLabelClass} mb-1" for="eskalation-stichwort">
            Stichwort (ersetzt die Einsatzbeschreibung)
          </label>
          <input
            id="eskalation-stichwort"
            type="text"
            bind:value={eskalationStichwort}
            placeholder="z. B. Gebäudebrand mit Menschenrettung"
            class={formInputClass}
          />
        </div>

        <label class="flex items-center gap-2 text-sm {formLabelClass} mb-2">
          <input type="checkbox" bind:checked={eskalationMitFahrzeugen} />
          Zusätzliche Fahrzeuge alarmieren
        </label>

        {#if eskalationMitFahrzeugen}
          <div class="flex flex-wrap gap-2 mb-3">
            {#if verfuegbareCars.length === 0}
              <p class="{mutedText} text-sm">Keine weiteren Fahrzeuge verfügbar.</p>
            {:else}
              {#each verfuegbareCars as car (car.name)}
                <button
                  type="button"
                  on:click={() => toggleEskalationCar(car.name)}
                  class={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition
                    ${eskalationCars.includes(car.name) ? 'bg-red-600 border-red-400 text-white' : toggleInactiveClass}`}
                >
                  {car.name}
                </button>
              {/each}
            {/if}
          </div>
        {/if}

        <label class="flex items-center gap-2 text-sm {formLabelClass} mb-2">
          <input type="checkbox" bind:checked={eskalationAnsagen} />
          Auf dem Monitor laut ansagen
        </label>

        {#if eskalationAnsagen}
          <div class="mb-3">
            <label class="block text-xs {formLabelClass} mb-1" for="eskalation-zusatztext">
              Zusatztext für die Ansage (optional)
            </label>
            <input
              id="eskalation-zusatztext"
              type="text"
              bind:value={eskalationZusatztext}
              placeholder="z. B. Nachbarwehr XY alarmiert"
              class={formInputClass}
            />
            <p class="text-xs {mutedText} mt-1">
              Ansagetext: „{ansageVorschau}“
            </p>
          </div>
        {/if}

        <Button
          color="red"
          size="sm"
          disabled={!eskalationZiel || eskalationLaeuft}
          on:click={einsatzstufeErhoehen}
        >
          {eskalationLaeuft ? 'Wird erhöht…' : `Auf ${eskalationZiel} erhöhen`}
        </Button>
      </div>
    {/if}

    <div class={cardClass}>
      <p class={cardLabel}>Fahrzeuge</p>
      {#if mission.cars}
        {#await parseCars(mission.cars) then cars}
          <div class="flex gap-2 flex-wrap">
            {#each cars as car}
              <Kbd class="px-2 py-1.5">{car}</Kbd>
            {/each}
          </div>
        {:catch}
          <p class={mutedText}>Fehler beim Laden der Fahrzeuge.</p>
        {/await}
      {:else}
        <p class={mutedText}>Keine Fahrzeuge eingetragen.</p>
      {/if}
    </div>

    <div class={cardClass}>
      <p class={cardLabel}>Nachalarmieren</p>

      {#if fahrzeugeLaden}
        <p class="{mutedText} text-sm">Lade verfügbare Fahrzeuge …</p>
      {:else if verfuegbareCars.length === 0}
        <p class="{mutedText} text-sm">Keine weiteren Fahrzeuge verfügbar.</p>
      {:else}
        <div class="flex flex-wrap gap-2 mb-2">
          {#each verfuegbareCars as car (car.name)}
            <button
              type="button"
              on:click={() => toggleAuswahl(car.name)}
              class={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition
                ${ausgewaehlteCars.includes(car.name)
                  ? 'bg-red-600 border-red-400 text-white'
                  : toggleInactiveClass}`}
            >
              {car.name}
            </button>
          {/each}
        </div>

        <Button
          size="sm"
          disabled={ausgewaehlteCars.length === 0 || nachalarmierenLaeuft}
          on:click={nachalarmieren}
        >
          {nachalarmierenLaeuft
            ? 'Alarmiere…'
            : `${ausgewaehlteCars.length} Fahrzeug${ausgewaehlteCars.length === 1 ? '' : 'e'} nachalarmieren`}
        </Button>
      {/if}
    </div>

    <div class={cardClass}>
      <p class={cardLabel}>Einsatztagebuch</p>

      {#if tagebuchLaden}
        <p class="{mutedText} text-sm">Lade Einsatztagebuch …</p>
      {:else if tagebuchEintraege.length === 0}
        <p class="{mutedText} text-sm mb-3">Noch keine Einträge vorhanden.</p>
      {:else}
        <div class="space-y-2 mb-3 pr-1 max-h-64 overflow-y-auto">
          {#each tagebuchEintraege as eintrag (eintrag.id)}
            <div
              class={`bg-gray-100 text-black rounded-lg p-3 border-l-4 ${
                eintrag.type === 'status'
                  ? 'border-blue-500'
                  : eintrag.type === 'staerke'
                  ? 'border-green-600'
                  : eintrag.type === 'eskalation'
                  ? 'border-orange-500'
                  : 'border-gray-400'
              }`}
            >
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="flex items-center gap-2">
                  <span
                    class={`px-2 py-0.5 rounded-full text-[11px] font-semibold text-white ${
                      eintrag.type === 'status'
                        ? 'bg-blue-600'
                        : eintrag.type === 'staerke'
                        ? 'bg-green-700'
                        : eintrag.type === 'eskalation'
                        ? 'bg-orange-600'
                        : 'bg-gray-500'
                    }`}
                  >
                    {eintrag.type === 'status'
                      ? 'Status'
                      : eintrag.type === 'staerke'
                      ? 'Stärkemeldung'
                      : eintrag.type === 'eskalation'
                      ? 'Einsatzstufe'
                      : 'Notiz'}
                  </span>
                  {#if eintrag.car_name}
                    <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-300 text-gray-800">
                      {eintrag.car_name}
                    </span>
                  {/if}
                  <span class="font-semibold">{eintrag.author}</span>
                </span>
                <span>{new Date(eintrag.created_at).toLocaleString('de-DE')}</span>
              </div>
              <div class="text-m whitespace-pre-wrap">{eintrag.content}</div>
            </div>
          {/each}
        </div>
      {/if}

      <div class="flex gap-1 mb-2 {pillContainerClass} rounded-lg p-1 w-fit">
        <button
          type="button"
          on:click={() => (eintragTyp = 'notiz')}
          class={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${
            eintragTyp === 'notiz' ? 'bg-red-600 text-white' : pillInactiveClass
          }`}
        >
          Notiz
        </button>
        <button
          type="button"
          on:click={() => (eintragTyp = 'status')}
          class={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${
            eintragTyp === 'status' ? 'bg-red-600 text-white' : pillInactiveClass
          }`}
        >
          Status
        </button>
        <button
          type="button"
          on:click={() => (eintragTyp = 'staerke')}
          class={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${
            eintragTyp === 'staerke' ? 'bg-red-600 text-white' : pillInactiveClass
          }`}
        >
          Stärkemeldung
        </button>
      </div>

      <form on:submit|preventDefault={eintragHinzufuegen} class="flex flex-col gap-2 {formContainerClass}">
        {#if eintragTyp !== 'notiz'}
          <div>
            <label class="block text-xs {formLabelClass} mb-1" for="eintrag-fahrzeug">Fahrzeug</label>
            {#if einsatzFahrzeuge.length === 0}
              <p class="{mutedText} text-sm">Diesem Einsatz sind noch keine Fahrzeuge zugeteilt.</p>
            {:else}
              <select id="eintrag-fahrzeug" bind:value={eintragFahrzeug} class={formInputClass}>
                <option value="" disabled>Fahrzeug auswählen…</option>
                {#each einsatzFahrzeuge as fahrzeug}
                  <option value={fahrzeug}>{fahrzeug}</option>
                {/each}
              </select>
            {/if}
          </div>
        {/if}
        {#if eintragTyp === 'notiz'}
          <textarea
            bind:value={neueNotizText}
            rows="2"
            placeholder="Neue Notiz hinzufügen…"
            class="{formInputClass} resize-none"
          ></textarea>
        {:else if eintragTyp === 'status'}
          <select bind:value={statusAuswahl} class={formInputClass}>
            {#each STATUS_OPTIONEN as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        {:else}
          <div class="grid grid-cols-3 gap-2">
            <div>
              <label class="block text-xs {formLabelClass} mb-1" for="staerke-fuehrung">Führungskräfte</label>
              <input
                id="staerke-fuehrung"
                type="number"
                min="0"
                bind:value={staerkeFuehrung}
                class={formInputClass}
              />
            </div>
            <div>
              <label class="block text-xs {formLabelClass} mb-1" for="staerke-unterfuehrer">Unterführer</label>
              <input
                id="staerke-unterfuehrer"
                type="number"
                min="0"
                bind:value={staerkeUnterfuehrer}
                class={formInputClass}
              />
            </div>
            <div>
              <label class="block text-xs {formLabelClass} mb-1" for="staerke-mannschaft">Mannschaft</label>
              <input
                id="staerke-mannschaft"
                type="number"
                min="0"
                bind:value={staerkeMannschaft}
                class={formInputClass}
              />
            </div>
          </div>
          <p class="text-xs {formLabelClass}">Gesamt: <span class="font-semibold {totalValueClass}">{staerkeGesamt}</span></p>
        {/if}

        <div class="flex items-center gap-2">
          <input
            bind:value={eintragAutor}
            placeholder="Name"
            class="rounded-lg p-2 text-sm text-black w-32"
          />
          <Button type="submit" disabled={eintragSpeichern || !eintragGueltig}>
            {eintragSpeichern ? 'Speichere…' : 'Eintrag speichern'}
          </Button>
        </div>
      </form>
    </div>

    <div class="rounded-lg overflow-hidden border {sectionBorder}">
      <MapView
        isInterative={false}
        markerCoordinates={[{
          lat: Number(mission.lat),
          lng: Number(mission.lng),
          label: mission.mission_mark
        }]}
      />
    </div>
  </div>
{/if}