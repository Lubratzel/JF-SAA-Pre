import Database from "better-sqlite3"
import type {car, missions, pager} from "$lib/db/types";
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

export const db = new Database("./database/jfsaaa.db", {verbose: console.log})

// Leichtgewichtige Mini-Migration: legt fehlende Spalten an, statt ein separates
// Migrationssystem einzuführen. Idempotent, läuft bei jedem Serverstart.
function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// Für die Ansagen-Warteschlange des Monitors (siehe /api/mission-escalate, /api/announcements)
ensureColumn('mission_notes', 'announce', 'INTEGER DEFAULT 0');
ensureColumn('mission_notes', 'announced_at', 'DATETIME DEFAULT NULL');
ensureColumn('mission_notes', 'announce_text', 'TEXT DEFAULT NULL');
// Fahrzeuge, die zusammen mit dieser Ansage alarmiert wurden (JSON-Array) – der Monitor markiert
// sie damit als "bereits angesagt", damit seine eigene Nachalarmierungs-Erkennung sie nicht noch
// einmal (mit zweitem Gong) ansagt.
ensureColumn('mission_notes', 'announce_cars', 'TEXT DEFAULT NULL');

export function getAllCars(): car{
    const sql = 'SELECT  * FROM cars;'
    const stmt = db.prepare(sql)
    const rows = stmt.all();
    return rows as car;
}

export function addCar(name: string){
  const sql = 'INSERT INTO cars ("name") VALUES (?);'
  const stmt = db.prepare(sql)
  const result = stmt.run(name)
  return result;
}


export function deleteCar(name: string){
  const sql = 'DELETE FROM cars WHERE name = ?;'
  const stmt = db.prepare(sql);
  const result = stmt.run(name);
  return result;
}

/** Speichert die Melder-Nummern (FirePager-Gateway) für ein Fahrzeug */
export function updateCarPager(id: number, pagerIds: number[]) {
  const stmt = db.prepare('UPDATE cars SET pager = ? WHERE id = ?');
  return stmt.run(JSON.stringify(pagerIds), id);
}

/** Liest die zugeordneten Melder-Nummern für die übergebenen Fahrzeugnamen (dedupliziert) */
export function getPagerIdsForCarNames(carNames: string[]): number[] {
  if (carNames.length === 0) return [];

  const placeholders = carNames.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT pager FROM cars WHERE name IN (${placeholders})`)
    .all(...carNames) as { pager: string | null }[];

  const ids = new Set<number>();
  for (const row of rows) {
    if (!row.pager) continue;
    try {
      const parsed = JSON.parse(row.pager);
      if (Array.isArray(parsed)) {
        for (const n of parsed) {
          const num = Number(n);
          if (Number.isInteger(num)) ids.add(num);
        }
      }
    } catch {
      // Fahrzeug hat keine gültige Pager-Zuordnung – überspringen
    }
  }
  return [...ids];
}

export function getAllPager(): pager{
    const sql = 'SELECT  * FROM pager;'
    const stmt = db.prepare(sql)
    const rows = stmt.all();
    return rows as pager;
}

export function getAllMission(): missions{
    const sql = 'SELECT  * FROM missions;'
    const stmt = db.prepare(sql)
    const rows = stmt.all();
    return rows as missions;
}

export function insertMission(mission: {
    mission_mark: string;
    mission_des: string;
    locString: string;
    locCor: string;
    time: string;
    immediateAlarm: boolean;
    isDone: boolean;
    lat: string;
    lng: string
    cars: string;
}) {
    const stmt = db.prepare(`
        INSERT INTO missions 
        (mission_mark, mission_des, locString, locCor, time, immediateAlarm, isDone, lat, lng, cars)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
        mission.mission_mark,
        mission.mission_des,
        mission.locString,
        mission.locCor,
        mission.time,
        mission.immediateAlarm ? 1 : 0,
        mission.isDone ? 1 : 0,
        mission.lat,
        mission.lng,
        mission.cars
    );

    return result;
}


export function setMissionDone(missionId: number) {
  const stmt = db.prepare(`UPDATE missions SET isDone = 1 WHERE id = ?`);
  const result = stmt.run(missionId);
  return result;
}

export function insertPager(pager: {
    carID: number | null;
    missionId: number | null;
    pagerName: string;
    generatedId: string;
  }) {
    const stmt = db.prepare(`
      INSERT INTO pager (carID, missionId, pagerName, generatedId)
      VALUES (?, ?, ?, ?)
    `);
  
    const result = stmt.run(
      pager.carID ?? null,
      pager.missionId ?? null,
      pager.pagerName,
      pager.generatedId
    );
  
    return result;
  }

  export function insertManyPager(pagers: {
    carID: number | null;
    missionId: number | null;
    pagerName: string;
    generatedId: string;
  }[]) {
    const stmt = db.prepare(`
      INSERT INTO pager (carID, missionId, pagerName, generatedId)
      VALUES (?, ?, ?, ?)
    `);
  
    const insertMany = db.transaction((pagers) => {
      for (const p of pagers) {
        stmt.run(p.carID ?? null, p.missionId ?? null, p.pagerName, p.generatedId);
      }
    });
  
    insertMany(pagers);
  }


  export function setAlarmSound(sound: string) {
    const stmt = db.prepare(`
      INSERT INTO settings (key, value)
      VALUES ('alarm_sound', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(sound);
  }

  type SettingsRow = { key: string, value: string };

  export function getAlarmSound(): string {
    const stmt = db.prepare("SELECT value FROM settings WHERE key = 'alarm_sound'");
    const row = stmt.get() as SettingsRow | undefined;
    return row?.value ?? 'ClockenSpielGong';
  }

  function getSettingValue(key: string): string | null {
    const stmt = db.prepare("SELECT value FROM settings WHERE key = ?");
    const row = stmt.get(key) as SettingsRow | undefined;
    return row?.value ?? null;
  }

  function setSettingValue(key: string, value: string) {
    const stmt = db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(key, value);
  }

  export function getDispatcherName(): string {
    return getSettingValue('dispatcher_name') ?? '';
  }

  export function setDispatcherName(name: string) {
    setSettingValue('dispatcher_name', name);
  }

  export function getFeuerwehrName(): string {
    return getSettingValue('feuerwehr_name') ?? 'Jugendfeuerwehr Münchweiler';
  }

  export function setFeuerwehrName(name: string) {
    setSettingValue('feuerwehr_name', name);
  }

  export function getStationPosition(): { lat: number; lng: number } | null {
    const lat = getSettingValue('station_lat');
    const lng = getSettingValue('station_lng');
    if (lat === null || lng === null) return null;
    return { lat: Number(lat), lng: Number(lng) };
  }

  export function setStationPosition(lat: number, lng: number) {
    setSettingValue('station_lat', String(lat));
    setSettingValue('station_lng', String(lng));
  }

  export function isSetupCompleted(): boolean {
    return getSettingValue('setup_completed') === '1';
  }

  export function setSetupCompleted() {
    setSettingValue('setup_completed', '1');
  }
