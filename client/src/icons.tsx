/**
 * Hand-rolled icons on a 24px grid, 1.75 stroke, inheriting currentColor. Inline SVG
 * rather than an icon font or sprite sheet: no extra request, no dependency, and they
 * tree-shake with the rest of the bundle.
 */
interface IconProps {
  size?: number;
  className?: string;
}

function Svg({ size = 20, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.75}
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
      focusable='false'
    >
      {children}
    </svg>
  );
}

/* ---- navigation ---- */

export function Compass(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx='12' cy='12' r='9' />
      <path d='M15.6 8.4 13.8 13.8 8.4 15.6 10.2 10.2Z' />
    </Svg>
  );
}

export function MapPin(props: IconProps) {
  return (
    <Svg {...props}>
      <path d='M20 10c0 5-8 12-8 12s-8-7-8-12a8 8 0 0 1 16 0Z' />
      <circle cx='12' cy='10' r='2.75' />
    </Svg>
  );
}

export function Tag(props: IconProps) {
  return (
    <Svg {...props}>
      <path d='M3 12.6V4a1 1 0 0 1 1-1h8.6a2 2 0 0 1 1.4.6l6.4 6.4a2 2 0 0 1 0 2.8l-7.6 7.6a2 2 0 0 1-2.8 0L3.6 14a2 2 0 0 1-.6-1.4Z' />
      <circle cx='8' cy='8' r='1.4' />
    </Svg>
  );
}

/* ---- weather ---- */

export function Umbrella(props: IconProps) {
  return (
    <Svg {...props}>
      <path d='M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9Z' />
      <path d='M12 12v6.5a2.5 2.5 0 0 0 5 0' />
    </Svg>
  );
}

export function Sun(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx='12' cy='12' r='4' />
      <path d='M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4' />
    </Svg>
  );
}

export function Wind(props: IconProps) {
  return (
    <Svg {...props}>
      <path d='M3 8h11a3 3 0 1 0-3-3M3 16h8a3 3 0 1 1-3 3M3 12h15a3 3 0 1 0-3-3' />
    </Svg>
  );
}

export function Thermometer(props: IconProps) {
  return (
    <Svg {...props}>
      <path d='M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z' />
    </Svg>
  );
}

/* ---- place attributes ---- */

export function Car(props: IconProps) {
  return (
    <Svg {...props}>
      <path d='M5 17h14M4 17v-4.2L5.8 8A2 2 0 0 1 7.7 6.6h8.6A2 2 0 0 1 18.2 8L20 12.8V17' />
      <path d='M4 12.8h16' />
      <circle cx='7.5' cy='17' r='1.4' />
      <circle cx='16.5' cy='17' r='1.4' />
    </Svg>
  );
}

export function Train(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x='5' y='3.5' width='14' height='13' rx='3.5' />
      <path d='M5 10h14' />
      <circle cx='9' cy='13.3' r='0.9' fill='currentColor' stroke='none' />
      <circle cx='15' cy='13.3' r='0.9' fill='currentColor' stroke='none' />
      <path d='M8.5 16.5 6.5 20.5M15.5 16.5l2 4' />
    </Svg>
  );
}

export function Clock(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx='12' cy='12' r='9' />
      <path d='M12 7v5.3l3.2 2' />
    </Svg>
  );
}

export function Coin(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx='12' cy='12' r='9' />
      <path d='M14.6 9.2a3 3 0 0 0-5.1 2.1c0 2.6 5.1 1.5 5.1 4a3 3 0 0 1-5.2 2M12 6.2v11.6' />
    </Svg>
  );
}

export function Tree(props: IconProps) {
  return (
    <Svg {...props}>
      <path d='M12 3 5.5 12.5h3.2L4.5 18h15L15.3 12.5h3.2Z' />
      <path d='M12 18v3' />
    </Svg>
  );
}

export function Parking(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x='3.5' y='3.5' width='17' height='17' rx='4.5' />
      <path d='M10 16.5v-9h2.9a2.9 2.9 0 0 1 0 5.8H10' />
    </Svg>
  );
}

export function Toilet(props: IconProps) {
  return (
    <Svg {...props}>
      <path d='M6 3.5v6.2M3.6 3.5v3.1a2.4 2.4 0 0 0 4.8 0V3.5M6 9.7v10.8' />
      <circle cx='16.5' cy='4.6' r='1.6' />
      <path d='M16.5 7.6c-2 0-2.9 1.2-2.9 3v3.2h1.5v6.7h2.8v-6.7h1.5V10.6c0-1.8-.9-3-2.9-3Z' />
    </Svg>
  );
}

export function Food(props: IconProps) {
  return (
    <Svg {...props}>
      <path d='M6 3v7a2.4 2.4 0 0 0 4.8 0V3M8.4 10.2V21' />
      <path d='M6 3v4.4M9.2 3v4.4' />
      <path d='M17.4 3c-1.7 1.2-2.4 3-2.4 5.2 0 1.9.8 3 2.4 3.3V21' />
    </Svg>
  );
}

export function Sparkle(props: IconProps) {
  return (
    <Svg {...props}>
      <path d='M12 3.5 13.9 9 19.5 11 13.9 13 12 18.5 10.1 13 4.5 11 10.1 9Z' />
    </Svg>
  );
}

/* ---- interface ---- */

export function ChevronRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d='m9.5 5.5 6.5 6.5-6.5 6.5' />
    </Svg>
  );
}

export function ChevronDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d='m5.5 9.5 6.5 6.5 6.5-6.5' />
    </Svg>
  );
}

export function Plus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d='M12 5v14M5 12h14' />
    </Svg>
  );
}

export function Search(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx='11' cy='11' r='6.5' />
      <path d='m16 16 4.5 4.5' />
    </Svg>
  );
}

export function Close(props: IconProps) {
  return (
    <Svg {...props}>
      <path d='m6.5 6.5 11 11M17.5 6.5l-11 11' />
    </Svg>
  );
}

export function Check(props: IconProps) {
  return (
    <Svg {...props}>
      <path d='m5 12.5 4.5 4.5L19 7' />
    </Svg>
  );
}

export function Pencil(props: IconProps) {
  return (
    <Svg {...props}>
      <path d='M4 20h4L19.2 8.8a2.4 2.4 0 0 0-3.4-3.4L4.6 16.6Z' />
      <path d='m14.8 6.6 2.6 2.6' />
    </Svg>
  );
}

export function Archive(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x='3.5' y='4' width='17' height='4.2' rx='1.6' />
      <path d='M5.2 8.2V19a1.8 1.8 0 0 0 1.8 1.8h10a1.8 1.8 0 0 0 1.8-1.8V8.2' />
      <path d='M10 12.2h4' />
    </Svg>
  );
}

export function Trash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d='M4.5 6.5h15M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5' />
      <path d='M6.5 6.5V19A1.8 1.8 0 0 0 8.3 20.8h7.4A1.8 1.8 0 0 0 17.5 19V6.5' />
    </Svg>
  );
}

export function ExternalLink(props: IconProps) {
  return (
    <Svg {...props}>
      <path d='M13.5 4.5H19.5V10.5M19.5 4.5 11 13' />
      <path d='M18 14.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5' />
    </Svg>
  );
}

export function Dice(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x='3.5' y='3.5' width='17' height='17' rx='4.5' />
      <circle cx='8.6' cy='8.6' r='1.15' fill='currentColor' stroke='none' />
      <circle cx='15.4' cy='15.4' r='1.15' fill='currentColor' stroke='none' />
      <circle cx='12' cy='12' r='1.15' fill='currentColor' stroke='none' />
    </Svg>
  );
}

export function Sliders(props: IconProps) {
  return (
    <Svg {...props}>
      <path d='M4 8h9M17 8h3M4 16h3M11 16h9' />
      <circle cx='15' cy='8' r='2.2' />
      <circle cx='9' cy='16' r='2.2' />
    </Svg>
  );
}

export function Calendar(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x='3.5' y='5' width='17' height='15.5' rx='3' />
      <path d='M3.5 10h17M8 3.5V6.5M16 3.5V6.5' />
    </Svg>
  );
}
