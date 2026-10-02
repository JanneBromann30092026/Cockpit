import { useId } from 'react';
import { motion, type Variants } from 'motion/react';

export type GaugeState = 'idle' | 'working' | 'success' | 'error';

/** Geometry of the app icon (public/icons/favicon.svg): center, scale radius and range. */
const CX = 256;
const CY = 264;
const SCALE_R = 150;
const START = -120;
const END = 120;
/** Needle angle of the app icon; the unlock moment ends here. */
const ICON_ANGLE = 38;
const REST_ANGLE = -112;

function point(radius: number, degrees: number): [number, number] {
  const rad = (degrees * Math.PI) / 180;
  return [CX + radius * Math.sin(rad), CY - radius * Math.cos(rad)];
}

const f = (value: number) => Math.round(value * 10) / 10;

function arc(radius: number, from: number, to: number): string {
  const [x0, y0] = point(radius, from);
  const [x1, y1] = point(radius, to);
  const large = to - from > 180 ? 1 : 0;
  return `M${f(x0)} ${f(y0)} A${radius} ${radius} 0 ${large} 1 ${f(x1)} ${f(y1)}`;
}

function tick(angle: number, inner: number): string {
  const [x0, y0] = point(126, angle);
  const [x1, y1] = point(inner, angle);
  return `M${f(x0)} ${f(y0)} L${f(x1)} ${f(y1)}`;
}

const MAJOR_TICKS = Array.from({ length: 9 }, (_, i) => tick(START + i * 30, 104));
const MINOR_TICKS = Array.from({ length: 8 }, (_, i) => tick(START + 15 + i * 30, 114));
const SCALE_PATH = arc(SCALE_R, START, END);

/** Share of the scale that is lit when the needle points at `angle`. */
const lit = (angle: number) => (angle - START) / (END - START);

const spring = { type: 'spring', stiffness: 140, damping: 12 } as const;

const needleVariants: Variants = {
  idle: { rotate: REST_ANGLE, transition: { type: 'spring', stiffness: 170, damping: 26 } },
  // Measuring while the key is derived.
  working: {
    rotate: [REST_ANGLE, 40, -60, 80],
    transition: { duration: 1.6, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' },
  },
  // Swings to the position of the app icon and settles.
  success: { rotate: ICON_ANGLE, transition: spring },
  error: {
    rotate: [REST_ANGLE, -92, -118, -104, REST_ANGLE],
    transition: { duration: 0.45, ease: 'easeInOut' },
  },
};

const scaleVariants: Variants = {
  idle: { pathLength: lit(REST_ANGLE), transition: { duration: 0.4 } },
  working: {
    pathLength: [lit(REST_ANGLE), lit(40), lit(-60), lit(80)],
    transition: { duration: 1.6, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' },
  },
  success: { pathLength: lit(ICON_ANGLE), transition: spring },
  error: { pathLength: lit(REST_ANGLE), transition: { duration: 0.3 } },
};

const glowVariants: Variants = {
  idle: { opacity: 0.35, scale: 0.9 },
  working: {
    opacity: [0.35, 0.6, 0.35],
    scale: 1,
    transition: { duration: 1.6, repeat: Infinity },
  },
  success: { opacity: [0.9, 0.55], scale: [0.9, 1.25], transition: { duration: 0.9 } },
  error: { opacity: 0.35, scale: 0.9 },
};

/**
 * The app icon as a living instrument: the needle measures while the password is checked
 * and swings into place when the app unlocks, lighting up the scale (key moment).
 */
export function GaugeMark({ state, size = 112 }: { state: GaugeState; size?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <div className="relative" style={{ width: size, height: size }} data-state={state}>
      <motion.div
        aria-hidden
        className="lock-glow pointer-events-none absolute -inset-1/2 rounded-full"
        variants={glowVariants}
        initial="idle"
        animate={state}
      />
      <svg
        viewBox="0 0 512 512"
        width={size}
        height={size}
        aria-hidden
        className="relative drop-shadow-[0_18px_40px_var(--shadow-color)]"
      >
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1D44B8" />
            <stop offset="0.55" stopColor="#0C1C55" />
            <stop offset="1" stopColor="#050B26" />
          </linearGradient>
          <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="52%">
            <stop offset="0" stopColor="#4F7DFF" stopOpacity="0.32" />
            <stop offset="1" stopColor="#4F7DFF" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${uid}-scale`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#4F7DFF" />
            <stop offset="1" stopColor="#A9C1FF" />
          </linearGradient>
        </defs>
        <rect width="512" height="512" rx="112" fill={`url(#${uid}-bg)`} />
        <rect width="512" height="512" rx="112" fill={`url(#${uid}-glow)`} />
        <circle
          cx={CX}
          cy={CY}
          r="182"
          fill="none"
          stroke="#E8EEFF"
          strokeOpacity="0.18"
          strokeWidth="6"
        />
        <path
          d={SCALE_PATH}
          fill="none"
          stroke="#E8EEFF"
          strokeOpacity="0.14"
          strokeWidth="16"
          strokeLinecap="round"
        />
        <motion.path
          d={SCALE_PATH}
          fill="none"
          stroke={`url(#${uid}-scale)`}
          strokeWidth="16"
          strokeLinecap="round"
          variants={scaleVariants}
          initial="idle"
          animate={state}
        />
        <g stroke="#E8EEFF" strokeLinecap="round" fill="none">
          <g strokeOpacity="0.85" strokeWidth="7">
            {MAJOR_TICKS.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
          <g strokeOpacity="0.35" strokeWidth="5">
            {MINOR_TICKS.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        </g>
        {/* Drawn pointing up; the invisible circle centers the rotation on the hub. */}
        <motion.g variants={needleVariants} initial="idle" animate={state}>
          <circle cx={CX} cy={CY} r={SCALE_R} fill="none" />
          <path d={`M${CX} ${CY - SCALE_R} L${CX - 19} ${CY} L${CX} ${CY + 48} Z`} fill="#FFE27A" />
          <path d={`M${CX} ${CY - SCALE_R} L${CX + 19} ${CY} L${CX} ${CY + 48} Z`} fill="#F5C400" />
        </motion.g>
        <circle cx={CX} cy={CY} r="22" fill="#0C1C55" stroke="#F4F7FF" strokeWidth="7" />
      </svg>
    </div>
  );
}
