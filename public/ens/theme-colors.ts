// Los colores neutros de las pantallas (fondos, bordes, texto secundario), de
// las variables del tema de OpenSearch Dashboards: siguen el modo oscuro. Un
// blanco o un gris claro escritos a mano se quedaban claros con el tema
// oscuro (la columna fija de la matriz era una franja blanca). Los colores de
// estado (`status-colors.ts`) son datos y valen en los dos temas.
import { euiThemeVars } from '@osd/ui-shared-deps/theme';

export const ENS_THEME = {
  // El fondo de una tabla o un panel (la columna fija de la matriz).
  surface: euiThemeVars.euiColorEmptyShade,
  // La fila o la columna de la máquina elegida.
  highlight: euiThemeVars.euiColorLightestShade,
  // El hueco de una barra y los bordes de lo que aún no tiene resultado.
  track: euiThemeVars.euiColorLightShade,
  // Texto secundario y lo que está apagado.
  subduedText: euiThemeVars.euiColorDarkShade,
  mutedText: euiThemeVars.euiColorMediumShade,
  dangerText: euiThemeVars.euiColorDangerText,
  primary: euiThemeVars.euiColorPrimary,
};

// Sin resultado (no se mide aquí): rayado, nunca un gris de estado.
export const ENS_NO_RESULT_PATTERN = `repeating-linear-gradient(45deg, ${euiThemeVars.euiColorLightestShade}, ${euiThemeVars.euiColorLightestShade} 4px, ${euiThemeVars.euiColorLightShade} 4px, ${euiThemeVars.euiColorLightShade} 8px)`;
