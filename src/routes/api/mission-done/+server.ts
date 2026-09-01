// src/routes/api/mission-done/+server.ts
import { json } from '@sveltejs/kit';
import { setMissionDone } from '$lib/db/index';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';


export async function POST({ request }) {
  const { id } = await request.json();

  const mission = db.prepare('SELECT cars FROM missions WHERE id = ?').get(id) as any;

  if (!mission) {
    return json({ success: false, error: 'Einsatz nicht gefunden' }, { status: 404 });
  }

  db.prepare('UPDATE missions SET isDone = 1 WHERE id = ?').run(id);

  // 3. 🚨 NEU: Die Fahrzeuge dieses Einsatzes wieder auf frei (1) setzen
  if (mission.cars) {
    try {
      const carList: string[] = typeof mission.cars === 'string' ? JSON.parse(mission.cars) : mission.cars;

      const freeCarStmt = db.prepare(`
        UPDATE cars SET isAvailable = 1 WHERE name = ?
      `);

      const freeMany = db.transaction((carNames: string[]) => {
        for (const name of carNames) {
          freeCarStmt.run(name);
        }
      });

      freeMany(carList);
    } catch (e) {
      console.error('Fehler beim Freigeben der Fahrzeuge:', e);
    }
  }

  return json({ success: true });
}