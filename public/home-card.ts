import { ENSFACIL_APP_TITLE, ENSFACIL_PLUGIN_ID } from '../common/constants';

// Tarjeta de ENSFácil en la portada de OpenSearch Dashboards (/app/home,
// sección «Manage your data»). La portada de Wazuh (wz-home) construye sus
// tarjetas con una lista fija dentro del plugin de Wazuh y no ofrece ningún
// punto de extensión: allí ENSFácil solo aparece en el menú lateral.
//
// El plugin `home` es opcional y su tipo se declara aquí, sin importarlo: el
// plugin solo depende del núcleo (tests/standalone-imports.test.ts).
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

// Registra la tarjeta si el dashboard trae el plugin `home`. Sin él, o si el
// registro falla (id repetido), el plugin sigue cargando: la tarjeta es un
// acceso más, no una dependencia.
export const registerHomeCard = (home: HomeSetupLike | undefined, icon: string): boolean => {
  if (!home?.featureCatalogue) return false;
  try {
    home.featureCatalogue.register(buildHomeCard(icon));
    return true;
  } catch {
    return false;
  }
};
