import { json } from '@sveltejs/kit';
import {
  getAlarmSound,
  setAlarmSound,
  getDispatcherName,
  setDispatcherName,
  getFeuerwehrName,
  setFeuerwehrName,
  getStationPosition,
  setStationPosition,
  isSetupCompleted,
  setSetupCompleted
} from '$lib/db/index';
import type { RequestHandler } from '@sveltejs/kit';

export async function GET() {
  const station = getStationPosition();
  return json({
    alarmSound: getAlarmSound(),
    dispatcherName: getDispatcherName(),
    feuerwehrName: getFeuerwehrName(),
    stationLat: station?.lat ?? null,
    stationLng: station?.lng ?? null,
    setupCompleted: isSetupCompleted()
  });
}

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { alarmSound, dispatcherName, feuerwehrName, stationLat, stationLng, setupCompleted } = body;

  if (alarmSound !== undefined) setAlarmSound(alarmSound);
  if (dispatcherName !== undefined) setDispatcherName(dispatcherName);
  if (feuerwehrName !== undefined) setFeuerwehrName(feuerwehrName);
  if (stationLat !== undefined && stationLng !== undefined) {
    setStationPosition(stationLat, stationLng);
  }
  if (setupCompleted) setSetupCompleted();

  return json({ success: true });
};
