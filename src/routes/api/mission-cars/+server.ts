import { json } from '@sveltejs/kit';
import { db, getPagerIdsForCarNames } from '$lib/db';
import { sendPagerCommands } from '$lib/server/pagerSerial';

// POST /api/mission-cars  { mission_id, cars: string[] }
// Ergänzt weitere Fahrzeuge zu einem bereits bestehenden Einsatz ("Nachalarmierung")
export async function POST({ request }) {
  try {
    const { mission_id, cars } = await request.json();

    if (!mission_id || !Array.isArray(cars) || cars.length === 0) {
      return json(
        { success: false, error: 'mission_id und cars (nicht-leeres Array) sind erforderlich' },
        { status: 400 }
      );
    }

    const mission = db
      .prepare(`SELECT cars FROM missions WHERE id = ?`)
      .get(mission_id) as { cars: string } | undefined;

    if (!mission) {
      return json({ success: false, error: 'Einsatz nicht gefunden' }, { status: 404 });
    }

    let bestehendeCars: string[] = [];
    try {
      bestehendeCars = mission.cars ? JSON.parse(mission.cars) : [];
    } catch {
      bestehendeCars = [];
    }

    // Neue Fahrzeuge ergänzen, ohne Duplikate
    const zusammengefuehrt = Array.from(new Set([...bestehendeCars, ...cars]));

    db.prepare(`UPDATE missions SET cars = ? WHERE id = ?`).run(
      JSON.stringify(zusammengefuehrt),
      mission_id
    );

    // Neu alarmierte Fahrzeuge als nicht verfügbar markieren (wie beim Anlegen eines Einsatzes)
    const updateCarStmt = db.prepare(`UPDATE cars SET isAvailable = 0 WHERE name = ?`);
    const updateMany = db.transaction((carNames: string[]) => {
      for (const name of carNames) {
        updateCarStmt.run(name);
      }
    });
    updateMany(cars);

    // Nur die neu hinzugekommenen Fahrzeuge alarmieren, nicht die bereits alarmierten
    const pagerIds = getPagerIdsForCarNames(cars);
    if (pagerIds.length > 0) {
      sendPagerCommands(pagerIds)
        .then((result) => {
          if (!result.success) {
            console.error('[mission-cars] Melder-Nachalarmierung fehlgeschlagen:', result.error, result.results);
          }
        })
        .catch((err) => console.error('[mission-cars] Melder-Nachalarmierung unerwartet fehlgeschlagen:', err));
    }

    return json({ success: true, cars: zusammengefuehrt });
  } catch (err: any) {
    console.error('Fehler beim Nachalarmieren:', err);
    return json(
      { success: false, error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}