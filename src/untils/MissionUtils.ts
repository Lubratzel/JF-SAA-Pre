import { newMission } from "../stores/mission.store";

export interface Address {
    house_number?: string;
    road?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    postcode?: string;
    state?: string;
    country?: string;
}


export function formatAddress(address: Address): string {
    const street = [address.road, address.house_number].filter(Boolean).join(" ");
    const city = address.village || address.town || address.city || "Ort nicht verfügbar";
    const postcode = address.postcode || "PLZ nicht verfügbar";
    const state = address.state || "Bundesland nicht verfügbar";
    const country = address.country || "Land nicht verfügbar";

    return `${street}, ${postcode} ${city}`;
}

