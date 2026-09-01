import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	sendPagerCommands,
	listSerialPorts,
	loadPagerSerialConfig,
	savePagerSerialConfig
} from '$lib/server/pagerSerial';

/** Liefert die aktuelle Konfiguration + verfügbare serielle Ports (zum Einrichten des richtigen Pfads) */
export const GET: RequestHandler = async () => {
	const config = loadPagerSerialConfig();

	let availablePorts: Awaited<ReturnType<typeof listSerialPorts>> = [];
	let portsError: string | undefined;
	try {
		availablePorts = await listSerialPorts();
	} catch (err) {
		portsError = err instanceof Error ? err.message : String(err);
		console.error('[api/pager/serial] Fehler beim Auflisten der seriellen Ports:', err);
	}

	return json({ config, availablePorts, ...(portsError ? { portsError } : {}) });
};

/**
 * Body: { ids: (number|string)[] }  oder  { id: number|string }
 * Optional: { config: Partial<PagerSerialConfig> } um einzelne Werte pro Request zu überschreiben
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		const ids: (number | string)[] = Array.isArray(body?.ids)
			? body.ids
			: body?.id !== undefined
				? [body.id]
				: [];

		if (ids.length === 0) {
			return json(
				{ success: false, error: 'Keine Pager-IDs übergeben (Body: { ids: [...] } oder { id: ... })' },
				{ status: 400 }
			);
		}

		const result = await sendPagerCommands(ids, body?.config ?? {});
		return json(result, { status: result.success ? 200 : 500 });
	} catch (err) {
		console.error('[api/pager/serial] Fehler:', err);
		return json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
	}
};

/** Speichert die Konfiguration dauerhaft in pager-serial.config.json (z. B. gewählter COM-/Device-Port) */
export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const config = savePagerSerialConfig(body ?? {});
		return json({ success: true, config });
	} catch (err) {
		console.error('[api/pager/serial] Fehler beim Speichern:', err);
		return json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
	}
};
