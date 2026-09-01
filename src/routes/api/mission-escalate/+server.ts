import { json } from '@sveltejs/kit';
import { db, getPagerIdsForCarNames } from '$lib/db';
import { sendPagerCommands } from '$lib/server/pagerSerial';
import { speakPartFuerMark, bereinigeOrtFuerAnsage } from '$lib/missionSpeech';

// POST /api/mission-escalate
// Body: { mission_id, newMark, announce?: boolean, zusatztext?: string, cars?: string[], stichwort?: string, author?: string }
// Erhöht die Einsatzstufe (z. B. B1 -> B2), alarmiert optional zusätzliche Fahrzeuge im selben
// Zug und protokolliert alles als EIN Eintrag im Einsatztagebuch mit EINER Monitor-Ansage
// (statt zwei getrennten Ansagen für Stufe + Nachalarmierung). "stichwort" ersetzt bei Bedarf
// die Einsatzbeschreibung (z. B. wenn die Zielstufe nur den generischen Platzhalter
// "Grundstufe" trägt und der Disponent stattdessen eine echte Beschreibung eintragen will).
export async function POST({ request }) {
	try {
		const { mission_id, newMark, announce, zusatztext, cars, stichwort, author } = await request.json();

		if (!mission_id || typeof newMark !== 'string' || !newMark.trim()) {
			return json(
				{ success: false, error: 'mission_id und newMark sind erforderlich' },
				{ status: 400 }
			);
		}

		const mission = db
			.prepare(`SELECT mission_mark, mission_des, locString, cars FROM missions WHERE id = ?`)
			.get(mission_id) as
			| { mission_mark: string; mission_des: string; locString: string; cars: string | null }
			| undefined;

		if (!mission) {
			return json({ success: false, error: 'Einsatz nicht gefunden' }, { status: 404 });
		}

		const zusatz: string = typeof zusatztext === 'string' ? zusatztext.trim() : '';
		const neueFahrzeuge: string[] = Array.isArray(cars) ? cars.filter((c) => typeof c === 'string') : [];

		const alteStufe = mission.mission_mark;
		const alteBeschreibung = mission.mission_des;
		const neueBeschreibung: string =
			typeof stichwort === 'string' && stichwort.trim() ? stichwort.trim() : alteBeschreibung;
		const beschreibungGeaendert = neueBeschreibung !== alteBeschreibung;

		db.prepare(`UPDATE missions SET mission_mark = ?, mission_des = ? WHERE id = ?`).run(
			newMark,
			neueBeschreibung,
			mission_id
		);

		let aktuelleFahrzeuge: string[] = [];
		try {
			aktuelleFahrzeuge = mission.cars ? JSON.parse(mission.cars) : [];
		} catch {
			aktuelleFahrzeuge = [];
		}

		if (neueFahrzeuge.length > 0) {
			const zusammengefuehrt = Array.from(new Set([...aktuelleFahrzeuge, ...neueFahrzeuge]));
			db.prepare(`UPDATE missions SET cars = ? WHERE id = ?`).run(JSON.stringify(zusammengefuehrt), mission_id);
			aktuelleFahrzeuge = zusammengefuehrt;

			const updateCarStmt = db.prepare(`UPDATE cars SET isAvailable = 0 WHERE name = ?`);
			const updateMany = db.transaction((carNames: string[]) => {
				for (const name of carNames) updateCarStmt.run(name);
			});
			updateMany(neueFahrzeuge);

			const pagerIds = getPagerIdsForCarNames(neueFahrzeuge);
			if (pagerIds.length > 0) {
				sendPagerCommands(pagerIds).catch((err) =>
					console.error('[mission-escalate] Melder-Alarmierung fehlgeschlagen:', err)
				);
			}
		}

		const content =
			`Einsatzstufe erhöht: ${alteStufe} → ${newMark}` +
			(beschreibungGeaendert ? ` – Stichwort: "${alteBeschreibung}" → "${neueBeschreibung}"` : '') +
			(neueFahrzeuge.length > 0 ? ` – zusätzlich alarmiert: ${neueFahrzeuge.join(', ')}` : '') +
			(zusatz ? ` – ${zusatz}` : '');
		const created_at = new Date().toISOString().slice(0, 19).replace('T', ' ');

		let announceText: string | null = null;
		if (announce) {
			const cleanedLoc = bereinigeOrtFuerAnsage(mission.locString);
			const parts = [`Achtung, Einsatzstufenerhöhung auf ${speakPartFuerMark(newMark)}`];
			if (neueFahrzeuge.length > 0) parts.push(`für ${neueFahrzeuge.join(', ')}`);
			parts.push(zusatz || neueBeschreibung);
			parts.push(`Ort: ${cleanedLoc}`);
			announceText = JSON.stringify(parts);
		}

		db.prepare(`
			INSERT INTO mission_notes (mission_id, content, author, created_at, type, announce, announce_text, announce_cars)
			VALUES (?, ?, ?, ?, 'eskalation', ?, ?, ?)
		`).run(
			mission_id,
			content,
			author ?? 'Disponent',
			created_at,
			announce ? 1 : 0,
			announceText,
			neueFahrzeuge.length > 0 ? JSON.stringify(neueFahrzeuge) : null
		);

		return json({ success: true, mission_mark: newMark, mission_des: neueBeschreibung, cars: aktuelleFahrzeuge });
	} catch (err: any) {
		console.error('Fehler beim Erhöhen der Einsatzstufe:', err);
		return json({ success: false, error: err?.message ?? String(err) }, { status: 500 });
	}
}
