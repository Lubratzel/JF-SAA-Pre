<script lang="ts">
  import Einsaetze from "$lib/einsaetze.svelte";
  import Map from "$lib/map.svelte";
  import { newMission } from '../stores/mission.store';
  import MissonDes from "$lib/missonDes.svelte";

  let isInterative = false;

  import type { PageData } from "./$types";
    import { rollcallPager } from "../untils/PagerUtlis";
  export let data: PageData;

</script>



  <div><Einsaetze/></div>



