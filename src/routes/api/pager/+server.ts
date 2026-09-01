import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { insertPager, insertManyPager } from '$lib/db/index';

export async function GET() {
    const res = await fetch('http://192.168.1.1/rollcall');
    const data = await res.json();
  
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }


export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();

    if (Array.isArray(body)) {
      insertManyPager(body);
    } else {
      insertPager(body);
    }

    return json({ success: true });
  } catch (err) {
    console.error('Fehler beim Einfügen der Pager:', err);
    return json({ error: 'Fehler beim Einfügen' }, { status: 500 });
  }
};