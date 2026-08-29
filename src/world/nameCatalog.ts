/** 可本地化的名称条目，用于稳定配置引用与中英文显示。 */
export type LocalizedNameEntry = { id: string; en: string; zh: string };

/** 国家名称主体池；国家生成时会与政体池随机组合。 */
export const nationNameBases: LocalizedNameEntry[] = [
  { id: "aurora", en: "Aurora", zh: "极光" }, { id: "verdant", en: "Verdant", zh: "苍翠" },
  { id: "sol", en: "Sol", zh: "曜日" }, { id: "ember", en: "Ember", zh: "余烬" },
  { id: "lumen", en: "Lumen", zh: "流明" }, { id: "cobalt", en: "Cobalt", zh: "苍蓝" },
  { id: "meridian", en: "Meridian", zh: "子午" }, { id: "horizon", en: "Horizon", zh: "地平" },
  { id: "silver", en: "Silver", zh: "白银" }, { id: "river", en: "River", zh: "长河" },
  { id: "crown", en: "Crown", zh: "王冠" }, { id: "aster", en: "Aster", zh: "星芒" },
];

/** 国家政体池；与名称主体组合形成完整国家名。 */
export const governmentForms: LocalizedNameEntry[] = [
  { id: "republic", en: "Republic", zh: "共和国" }, { id: "federation", en: "Federation", zh: "联邦" },
  { id: "kingdom", en: "Kingdom", zh: "王国" }, { id: "empire", en: "Empire", zh: "帝国" },
  { id: "directorate", en: "Directorate", zh: "统合体" }, { id: "commonwealth", en: "Commonwealth", zh: "共同体" },
  { id: "league", en: "League", zh: "联盟" }, { id: "assembly", en: "Assembly", zh: "议会国" },
];

/** 城市完整名称池；生成时直接抽取，方便策划人员维护。 */
export const cityNames: LocalizedNameEntry[] = [
  ["starhaven", "Starhaven", "星港"], ["rivergate", "Rivergate", "河门"], ["ironford", "Ironford", "铁津"],
  ["brightspire", "Brightspire", "辉塔"], ["cloudrest", "Cloudrest", "云栖"], ["emberfall", "Emberfall", "烬落"],
  ["lumenbridge", "Lumenbridge", "光桥"], ["cobaltport", "Cobaltport", "苍蓝港"], ["greenwatch", "Greenwatch", "翠望"],
  ["goldenfield", "Goldenfield", "金原"], ["stonehold", "Stonehold", "石垒"], ["moonmarket", "Moonmarket", "月集"],
  ["sunward", "Sunward", "向阳城"], ["stormrest", "Stormrest", "息风城"], ["clearwater", "Clearwater", "清泉"],
  ["highgarden", "Highgarden", "高庭"], ["silvercross", "Silvercross", "银渡"], ["newforge", "Newforge", "新炉城"],
  ["redharbor", "Redharbor", "赤港"], ["northpoint", "Northpoint", "北岬"], ["southvale", "Southvale", "南谷"],
  ["eastmere", "Eastmere", "东湖"], ["westcrown", "Westcrown", "西冠"], ["deepwood", "Deepwood", "幽林"],
  ["auricgate", "Auricgate", "鎏金门"], ["horizonfall", "Horizonfall", "天际城"], ["meridian", "Meridian", "子午城"],
  ["nova", "Nova", "新星城"], ["asterforge", "Asterforge", "星炉"], ["crownrest", "Crownrest", "冠栖"],
  ["verdantford", "Verdantford", "翠津"], ["solhaven", "Solhaven", "曜日港"], ["frostwatch", "Frostwatch", "霜望"],
  ["dawngate", "Dawngate", "曙门"], ["mistbridge", "Mistbridge", "雾桥"], ["oakheart", "Oakheart", "橡心城"],
  ["sandspire", "Sandspire", "沙塔"], ["blackfen", "Blackfen", "玄泽"], ["whitecliff", "Whitecliff", "白崖"],
  ["bluegarden", "Bluegarden", "蓝庭"], ["sunforge", "Sunforge", "日炉"], ["moonford", "Moonford", "月津"],
  ["starbridge", "Starbridge", "星桥"], ["rainhaven", "Rainhaven", "雨港"], ["windrest", "Windrest", "风息城"],
  ["pinewatch", "Pinewatch", "松望"], ["ashmarket", "Ashmarket", "灰集"], ["crystalbay", "Crystal Bay", "晶湾"],
  ["falconreach", "Falconreach", "鹰境"], ["jadegate", "Jadegate", "玉门"], ["pearlhaven", "Pearlhaven", "珠港"],
  ["thunderford", "Thunderford", "雷津"], ["willowrest", "Willowrest", "柳栖"], ["wolfpoint", "Wolfpoint", "狼岬"],
].map(([id, en, zh]) => ({ id, en, zh }));
