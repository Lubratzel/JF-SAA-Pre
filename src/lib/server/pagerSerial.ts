import { SerialPort, ReadlineParser } from 'serialport';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface PagerSerialConfig {
	/** Device-Pfad des USB-Moduls, z. B. /dev/tty.usbserial-0001 oder COM3 */
	port: string;
	baudRate: number;
	/** Abstand in ms zwischen den einzelnen Befehlen, wenn mehrere Pager ausgelöst werden */
	delayMs: number;
	/** {id} wird durch die jeweilige Pager-ID ersetzt */
	messageTemplate: string;
	lineEnding: string;
}

const CONFIG_PATH = join(process.cwd(), 'pager-serial.config.json');

// Unter Windows heißen serielle Ports COMx statt /dev/tty..., daher plattformabhängiger Default
const DEFAULT_PORT = process.platform === 'win32' ? 'COM3' : '/dev/tty.usbserial-0001';

// Werte passend zur FirePager-Alarmierungseinheit (LILYGO T3 V1.6.1, siehe FirePager-Gateway.md)
const DEFAULT_CONFIG: PagerSerialConfig = {
	port: DEFAULT_PORT,
	baudRate: 115200,
	delayMs: 200,
	messageTemplate: 'pager:{id}',
	lineEnding: '\n'
};

export function loadPagerSerialConfig(): PagerSerialConfig {
	try {
		const raw = readFileSync(CONFIG_PATH, 'utf-8');
		const parsed = JSON.parse(raw);
		return { ...DEFAULT_CONFIG, ...parsed };
	} catch (err) {
		console.warn(`[pagerSerial] Konnte ${CONFIG_PATH} nicht laden, nutze Standardwerte:`, err);
		return DEFAULT_CONFIG;
	}
}

/** Schreibt (Teil-)Änderungen dauerhaft in pager-serial.config.json */
export function savePagerSerialConfig(partial: Partial<PagerSerialConfig>): PagerSerialConfig {
	const updated = { ...loadPagerSerialConfig(), ...partial };
	writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
	return updated;
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildMessage(template: string, id: number | string) {
	return template.replaceAll('{id}', String(id));
}

// Meldernummern sind laut Schnittstellenbeschreibung auf 1–998 begrenzt
const PAGER_ID_RANGE = { min: 1, max: 998 };

// Kurz gehalten: Falls die Einheit wirklich kalt bootet, dauert BOOT→READY laut Doku nur
// Millisekunden. Kommt in dieser Zeit kein READY (z. B. weil die USB-Bridge beim Verbindungsaufbau
// keinen Reset auslöst und die Einheit bereits läuft), wird trotzdem gesendet – siehe waitForReady().
// So kostet weder der Kaltstart- noch der Schon-läuft-Fall spürbar Zeit vor dem ersten Funkspruch.
const READY_TIMEOUT_MS = 1_500;
const ACK_TIMEOUT_MS = 3_000;

// Wird ausgegeben, während die Einheit hochfährt; kein Fehler, blockiert READY nicht
const INIT_ERROR_LINE = /^ERR:(radio:-?\d+|timer)$/;
const ACK_LINE = /^(OK:\d+|ERR:invalid|ERR:range|ERR:queue_full)$/;

/** Wartet auf die nächste Zeile, die dem Muster entspricht, oder wirft nach `timeoutMs` einen Timeout-Fehler. */
function waitForLine(
	parser: ReadlineParser,
	matches: (line: string) => boolean,
	timeoutMs: number,
	timeoutMessage: string
): Promise<string> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			parser.off('data', onData);
			reject(new Error(timeoutMessage));
		}, timeoutMs);

		function onData(raw: string) {
			const line = raw.trim();
			if (matches(line)) {
				clearTimeout(timer);
				parser.off('data', onData);
				resolve(line);
			}
		}

		parser.on('data', onData);
	});
}

/**
 * Wartet auf die Startsequenz der Alarmierungseinheit (BOOT → OLED:OK → RADIO:OK → TIMER:OK → READY).
 * Bricht sofort mit einer aussagekräftigen Meldung ab, wenn ein Initialisierungsfehler (ERR:radio:…,
 * ERR:timer) gemeldet wird, statt den vollen Timeout auszuwarten. OLED:FAIL ist laut Doku nicht fatal
 * und wird ignoriert – die Einheit läuft trotzdem hoch und sendet weiterhin READY.
 *
 * Öffnet auf manchen USB-Bridges (z. B. CP210x unter Windows) beim Verbindungsaufbau keinen
 * Hardware-Reset aus, obwohl das laut Doku der Regelfall ist. Die Einheit läuft dann bereits seit
 * einem früheren Boot und sendet kein erneutes READY. Ein Timeout ist deshalb kein Fehler – wir
 * nehmen an, dass das Gerät bereit ist, und lassen den nachfolgenden Pro-Kommando-ACK-Timeout
 * (waitForLine) den tatsächlichen Fehlerfall abfangen, falls das Gerät doch nicht antwortet.
 */
function waitForReady(parser: ReadlineParser, timeoutMs = READY_TIMEOUT_MS): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			parser.off('data', onData);
			console.warn(
				`[pagerSerial] Keine "READY"-Meldung innerhalb von ${timeoutMs}ms erhalten – gehe davon aus, dass die Einheit bereits läuft.`
			);
			resolve();
		}, timeoutMs);

		function onData(raw: string) {
			const line = raw.trim();
			if (line === 'READY') {
				clearTimeout(timer);
				parser.off('data', onData);
				resolve();
			} else if (INIT_ERROR_LINE.test(line)) {
				clearTimeout(timer);
				parser.off('data', onData);
				reject(new Error(`Initialisierungsfehler der Alarmierungseinheit: ${line}`));
			}
		}

		parser.on('data', onData);
	});
}

export interface PagerSendDetail {
	id: number | string;
	ok: boolean;
	response: string;
}

export interface SendPagerResult {
	success: boolean;
	sent: (number | string)[];
	results: PagerSendDetail[];
	error?: string;
}

/**
 * Öffnet die serielle Verbindung zur Alarmierungseinheit, wartet auf deren Startsequenz (READY),
 * sendet für jede Pager-ID einen "pager:N"-Befehl und wertet die synchrone Bestätigung
 * (OK:N / ERR:invalid / ERR:range / ERR:queue_full) aus, bevor der nächste Befehl gesendet wird.
 * Die Verbindung wird danach wieder geschlossen (Öffnen des Ports löst bei diesem ESP32-Board
 * i. d. R. einen Reset aus, daher jedes Mal ein frischer READY-Handshake).
 */
export async function sendPagerCommands(
	ids: (number | string)[],
	overrides: Partial<PagerSerialConfig> = {}
): Promise<SendPagerResult> {
	const config = { ...loadPagerSerialConfig(), ...overrides };

	if (ids.length === 0) {
		return { success: true, sent: [], results: [] };
	}

	const invalidId = ids.find((id) => {
		const n = Number(id);
		return !Number.isInteger(n) || n < PAGER_ID_RANGE.min || n > PAGER_ID_RANGE.max;
	});
	if (invalidId !== undefined) {
		return {
			success: false,
			sent: [],
			results: [],
			error: `Ungültige Meldernummer "${invalidId}" (gültig: ${PAGER_ID_RANGE.min}–${PAGER_ID_RANGE.max})`
		};
	}

	const port = new SerialPort({ path: config.port, baudRate: config.baudRate, autoOpen: false });
	const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));
	parser.on('data', (line: string) => console.log('[pagerSerial]', line.trim()));

	const sent: (number | string)[] = [];
	const results: PagerSendDetail[] = [];

	try {
		await new Promise<void>((resolve, reject) => {
			port.open((err) => (err ? reject(err) : resolve()));
		});

		await waitForReady(parser);

		for (let i = 0; i < ids.length; i++) {
			const id = ids[i];
			const message = buildMessage(config.messageTemplate, id) + config.lineEnding;

			await new Promise<void>((resolve, reject) => {
				port.write(message, (err) => {
					if (err) return reject(err);
					port.drain((drainErr) => (drainErr ? reject(drainErr) : resolve()));
				});
			});

			let ack: string;
			try {
				ack = await waitForLine(
					parser,
					(line) => ACK_LINE.test(line),
					ACK_TIMEOUT_MS,
					`Zeitüberschreitung: Keine Bestätigung für Melder ${id} erhalten (${ACK_TIMEOUT_MS}ms)`
				);
			} catch (err) {
				results.push({ id, ok: false, response: err instanceof Error ? err.message : String(err) });
				break; // keine Antwort mehr – Verbindung vermutlich gestört, weitere Versuche sinnlos
			}

			const ok = ack.startsWith('OK:');
			results.push({ id, ok, response: ack });
			if (ok) sent.push(id);

			if (ack === 'ERR:queue_full') break; // Queue voll – weitere Befehle würden ebenfalls abgelehnt

			if (i < ids.length - 1 && config.delayMs > 0) {
				await sleep(config.delayMs);
			}
		}

		const success = results.length === ids.length && results.every((r) => r.ok);
		const firstFailure = results.find((r) => !r.ok);
		return {
			success,
			sent,
			results,
			...(firstFailure ? { error: `Melder ${firstFailure.id}: ${firstFailure.response}` } : {})
		};
	} catch (err) {
		return {
			success: false,
			sent,
			results,
			error: err instanceof Error ? err.message : String(err)
		};
	} finally {
		try {
			await new Promise<void>((resolve) => port.close(() => resolve()));
		} catch (err) {
			console.warn('[pagerSerial] Fehler beim Schließen des Ports:', err);
		}
	}
}

export async function listSerialPorts() {
	return SerialPort.list();
}
