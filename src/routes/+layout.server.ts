import { redirect } from '@sveltejs/kit';
import { isSetupCompleted, getFeuerwehrName } from '$lib/db';

export const load = ({ url }) => {
  if (!isSetupCompleted() && url.pathname !== '/setup') {
    throw redirect(307, '/setup');
  }

  return {
    feuerwehrName: getFeuerwehrName()
  };
};
