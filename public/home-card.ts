import { ENSFACIL_APP_TITLE, ENSFACIL_PLUGIN_ID } from '../common/constants';

// ENSFácil card on the OpenSearch Dashboards home (/app/home, 'Manage your data'). Wazuh's home builds a fixed list of cards and offers no extension point, so there ENSFácil only appears in the menu.
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

export const HOME_CARD_DESCRIPTION =
  'Cumplimiento del Esquema Nacional de Seguridad: controles, evidencias, no conformidades e informes.';

export const buildHomeCard = (icon: string): HomeFeatureCatalogueEntry => ({
  id: ENSFACIL_PLUGIN_ID,
  title: ENSFACIL_APP_TITLE,
  description: HOME_CARD_DESCRIPTION,
  icon,
  path: `/app/${ENSFACIL_PLUGIN_ID}`,
  showOnHomePage: true,
  category: 'admin',
});

// Registers the card if the dashboard has the `home` plugin. Without it, or if registration fails (repeated id), the plugin still loads: the card is an extra entry, not a dependency.
export const registerHomeCard = (home: HomeSetupLike | undefined, icon: string): boolean => {
  if (!home?.featureCatalogue) return false;
  try {
    home.featureCatalogue.register(buildHomeCard(icon));
    return true;
  } catch {
    return false;
  }
};
