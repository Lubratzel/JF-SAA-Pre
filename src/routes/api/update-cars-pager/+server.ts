import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { updateCarPager } from '$lib/db';

// POST /api/update-cars-pager  [{ id, pager: number[] }, ...]
export const POST: RequestHandler = async ({ request }) => {
  const cars: { id: number; pager: number[] }[] = await request.json();

  for (const car of cars) {
    updateCarPager(car.id, Array.isArray(car.pager) ? car.pager : []);
  }

  return json({ success: true });
};
