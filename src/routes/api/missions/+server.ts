import { json } from '@sveltejs/kit';
import { getAllMission, getPagerIdsForCarNames } from '$lib/db'
import { insertMission } from '$lib/db/index';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/db';
import { sendPagerCommands } from '$lib/server/pagerSerial';


export function GET() {
    const missions = getAllMission();
    return json(missions);
}

export async function POST({ request }) {
  try {
    const missionData = await request.json();
    const { cars, ...rest } = missionData;

    // 'cars' immer als JSON-String in der DB ablegen, egal ob Array oder String reinkommt
    const carsToStore = typeof cars === 'string' ? cars : JSON.stringify(cars ?? []);

    // 1. Einsatz in die DB eintragen
    const stmt = db.prepare(`
      INSERT INTO missions (mission_mark, mission_des, locString, locCor, time, immediateAlarm, isDone, lat, lng, cars)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      rest.mission_mark ?? null,
      rest.mission_des ?? null,
      rest.locString ?? null,
      rest.locCor !== undefined ? JSON.stringify(rest.locCor) : null,
      rest.time ?? null,
      rest.immediateAlarm ? 1 : 0,
      0,
      rest.lat ?? null,
      rest.lng ?? null,
      carsToStore
    );

    // 2. Fahrzeuge als nicht-verfügbar markieren
    const carList: string[] =
      typeof cars === 'string'
        ? JSON.parse(cars || '[]')
        : Array.isArray(cars)
          ? cars
          : [];

    if (carList.length > 0) {
      const updateCarStmt = db.prepare(`
        UPDATE cars SET isAvailable = 0 WHERE name = ?
      `);

      const updateMany = db.transaction((carNames: string[]) => {
        for (const name of carNames) {
          updateCarStmt.run(name);
        }
      });

      updateMany(carList);
    }

    // 3. Zugeordnete Melder über das FirePager-Gateway alarmieren (nicht blockierend)
    const pagerIds = getPagerIdsForCarNames(carList);
    if (pagerIds.length > 0) {
      sendPagerCommands(pagerIds)
        .then((result) => {
          if (!result.success) {
            console.error('[missions] Melder-Alarmierung fehlgeschlagen:', result.error, result.results);
          }
        })
        .catch((err) => console.error('[missions] Melder-Alarmierung unerwartet fehlgeschlagen:', err));
    }

    return json({ success: true });
  } catch (err: any) {
    console.error('Fehler beim Anlegen des Einsatzes:', err);
    return json(
      { success: false, error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}