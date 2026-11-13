import type {
  PlayerId,
  SimulationTick,
  ReadonlyVector2,
} from '../shared/types.ts';

declare const playerId: PlayerId;
declare const tick: SimulationTick;
declare const vector: ReadonlyVector2;

// @ts-expect-error PlayerId and SimulationTick are intentionally not interchangeable.
const invalidTick: SimulationTick = playerId;
// @ts-expect-error ReadonlyVector2 fields cannot be mutated.
vector.x = 42;

void tick;
void invalidTick;
