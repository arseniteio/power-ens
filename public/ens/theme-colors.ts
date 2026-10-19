// Neutral screen colours from the OpenSearch Dashboards theme variables, so they follow dark mode; hand-written whites and greys stayed light in the dark theme.
import { euiThemeVars } from '@osd/ui-shared-deps/theme';

export const ENS_THEME = {
  surface: euiThemeVars.euiColorEmptyShade,
  highlight: euiThemeVars.euiColorLightestShade,
  track: euiThemeVars.euiColorLightShade,
  subduedText: euiThemeVars.euiColorDarkShade,
  mutedText: euiThemeVars.euiColorMediumShade,
  dangerText: euiThemeVars.euiColorDangerText,
  primary: euiThemeVars.euiColorPrimary,
};

// No result (not measured here): striped, never a status grey.
export const ENS_NO_RESULT_PATTERN = `repeating-linear-gradient(45deg, ${euiThemeVars.euiColorLightestShade}, ${euiThemeVars.euiColorLightestShade} 4px, ${euiThemeVars.euiColorLightShade} 4px, ${euiThemeVars.euiColorLightShade} 8px)`;
