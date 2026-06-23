export type Terrain = "ocean" | "coast" | "plain" | "forest" | "hill" | "mountain" | "desert";

export type Resource = "grain" | "timber" | "iron" | "coal" | "oil";

export type Nation = {
  id: string;
  name: string;
  color: string;
  numericColor: number;
};

export type Province = {
  id: string;
  name: string;
  nationId: string;
};

export type Tile = {
  x: number;
  y: number;
  terrain: Terrain;
  provinceId: string;
  resource?: Resource;
};

export type MapEdge = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type World = {
  width: number;
  height: number;
  tiles: Tile[];
  nations: Nation[];
  provinces: Province[];
  provinceById: Map<string, Province>;
  nationById: Map<string, Nation>;
  provinceEdges: MapEdge[];
  nationEdges: MapEdge[];
};
