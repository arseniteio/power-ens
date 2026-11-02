import { euiThemeVars } from '@osd/ui-shared-deps/theme';

export const ENS_THEME = {
  surface: euiThemeVars.euiColorEmptyShade,
  highlight: euiThemeVars.euiColorLightestShade,
  track: euiThemeVars.euiColorLightShade,
  border: euiThemeVars.euiBorderColor,
  subduedText: euiThemeVars.euiColorDarkShade,
  mutedText: euiThemeVars.euiColorMediumShade,
  dangerText: euiThemeVars.euiColorDangerText,
  primary: euiThemeVars.euiColorPrimary,
};

export const ENS_NO_RESULT_PATTERN = `repeating-linear-gradient(45deg, ${euiThemeVars.euiColorLightestShade}, ${euiThemeVars.euiColorLightestShade} 4px, ${euiThemeVars.euiColorLightShade} 4px, ${euiThemeVars.euiColorLightShade} 8px)`;
