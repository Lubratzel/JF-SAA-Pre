import {getAllCars, getAllMission, getAllPager} from "$lib/db";
import type {PageLoad} from "../../../.svelte-kit/types/src/routes/$types";


export const load: PageLoad = (() => {
    const cars = getAllCars()

    return{
        cars
    };
});