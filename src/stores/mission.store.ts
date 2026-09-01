import {writable} from "svelte/store";
import type {Mission} from "../interface/mission";



export const newMission = writable<Mission | any>([]);

export const missionNow = writable<Mission | any>([]);

export const newMissionDialog = writable<boolean>(false);
