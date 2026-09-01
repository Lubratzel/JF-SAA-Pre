import { json } from '@sveltejs/kit';
import { db } from '$lib/db';

// GET /api/announcements
// Holt alle noch nicht vorgelesenen Ansagen (z. B. Einsatzstufen-Erhöhungen) und markiert sie
// im selben Request als abgeholt, damit sie bei mehreren offenen Monitoren nicht mehrfach
// vorgelesen werden.
export function GET() {
	const rows = db
		.prepare(`
			SELECT id, mission_id, announce_text, announce_cars FROM mission_notes
			WHERE announce = 1 AND announced_at IS NULL AND announce_text IS NOT NULL
			ORDER BY created_at ASC, id ASC
		`)
		.all() as { id: number; mission_id: number; announce_text: string; announce_cars: string | null }[];

	if (rows.length > 0) {
		const ids = rows.map((r) => r.id);
		const placeholders = ids.map(() => '?').join(',');
		db.prepare(`UPDATE mission_notes SET announced_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`).run(
			...ids
		);
	}

	const items = rows.map((r) => {
		let parts: string[] = [];
		try {
			parts = JSON.parse(r.announce_text);
		} catch {
			parts = [];
		}
		let cars: string[] = [];
		try {
			cars = r.announce_cars ? JSON.parse(r.announce_cars) : [];
		} catch {
			cars = [];
		}
		return { id: r.id, mission_id: r.mission_id, cars, parts };
	});

	return json(items);
}
