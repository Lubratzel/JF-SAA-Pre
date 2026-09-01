import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { addCar } from '$lib/db/index';

export const POST: RequestHandler = async ({ request }) => {
  const { name }: { name: string } = await request.json();

  if (!name) {
    return json({ success: false, error: 'Name fehlt' }, { status: 400 });
  }

  const result = addCar(name);
  return json({ success: true, changes: result.changes });
};
