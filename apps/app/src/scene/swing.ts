/** Golf swing as joint angles over time (seconds). Ball is struck at IMPACT_T. */
export interface SwingPose {
  hipTurn: number; // radians, + = turned away from the target
  shoulderTurn: number;
  armLift: number; // arms raised around the shoulders
  wristCock: number; // club relative to the arms
}

const KEYS: [number, SwingPose][] = [
  [0, { hipTurn: 0, shoulderTurn: 0, armLift: 0.28, wristCock: 0 }],
  [0.35, { hipTurn: 0.05, shoulderTurn: 0.1, armLift: 0.3, wristCock: 0.05 }],
  [1.15, { hipTurn: 0.65, shoulderTurn: 1.6, armLift: 1.9, wristCock: 1.45 }],
  [1.45, { hipTurn: -0.45, shoulderTurn: -0.15, armLift: 0.32, wristCock: 0 }],
  [2.05, { hipTurn: -1.3, shoulderTurn: -2.1, armLift: 2.2, wristCock: -1.1 }],
];
export const IMPACT_T = 1.45;
export const SWING_END = 2.05;

const ease = (t: number) => t * t * (3 - 2 * t);

export function swingPose(t: number): SwingPose {
  if (t <= 0) return KEYS[0]![1];
  for (let i = 1; i < KEYS.length; i++) {
    const [t1, b] = KEYS[i]!;
    if (t <= t1) {
      const [t0, a] = KEYS[i - 1]!;
      const k = ease((t - t0) / (t1 - t0));
      return {
        hipTurn: a.hipTurn + (b.hipTurn - a.hipTurn) * k,
        shoulderTurn: a.shoulderTurn + (b.shoulderTurn - a.shoulderTurn) * k,
        armLift: a.armLift + (b.armLift - a.armLift) * k,
        wristCock: a.wristCock + (b.wristCock - a.wristCock) * k,
      };
    }
  }
  return KEYS.at(-1)![1];
}
