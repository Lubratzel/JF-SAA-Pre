import type { LngLat } from 'maplibre-gl';

export interface Mission{
    pre_alarm: boolean,
    mission_mark: string,
    mission_des: string,
    cars: [],
    locString: string,
    locCor: LngLat | null;
    time:Date,
    immediateAlarm: boolean
}