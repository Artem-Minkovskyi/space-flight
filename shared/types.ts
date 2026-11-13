/** Nominal brands prevent mixing identifiers that share the same runtime representation. */
declare const brand: unique symbol;
export type Brand<T, Name extends string> = T & { readonly [brand]: Name };

export type PlayerId = Brand<number, 'PlayerId'>;
export type RoomId = Brand<string, 'RoomId'>;
export type SimulationTick = Brand<number, 'SimulationTick'>;
export type SequenceNumber = Brand<number, 'SequenceNumber'>;

// These are the only brand-boundary assertions: values are created after runtime validation.
export const asPlayerId = (value: number): PlayerId => value as PlayerId; // Validated uint16 player identifier.
export const asRoomId = (value: string): RoomId => value as RoomId; // Validated room identifier.
export const asSimulationTick = (value: number): SimulationTick =>
  value as SimulationTick; // Decoded uint32 tick.
export const asSequenceNumber = (value: number): SequenceNumber =>
  value as SequenceNumber; // Validated uint32 input sequence.

export interface ReadonlyVector2 {
  readonly x: number;
  readonly y: number;
}

export interface ShipState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly hp: number;
  readonly thrust: boolean;
  readonly dead: boolean;
  readonly seq: SequenceNumber;
}

export interface InputCommand {
  readonly seq: SequenceNumber;
  readonly throttle: number;
  readonly turn: number;
  readonly fire: boolean;
}

export interface ShipSnapshot {
  readonly kind: 'ship';
  readonly id: PlayerId;
  readonly nickname?: string;
  readonly state: ShipState;
}

export interface AsteroidSnapshot {
  readonly kind: 'asteroid';
  readonly id: PlayerId;
  readonly position: ReadonlyVector2;
  readonly radius: number;
}

export type SnapshotEntity = ShipSnapshot | AsteroidSnapshot;

export interface WorldSnapshot {
  readonly tick: SimulationTick;
  readonly players: readonly SnapshotEntity[];
}

export interface ArenaConfig {
  readonly width: number;
  readonly height: number;
}
