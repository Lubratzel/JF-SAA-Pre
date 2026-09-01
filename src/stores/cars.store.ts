import {writable} from "svelte/store";
import { Car } from "../interface/car";


export const cars = writable<Car | any>([]);