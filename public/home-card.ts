import { POWER_ENS_APP_TITLE, POWER_ENS_PLUGIN_ID } from '../common/constants';

export interface HomeFeatureCatalogueEntry {
  id: string;
  title: string;
  description: string;
  icon: string;
  path: string;
  showOnHomePage: boolean;
  category: 'admin' | 'data' | 'other';
  order?: number;
}

export interface HomeSetupLike {
  featureCatalogue?: { register(entry: HomeFeatureCatalogueEntry): void };
}

const HOME_CARD_DESCRIPTION =
  'Cumplimiento del Esquema Nacional de Seguridad: controles, evidencias, no conformidades e informes.';

const buildHomeCard = (icon: string): HomeFeatureCatalogueEntry => ({
  id: POWER_ENS_PLUGIN_ID,
  title: POWER_ENS_APP_TITLE,
  description: HOME_CARD_DESCRIPTION,
  icon,
  path: `/app/${POWER_ENS_PLUGIN_ID}`,
  showOnHomePage: true,
  category: 'admin',
});

export const registerHomeCard = (home: HomeSetupLike | undefined, icon: string): boolean => {
  if (!home?.featureCatalogue) return false;
  try {
    home.featureCatalogue.register(buildHomeCard(icon));
    return true;
  } catch {
    return false;
  }
};
