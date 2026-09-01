export type car = {
    id: number;
    name: string;
    isAvailable: number;
    missionId: number;
}

export type pager = {
    id: number;
    carId: number;
    missionId: number;
}

export type missions = {
    id: number;
    mission_mark: string;
    mission_des: string;
    locString: string;
    locCor: string;
    time: string;
    immediateAlarm: number;
}