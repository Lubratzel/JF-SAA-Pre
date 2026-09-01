// Gemeinsame Sprachausgabe-Bausteine für den Monitor (Ansagen bei neuem Einsatz,
// Nachalarmierung und Einsatzstufen-Erhöhung) – client- und serverseitig nutzbar.

export function speakPartFuerMark(mark: string): string {
	if (mark.startsWith('B')) return 'Brand ' + mark.slice(1, 2);
	if (mark.startsWith('H')) return 'Hilfeleistung ' + mark.slice(1, 2);
	return mark.slice(1, 2);
}

// PLZ aus der Adresse entfernen, damit die Ansage nicht "sechsundsechzigtausend..." vorliest
export function bereinigeOrtFuerAnsage(locString: string | null | undefined): string {
	return locString ? locString.replace(/\b\d{5}\b\s*/g, '') : '';
}
