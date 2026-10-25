export const COLOR = {
  STONE: {
    200: 0xf5f5f4,
    400: 0xa6a09b,
    600: 0x78716c,
    700: 0x44403b,
    800: 0x292524,
    900: 0x1c1917,
    950: 0x171514,
  },
};

const THEME = {
  light: {
    background: COLOR.STONE[200],
    grid: COLOR.STONE[400],
    shadow: COLOR.STONE[800],
    shadowOpacity: 0.3,
    walls: COLOR.STONE[200],
  },
  dark: {
    background: COLOR.STONE[900],
    grid: COLOR.STONE[700],
    shadow: 0x000000,
    shadowOpacity: 0.5,
    walls: COLOR.STONE[600],
  },
};

export type Theme = typeof THEME.light;

export function watchColorScheme(apply: (theme: Theme) => void) {
  const darkModeWatcher = window.matchMedia('(prefers-color-scheme: dark)');
  const update = () => apply(darkModeWatcher.matches ? THEME.dark : THEME.light);
  update();
  darkModeWatcher.addEventListener('change', update);
  return () => darkModeWatcher.removeEventListener('change', update);
}
