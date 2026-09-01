/*
 * FirePager Alarmierungseinheit – Simulator
 *
 * Bildet das serielle Protokoll aus FirePager-Gateway.md nach, ohne echtes
 * SX1278-Funkmodul. Dient zum Testen der Leitstellen-Software gegen ein
 * reales ESP32-Board über USB.
 *
 * Verbindung: 115200 Baud, 8N1, Zeilenende \n
 */

#include <Arduino.h>

// ---- Timing (siehe "Übertragungsdauer" in FirePager-Gateway.md) ----
static const unsigned long TX_DURATION_MS = 1100;  // ca. 1,0–1,2 s pro Melder
static const unsigned long TX_PAUSE_MS = 300;       // Pause zwischen zwei Alarmen
static const unsigned long BOOT_STEP_DELAY_MS = 250;

static const int PAGER_ID_MIN = 1;
static const int PAGER_ID_MAX = 998;
static const size_t QUEUE_CAPACITY = 50;

int queueBuf[QUEUE_CAPACITY];
size_t queueHead = 0;
size_t queueCount = 0;

enum class TxState { IDLE, SENDING, PAUSING };
TxState txState = TxState::IDLE;
unsigned long txStateStartedAt = 0;
int txCurrentId = -1;

String lineBuf;

void queuePush(int id) {
	queueBuf[(queueHead + queueCount) % QUEUE_CAPACITY] = id;
	queueCount++;
}

int queuePop() {
	int id = queueBuf[queueHead];
	queueHead = (queueHead + 1) % QUEUE_CAPACITY;
	queueCount--;
	return id;
}

void sendBootSequence() {
	Serial.println("BOOT");
	delay(BOOT_STEP_DELAY_MS);
	Serial.println("OLED:OK");
	delay(BOOT_STEP_DELAY_MS);
	Serial.println("RADIO:OK");
	delay(BOOT_STEP_DELAY_MS);
	Serial.println("TIMER:OK");
	delay(BOOT_STEP_DELAY_MS);
	Serial.println("READY");
}

// Erwartet exakt "pager:<Ziffern>", führende Nullen erlaubt (werden ignoriert).
bool parsePagerCommand(const String& line, int& idOut) {
	if (!line.startsWith("pager:")) return false;
	String numPart = line.substring(6);
	if (numPart.length() == 0) return false;
	for (size_t i = 0; i < numPart.length(); i++) {
		if (!isDigit(numPart[i])) return false;
	}
	idOut = numPart.toInt();
	return true;
}

void handleLine(String line) {
	line.trim();
	if (line.length() == 0) return;

	int id;
	if (!parsePagerCommand(line, id)) {
		Serial.println("ERR:invalid");
		return;
	}

	if (id < PAGER_ID_MIN || id > PAGER_ID_MAX) {
		Serial.println("ERR:range");
		return;
	}

	if (queueCount >= QUEUE_CAPACITY) {
		Serial.println("ERR:queue_full");
		return;
	}

	queuePush(id);
	Serial.print("OK:");
	Serial.println(id);
}

// Nicht-blockierende Queue-Abarbeitung, damit eingehende serielle Daten
// währenddessen weiter verarbeitet werden können (wie auf der echten Einheit).
void pumpQueue() {
	unsigned long now = millis();

	switch (txState) {
		case TxState::IDLE:
			if (queueCount > 0) {
				txCurrentId = queuePop();
				Serial.print("TX:start:");
				Serial.println(txCurrentId);
				txStateStartedAt = now;
				txState = TxState::SENDING;
			}
			break;

		case TxState::SENDING:
			if (now - txStateStartedAt >= TX_DURATION_MS) {
				Serial.print("TX:done:");
				Serial.println(txCurrentId);
				txStateStartedAt = now;
				txState = TxState::PAUSING;
			}
			break;

		case TxState::PAUSING:
			if (now - txStateStartedAt >= TX_PAUSE_MS) {
				txState = TxState::IDLE;
			}
			break;
	}
}

void setup() {
	Serial.begin(115200);
	while (!Serial) {
		// warten bis USB-CDC bereit ist (bei manchen Boards nötig)
	}
	sendBootSequence();
}

void loop() {
	while (Serial.available() > 0) {
		char c = Serial.read();
		if (c == '\r') continue;
		if (c == '\n') {
			handleLine(lineBuf);
			lineBuf = "";
		} else {
			lineBuf += c;
		}
	}

	pumpQueue();
}
