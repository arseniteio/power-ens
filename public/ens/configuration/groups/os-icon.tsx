import React from 'react';
import { getHttp } from '../../../services';
import type { ENSOsKind } from './os-kind';

export { osKindOf } from './os-kind';
export type { ENSOsKind } from './os-kind';

// Own simplified glyphs in each system's colours, not the vendors' artwork; the penguin covers any other Linux.
// The Wazuh manager shows the Wazuh mark that the dashboard itself serves.
const WAZUH_MARK_PATH = '/ui/logos/wazuh_mark_on_light.svg';

const OS_NAMES: Record<ENSOsKind, string> = {
  wazuh: 'Manager de Wazuh',
  windows: 'Windows',
  apple: 'macOS',
  ubuntu: 'Ubuntu',
  debian: 'Debian',
  rhel: 'Red Hat Enterprise Linux',
  rocky: 'Rocky Linux',
  alma: 'AlmaLinux',
  centos: 'CentOS',
  fedora: 'Fedora',
  oracle: 'Oracle Linux',
  amazon: 'Amazon Linux',
  suse: 'SUSE',
  linux: 'Linux',
  other: 'Otro sistema',
};

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

const UbuntuGlyph = () => (
  <g>
    <circle cx='12' cy='12' r='11' fill='#e95420' />
    <circle cx='12' cy='12' r='5.5' fill='none' stroke='#ffffff' strokeWidth='2' />
    <circle cx='12' cy='5.2' r='2.2' fill='#ffffff' />
    <circle cx='6.1' cy='15.4' r='2.2' fill='#ffffff' />
    <circle cx='17.9' cy='15.4' r='2.2' fill='#ffffff' />
  </g>
);

const DebianGlyph = () => (
  <path
    d='M13 21 C6.5 21 3 16.5 3 11.5 C3 6.5 7 3 12 3 C17 3 20.5 6.5 20.5 11 C20.5 15 17.5 17.5 14 17.5 C10.8 17.5 8.5 15.2 8.5 12.2 C8.5 9.6 10.4 7.8 12.6 7.8 C14.6 7.8 16 9.2 16 11'
    fill='none'
    stroke='#a80030'
    strokeWidth='2.4'
    strokeLinecap='round'
  />
);

const HatGlyph = ({ color }: { color: string }) => (
  <g fill={color}>
    <path d='M6.5 13 L8 7.5 C8.4 6 9.5 5.3 11 5.6 L14 6.3 C15.5 6.6 16.3 7.6 16.6 9 L17.5 13 Z' />
    <ellipse cx='12' cy='15' rx='10' ry='3.4' />
  </g>
);

const MountainGlyph = () => (
  <g>
    <circle cx='12' cy='12' r='11' fill='#10b981' />
    <path d='M4.5 17.5 L10 9.5 L13 13.5 L15 11 L19.5 17.5 Z' fill='#ffffff' />
  </g>
);

const AmazonGlyph = () => (
  <g>
    <rect x='1' y='1' width='22' height='22' rx='4' fill='#232f3e' />
    <path d='M5 13.5 C9 16.5 15 16.5 19 13.5' fill='none' stroke='#ff9900' strokeWidth='2' strokeLinecap='round' />
    <path d='M16.8 12.3 L19.4 13.3 L18.6 16' fill='none' stroke='#ff9900' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round' />
  </g>
);

const LetterGlyph = ({ letter, color }: { letter: string; color: string }) => (
  <g>
    <rect x='1' y='1' width='22' height='22' rx='5' fill={color} />
    <text x='12' y='16.5' textAnchor='middle' fontSize='13' fontWeight='700' fontFamily='Inter, Arial, sans-serif' fill='#ffffff'>
      {letter}
    </text>
  </g>
);

const OtherGlyph = () => (
  <g fill='none' stroke='#4d5260' strokeWidth='1.8'>
    <rect x='3' y='4' width='18' height='12' rx='1.5' />
    <path d='M8 20 H16 M12 16 V20' />
  </g>
);

const GLYPHS: Record<Exclude<ENSOsKind, 'wazuh'>, () => JSX.Element> = {
  windows: WindowsGlyph,
  apple: AppleGlyph,
  ubuntu: UbuntuGlyph,
  debian: DebianGlyph,
  rhel: () => <HatGlyph color='#ee0000' />,
  centos: () => <LetterGlyph letter='C' color='#932279' />,
  rocky: MountainGlyph,
  alma: () => <LetterGlyph letter='A' color='#0f4266' />,
  fedora: () => <LetterGlyph letter='f' color='#3c6eb4' />,
  oracle: () => <LetterGlyph letter='O' color='#c74634' />,
  amazon: AmazonGlyph,
  suse: () => <LetterGlyph letter='S' color='#30ba78' />,
  linux: PenguinGlyph,
  other: OtherGlyph,
};

export const OsIcon = ({ kind, size = 20 }: { kind: ENSOsKind; size?: number }) =>
  kind === 'wazuh' ? (
    <img
      src={getHttp().basePath.prepend(WAZUH_MARK_PATH)}
      width={size}
      height={size}
      alt={OS_NAMES.wazuh}
      title={OS_NAMES.wazuh}
      style={{ flexShrink: 0, verticalAlign: 'middle', objectFit: 'contain' }}
    />
  ) : (
    <svg width={size} height={size} viewBox='0 0 24 24' role='img' aria-label={OS_NAMES[kind]} style={{ flexShrink: 0, verticalAlign: 'middle' }}>
      <title>{OS_NAMES[kind]}</title>
      {React.createElement(GLYPHS[kind])}
    </svg>
  );
