import {deleteCar, getAllCars} from "$lib/db";
import { json, type RequestHandler } from "@sveltejs/kit";


export function GET() {
    const cars = getAllCars();
    return json(cars);
}

export const DELETE: RequestHandler = async ({ request }) => {
    const { name }: { name: string } = await request.json();
  
    if (!name) {
      return json({ success: false, error: 'Name fehlt' }, { status: 400 });
    }
  
    const result = deleteCar(name);
  
    return json({ success: true, changes: result.changes });
  };