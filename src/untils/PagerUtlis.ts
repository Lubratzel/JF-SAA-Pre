import type {PageLoad} from "../../.svelte-kit/types/src/routes/$types";

export const keepAlive : PageLoad = async ({ fetch }) => {
    let isConnectedToBrt = false;

    try {
        const response = await fetch('http://192.168.0.1/ping');
        if (response.ok) {
            const result = await response.text();
            isConnectedToBrt = result.includes("pong"); // oder z. B. "pong"
        }
    } catch (error) {
        console.warn('Nicht im BrT Netzwerk oder Gerät nicht erreichbar:', error);
    }

    return {
        isConnectedToBrt
    };
};

export const rollcallPager = async () => {
    try {
      const res = await fetch('/api/pager');
      if (!res.ok) throw new Error('Fehler beim Abrufen');
  
      const rawData = await res.json();

    
      const pager = Object.entries(rawData);
      
      return { pager };
    } catch (err) {
      console.warn('Fehler beim Abrufen der Pager:', err);
      return { pager: [] };
    }
  };
  


export const startAlarm = async (ids: any, msg: string, duration?: number) => {
    let responseData = null;

    const formData = new FormData();
    formData.append('nodeIds', JSON.stringify(ids)); // Array als String
    formData.append('msg', msg);

    // Duration nur anhängen, wenn es übergeben wurde
    if (duration !== undefined) {
        formData.append('duration', duration.toString());
    }

    try {
        const response = await fetch('http://192.168.1.1/startAlarm', {
            method: 'POST',
            body: formData, // ✔️ echte FormData
        });

        if (response.ok) {
            responseData = await response.json();
        } else {
            console.warn('Fehler beim Abrufen der Pager:', response.status);
        }
    } catch (error) {
        console.warn('Nicht im BrT Netzwerk oder Gerät nicht erreichbar:', error);
    }

    return responseData;
};

/**
 * Löst einen oder mehrere Pager über das lokal angeschlossene USB-Funkmodul aus.
 * Sendet je Pager einen eigenen "pager:<id>"-Befehl über die serielle Schnittstelle,
 * mit Delay dazwischen (konfigurierbar in pager-serial.config.json).
 */
export const triggerSerialPager = async (ids: (number | string)[] | number | string) => {
    const idList = Array.isArray(ids) ? ids : [ids];

    try {
        const response = await fetch('/api/pager/serial', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: idList })
        });

        const data = await response.json();

        if (!response.ok) {
            console.warn('Fehler beim Ansteuern des USB-Pager-Moduls:', data?.error);
        }

        return data;
    } catch (error) {
        console.warn('USB-Pager-Modul nicht erreichbar:', error);
        return { success: false, sent: [], error: String(error) };
    }
};

export const stopAlarm = async (ids: any) => {
        let responseData = null;
    
        const formData = new FormData();
        formData.append('nodeIds', JSON.stringify(ids));
       

        try {
            const response = await fetch('http://192.168.1.1/stopAlarm', {
                method: 'POST',
                body: formData,
            });
    
            if (response.ok) {
                responseData = await response.json();
            } else {
                console.warn('Fehler beim Abrufen der Pager:', response.status);
            }
        } catch (error) {
            console.warn('Nicht im BrT Netzwerk oder Gerät nicht erreichbar:', error);
        }
    
        return responseData;
   
};



