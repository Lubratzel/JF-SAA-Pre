# JF-SAA – Leitstellen- & Einsatzmonitor-System 

**JF-SAA** ist eine webbasierte Anwendung, die speziell für die **Jugendfeuerwehr** entwickelt wurde. Das System ermöglicht die Verwaltung und Erstellung von Einsätzen über eine digitale Leitstelle sowie die Echtzeit-Darstellung auf einem separaten Einsatzmonitor samt Alarmierung.

---

##  Features

* **Digitale Leitstelle:**
  * Einsätze einfach erstellen und bearbeiten.
  * Speicherung aller Einsatzdaten in einer leichten **SQLite-Datenbank**.
* **Einsatzmonitor:**
  * **Echtzeit-Prüfung:** Der Monitor prüft alle 5 Sekunden automatisch auf neue Einsätze.
  * **Interaktive Karte:** Visualisierung des Einsatzortes mittels **Leaflet Map**.
  * **Alarmierung:** Integrierte Schnittstelle/Funktion zur Auslösung eines Digitalen Meldeempfängers (DME/Melder).

---

## Technologien

Das Projekt basiert auf folgenden Frameworks und Werkzeugen:

| Komponente | Technologie |
| :--- | :--- |
| **Framework** | [SvelteKit](https://kit.svelte.dev/) |
| **Datenbank** | [SQLite](https://www.sqlite.org/) |
| **Kartenmaterial** | [Leaflet](https://leafletjs.com/) |
| **Versionsverwaltung** | GitHub |

---

## Installation & Einrichtung

### Voraussetzungen
* [Node.js](https://nodejs.org/) (aktuelle LTS-Version)
* `npm` oder ein anderer Paketmanager (z. B. `pnpm` oder `yarn`)

### Setup

```bash
npm install
npm run build
npm run preview
```

Für die Entwicklung ohne Produktivbuild reicht `npm run dev`.

---

## USB-Pager-Modul (serielle Verbindung) unter Windows

Die Alarmierung über das USB-Funkmodul (FirePager-Gateway) läuft über das npm-Paket
[`serialport`](https://www.npmjs.com/package/serialport) und greift direkt auf den seriellen
Port (z. B. `COM3` unter Windows) zu, an dem das Modul angeschlossen ist.

**Wichtig:** Der Node-Server muss dafür auf genau der Maschine laufen, an der das USB-Modul
physisch eingesteckt ist. Ein Cloud-Dev-Container/Codespace hat keinen Zugriff auf lokale
USB-Geräte – dort werden nie Ports gefunden, unabhängig vom Betriebssystem. Für den echten
Betrieb mit dem Modul muss die App lokal auf dem Windows-Rechner laufen:

1. Node.js (LTS) direkt unter Windows installieren (nicht in WSL, nicht im Devcontainer).
2. Projekt-Repo auf den Windows-Rechner klonen bzw. dorthin kopieren.
3. Dort frisch installieren – **nicht** `node_modules` von einem anderen Betriebssystem
   kopieren, da `serialport` eine native Komponente enthält, die pro Plattform gebaut wird:
   ```powershell
   npm install
   npm run build
   npm run preview
   ```
4. USB-Modul anschließen, im Windows-Geräte-Manager den COM-Port ablesen (z. B. `COM3`).
5. In den App-Einstellungen (`/settings`) unter „USB-Pager-Modul (seriell)“ auf
   **„Ports aktualisieren“** klicken – der Port sollte jetzt in der Liste erscheinen – oder den
   Port-Namen manuell eintragen und speichern.

Falls beim Laden der Ports ein Fehler wie `spawn udevadm ENOENT` erscheint, läuft der Server
in einer Linux-Umgebung (WSL/Container) ohne Zugriff auf die Windows-COM-Ports – dann Punkt 1–3
auf dem Windows-Rechner selbst wiederholen.
