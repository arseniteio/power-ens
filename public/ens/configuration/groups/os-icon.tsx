import React from 'react';

// Own generic glyphs, not the vendors' trademarks: four panes for Windows, a penguin for Linux.
export type ENSOsKind = 'windows' | 'linux' | 'apple' | 'other';

export const osKindOf = (host: { family?: string; distro?: string; os?: { platform?: string; name?: string } }): ENSOsKind => {
  const text = `${host.family || ''} ${host.distro || ''} ${host.os?.platform || ''} ${host.os?.name || ''}`.toLowerCase();
  if (text.includes('windows')) return 'windows';
  if (text.includes('darwin') || text.includes('macos')) return 'apple';
  if (/linux|ubuntu|debian|rhel|rocky|alma|centos|fedora|suse|amazon|alpine|arch/.test(text)) return 'linux';
  return 'other';
};

const OS_NAMES: Record<ENSOsKind, string> = { windows: 'Windows', linux: 'Linux', apple: 'macOS', other: 'Otro sistema' };

const WindowsGlyph = () => (
  <g fill='#2f6fbf'>
    <rect x='2' y='2' width='9' height='9' rx='1' />
    <rect x='13' y='2' width='9' height='9' rx='1' />
    <rect x='2' y='13' width='9' height='9' rx='1' />
    <rect x='13' y='13' width='9' height='9' rx='1' />
  </g>
);

const PenguinGlyph = () => (
  <g>
    <ellipse cx='12' cy='13' rx='7' ry='9' fill='#1f2328' />
    <ellipse cx='12' cy='15' rx='4.5' ry='6.5' fill='#ffffff' />
    <circle cx='10' cy='8' r='1.2' fill='#ffffff' />
    <circle cx='14' cy='8' r='1.2' fill='#ffffff' />
    <path d='M10.5 10.2 L13.5 10.2 L12 12 Z' fill='#e8a317' />
    <ellipse cx='8.5' cy='22' rx='2.5' ry='1.2' fill='#e8a317' />
    <ellipse cx='15.5' cy='22' rx='2.5' ry='1.2' fill='#e8a317' />
  </g>
);

const AppleGlyph = () => (
  <g fill='#4d5260'>
    <circle cx='12' cy='14' r='7.5' />
    <rect x='11.2' y='3' width='1.6' height='5' rx='0.8' />
  </g>
);

const OtherGlyph = () => (
  <g fill='none' stroke='#4d5260' strokeWidth='1.8'>
    <rect x='3' y='4' width='18' height='12' rx='1.5' />
    <path d='M8 20 H16 M12 16 V20' />
  </g>
);

export const OsIcon = ({ kind, size = 20 }: { kind: ENSOsKind; size?: number }) => (
  <svg width={size} height={size} viewBox='0 0 24 24' role='img' aria-label={OS_NAMES[kind]} style={{ flexShrink: 0, verticalAlign: 'middle' }}>
    <title>{OS_NAMES[kind]}</title>
    {kind === 'windows' && <WindowsGlyph />}
    {kind === 'linux' && <PenguinGlyph />}
    {kind === 'apple' && <AppleGlyph />}
    {kind === 'other' && <OtherGlyph />}
  </svg>
);
