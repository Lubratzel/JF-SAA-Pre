import { json } from '@sveltejs/kit';
import { db } from '$lib/db';

// GET /api/mission-notes?mission_id=25
export function GET({ url }) {
  const missionId = url.searchParams.get('mission_id');

  if (!missionId) {
    return json([]);
  }

  const notes = db
    .prepare(`
      SELECT * FROM mission_notes
      WHERE mission_id = ?
      ORDER BY created_at ASC, id ASC
    `)
    .all(missionId);

  return json(notes);
}

// POST /api/mission-notes  { mission_id, content, author, type, car_name?, status_value?, fuehrungskraefte?, unterfuehrer?, mannschaft?, gesamt? }
export async function POST({ request }) {
  const {
    mission_id,
    content,
    author,
    type,
    car_name,
    status_value,
    fuehrungskraefte,
    unterfuehrer,
    mannschaft,
    gesamt
  } = await request.json();

  if (!mission_id || !content) {
    return json(
      { success: false, error: 'mission_id und content sind erforderlich' },
      { status: 400 }
    );
  }

  // Format passend zu eurem bisherigen created_at ("2026-08-04 06:...")
  const created_at = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const stmt = db.prepare(`
    INSERT INTO mission_notes
      (mission_id, content, author, created_at, type, car_name, status_value, fuehrungskraefte, unterfuehrer, mannschaft, gesamt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    mission_id,
    content,
    author ?? 'Unbekannt',
    created_at,
    type ?? 'notiz',
    car_name ?? null,
    status_value ?? null,
    fuehrungskraefte ?? null,
    unterfuehrer ?? null,
    mannschaft ?? null,
    gesamt ?? null
  );

  return json({ success: true });
}