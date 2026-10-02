import { ARAM_MAP } from './aramMap';
import { MAP, type MapData, type MapId } from './mapData';

/** Every map, by id. */
export const MAPS: Record<MapId, MapData> = { rift: MAP, aram: ARAM_MAP };

export const isMapId = (v: unknown): v is MapId => typeof v === 'string' && Object.hasOwn(MAPS, v);
