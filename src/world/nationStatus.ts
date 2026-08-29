import type { World } from "./types";

/**
 * 判断国家是否已经失去全部城市与人口。
 *
 * @param world 当前世界；战争结算会直接更新其中的城市归属
 * @param nationId 待检查的国家ID
 * @returns 没有任何归属城市且总人口为零时返回 true
 */
export function isNationDefeated(world: World, nationId: string) {
  const cities = world.cities.filter((city) => city.nationId === nationId);
  const population = cities.reduce((sum, city) => sum + city.population, 0);
  return cities.length === 0 && population <= 0;
}

/** 判断国家是否仍可参与经济、政策、外交、间谍和军事行动。 */
export function isNationActive(world: World, nationId: string) {
  return !isNationDefeated(world, nationId);
}
