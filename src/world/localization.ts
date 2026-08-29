import type { City, Nation, Province, Resource, Terrain, World } from "./types";

/** 游戏支持的显示语言。 */
export type Language = "en" | "zh";

type NamedEntity = Pick<Nation | City | Province, "name" | "nameEn" | "nameZh">;

/** 按当前语言返回国家、城市或省份名称。 */
export function getLocalizedName(entity: NamedEntity | undefined, language: Language) {
  if (!entity) return "";
  return language === "zh" ? entity.nameZh : entity.nameEn;
}

const staticZh: Record<string, string> = {
  "AI Civilization Sandbox": "AI 文明沙盒", "World Observer": "世界观察者", "World Time": "世界时间",
  "World map": "世界地图", "World controls": "世界控制", "Map mode": "地图模式", "Event log": "事件日志",
  "Event log mode": "事件日志模式", "Simulation speed": "自动回合速度", "Collapse event log": "收起事件日志",
  "Expand event log": "展开事件日志", "Collapse side panel": "收起侧边栏", "Expand side panel": "展开侧边栏",
  Play: "自动回合", Pause: "暂停", "Next Turn": "下一回合", "Turn Progress": "回合进度", Resolving: "正在结算",
  Seed: "种子", Map: "地图", Provinces: "省份", Nations: "国家", Cities: "城市", "Map Mode": "地图模式",
  Political: "政治", Terrain: "地形", Resources: "资源", Layers: "图层", "Province border": "省界",
  "Nation border": "国界", "Nation color edge": "国家色边缘", "Resource node": "资源点", City: "城市",
  "Selected Province": "选中省份", "View Nation": "查看国家", Area: "面积", Elevation: "海拔",
  Temperature: "温度", Moisture: "湿度", "None discovered": "尚未发现", Details: "详情",
  "Click a nation to open its detail panel.": "点击国家打开详情面板。", "World History": "世界历史",
  "Event Log": "事件日志", Overview: "概览", Nation: "国家", "Recent Major Events": "近期重大事件",
  Back: "返回", "Last 2 Years": "最近两年", "No major events yet": "暂无重大事件",
  "Capital City": "首都", "City Detail": "城市详情", Population: "人口", "Monthly Gold": "月度金币",
  Army: "军队", Defense: "防御", "Building Slots": "建筑槽位", Empty: "空闲", "Nation Detail": "国家详情",
  Capital: "首都", Treasury: "国库", Soldiers: "士兵", Morale: "士气", "Resource Sites": "资源点",
  "Deployed Spies": "已部署间谍", "AI Policy": "AI 政策", Expansion: "扩张", Economy: "经济",
  Diplomacy: "外交", "Spy Missions": "间谍任务", Military: "军事", "Spy Network": "间谍网络",
  "Diplomacy Status": "外交状态", "Major Cities": "主要城市", Relations: "关系", "Monthly Output": "月度产出",
  "Current Resources": "当前资源", "Monthly Upkeep": "月度维护费", "Attack / Defense": "攻击 / 防御",
  "Field Army Groups": "野战军团", "City Garrisons": "城市驻军", "Recruitment Queue": "征兵队列",
  "Active Wars": "进行中的战争", "No field army groups deployed": "尚未部署野战军团", "No city garrisons": "暂无城市驻军",
  "No active recruitment orders": "暂无征兵命令", "No active wars": "暂无战争", "No policy assessment available": "暂无政策评估",
  "No spies currently deployed": "当前未部署间谍", "Active Intelligence": "有效情报", "No active intelligence reports": "暂无有效情报",
  "No active spy mission intent": "暂无间谍任务意图", "No cities founded": "尚未建立城市", "No known relations": "暂无已知关系",
  "No resources discovered": "尚未发现资源", "No resources": "无资源", "No target": "无目标", "Unknown nation": "未知国家",
  "Unknown province": "未知省份", Unknown: "未知", War: "战争", Alliance: "联盟", "Vassal Of": "宗主国",
  Vassal: "附庸", Truce: "停战", "Mutual defense": "共同防御", "Limited treaty": "有限条约",
  Sent: "已发送", Received: "已收到", Active: "生效中", "Current report": "当前报告", Attack: "进攻",
  Defend: "防御", Garrison: "驻守", Raid: "袭扰", Rally: "集结", Retreat: "撤退",
  "No wars, treaties, vassals, truces, or proposals": "暂无战争、条约、附庸、停战或提案",
  "Drag to pan / Wheel to zoom": "拖动平移 / 滚轮缩放", Grain: "粮食", Timber: "木材", Iron: "铁矿", Coal: "煤矿", Oil: "石油",
  Plain: "平原", Forest: "森林", Hill: "丘陵", Mountain: "山地", Desert: "沙漠", Coast: "海岸", Ocean: "海洋",
  grain: "粮食", timber: "木材", iron: "铁矿", coal: "煤矿", oil: "石油",
  plain: "平原", forest: "森林", hill: "丘陵", mountain: "山地", desert: "沙漠", coast: "海岸", ocean: "海洋",
  tiles: "格", slots: "个槽位", soldiers: "名士兵", steps: "步", battles: "场战斗", months: "个月", sites: "处",
  Hostile: "敌对", Wary: "戒备", Neutral: "中立", Friendly: "友好", Trusted: "信赖",
  "Declare War": "宣战", "Seek Alliance": "寻求联盟", "Demand Vassalage": "要求臣服", "Seek Vassalage": "寻求庇护",
  "Control Resources": "控制资源", "Control Cities": "控制城市", "Decisive Battle": "决战", Recovery: "恢复",
  Construction: "建设", "Army Building": "扩军", "Gather Intelligence": "收集情报", "Improve Relations": "改善关系",
  "Damage Relations": "破坏关系", "Sow Discord": "挑拨离间", None: "无",
  "gather intelligence": "收集情报", "improve relations": "改善关系", "damage relations": "破坏关系", "sow discord": "挑拨离间",
  "No Expansion": "暂不扩张", "No Diplomatic Move": "暂无外交行动", "Seek Peace": "寻求和平", Surrender: "投降",
  Militia: "民兵", Infantry: "步兵", "Light Cavalry": "轻骑兵", "Heavy Cavalry": "重骑兵",
  militia: "民兵", infantry: "步兵", "light cavalry": "轻骑兵", "heavy cavalry": "重骑兵",
  attack: "进攻", defend: "防御", garrison: "驻守", raid: "袭扰", rally: "集结", retreat: "撤退",
  "Spy Dispatched": "已派遣间谍", "Intelligence Acquired": "已获取情报", "Relations Sowed Discord": "已挑拨关系",
  "Relations Improved": "关系改善", "Relations Damaged": "关系恶化", "War Declared": "战争宣告",
  "Alliance Signed": "联盟签署", "Truce Signed": "停战协议签署", "Vassalage Accepted": "附庸关系成立",
  "Alliance Dissolved": "联盟解散", "Vassalage Broken": "附庸关系解除", "Vassal Rebellion": "附庸叛乱",
  "Military Upkeep Shortage": "军费不足", "Military Supply Shortage": "军需不足", "War Ended": "战争结束",
  "Nation Defeated": "国家灭亡", "Military Disbanded": "军队裁撤", "Recruitment Completed": "征兵完成",
  "City Developed": "城市发展", "Army Group Created": "军团建立", "Army Group Ordered": "军团接令",
  "Army Group Moved": "军团抵达", "Army Groups Merged": "军团合并", "Battle Won": "战斗胜利",
  "Battle Held": "守住战场", "Province Occupied": "省份被占领", "Capital Lost": "首都失守", "City Lost": "城市失守",
  "Defeated Nation": "已亡国家", "Defeated At": "亡国时间", "Destroyed By": "灭国者",
  "Alliance Request": "结盟请求", "Peace Offer": "和平提议", "Vassalage Demand": "臣服要求", "Vassalage Offer": "附庸提议",
  "AI Configuration": "AI 配置", "Models & personalities": "模型与国家性格",
  "Nation AI Configuration": "国家 AI 配置", "Back to World": "返回世界",
  "Back to Main Menu": "返回主菜单",
  "Configure an OpenAI-compatible model and a distinct national personality for every nation.": "为每个国家配置 OpenAI 兼容模型和独立的国家性格。",
  "Unsaved changes": "有未保存的更改", "Selected Nation": "当前国家", "Enable External Model": "启用外部模型",
  "External model enabled": "已启用外部模型", "Simulation AI": "内置模拟 AI",
  "Browser-only configuration": "仅保存在浏览器",
  "API Keys are stored in this browser. Do not enter production credentials on a shared device.": "API Key 会保存在当前浏览器中。请勿在共用设备上填写生产环境凭据。",
  "Provider Name": "服务商名称", "API Endpoint": "API 地址", "Model Name": "模型名称", "API Key": "API Key",
  "Example: OpenRouter, DeepSeek, Ollama": "例如：OpenRouter、DeepSeek、Ollama",
  "Enter the complete OpenAI-compatible Chat Completions endpoint.": "请输入完整的 OpenAI 兼容 Chat Completions 地址。",
  "Example: provider/model-name": "例如：provider/model-name", "Optional for local services": "本地服务可以留空",
  Show: "显示", Hide: "隐藏", "Nation Personality Prompt": "国家性格 Prompt",
  "Describe this nation's values, ambitions, temperament, and strategic style.": "描述这个国家的价值观、野心、性格和战略风格。",
  "This prompt is sent as the system message before the game's structured decision request.": "该 Prompt 会作为系统消息，在游戏的结构化决策请求之前发送。",
  "Restore Nation Defaults": "恢复该国默认值", "Test Connection": "测试连接", "Testing...": "测试中…",
  "Testing connection...": "正在测试连接…", "Save Configuration": "保存配置",
  "Connection successful.": "连接成功。", "Configuration saved locally.": "配置已保存到本地。",
  "Unable to save configuration in this browser.": "无法在当前浏览器中保存配置。",
  "Enter a valid HTTP or HTTPS API endpoint.": "请输入有效的 HTTP 或 HTTPS API 地址。",
  "Enter a model name before testing the connection.": "测试连接前请填写模型名称。",
  "The model service rejected the request. Check the model name and API Key.": "模型服务拒绝了请求，请检查模型名称和 API Key。",
  "Connection timed out. Check the API endpoint and network.": "连接超时，请检查 API 地址和网络。",
  "Unable to reach the model service. Check the endpoint, network, and CORS settings.": "无法连接模型服务，请检查地址、网络和跨域设置。",
  "Connection test failed unexpectedly.": "连接测试意外失败。", "No Nations Available": "暂无可配置国家",
  "Main Menu": "主菜单", "Main Menu Actions": "主菜单操作", "Start Game": "开始游戏",
  Configuration: "配置", "Nation models & personalities": "国家模型与性格",
  "Game Language": "游戏语言", "A World Shaped by Autonomous Nations": "由自主国家塑造的世界",
  "Civilization Sandbox": "文明沙盒",
  "Generate a living world, then watch ambitious nations expand, negotiate, build, spy, and wage war one turn at a time.": "生成一个鲜活的世界，观察充满野心的国家逐回合扩张、谈判、建设、谍报与战争。",
  "New World": "新世界", "Create a Civilization": "创建文明世界", "World Seed": "世界种子",
  "Enter any word or number": "输入任意文字或数字",
  "The same settings and seed will generate the same starting world.": "相同的设置与种子将生成相同的初始世界。",
  "Nation Count": "国家数量", "City Count": "城市数量", "World Preview": "世界预览",
  "Generate World": "生成世界", "2–12 nations": "2–12 个国家",
  "Turn-based world simulation": "回合制世界模拟", "Every nation thinks for itself": "每个国家都独立思考",
};

const phraseZh: Array<[RegExp, string]> = [
  [/Year (\d+), Month (\d+)/g, "第$1年 第$2月"], [/Turn (\d+)/g, "第$1回合"],
  [/(\d+) nations · (\d+) cities/g, "$1 个国家 · $2 座城市"], [/(\d+)–(\d+) cities/g, "$1–$2 座城市"],
  [/(\d+) of (\d+) nations completed/g, "已完成 $1 / $2 个国家"], [/Waiting for /g, "正在等待"],
  [/Next in (\d+) months/g, "$1个月后重新评估"], [/(\d+) months/g, "$1个月"], [/(\d+) mo\b/g, "$1个月"],
  [/(\d+) soldiers/g, "$1名士兵"], [/(\d+) battles/g, "$1场战斗"], [/(\d+) steps/g, "$1步"],
  [/(\d+) slots/g, "$1个槽位"], [/(\d+) sites/g, "$1处"], [/(\d+) active/g, "$1项生效"],
  [/(\d+) tiles/g, "$1格"],
  [/(\d+) deployed/g, "已部署$1名"], [/(\d+) assigned/g, "已分配$1项"],
  [/\/month/g, "/月"], [/\/mo\b/g, "/月"], [/Ready /g, "完成于"], [/Started /g, "始于"], [/Expires /g, "到期于"],
  [/Review /g, "复核于"], [/Score /g, "战果"], [/front /g, "前线"], [/gold/g, "金币"], [/resources/g, "资源"],
  [/Attitude /g, "态度 "], [/Level /g, "等级 "], [/Active in /g, "将在"], [/ tribute/g, " 朝贡"],
  [/No immediate tense border target or insufficient army density\./g, "暂无紧张边境目标，或军队密度不足。"],
  [/Reserves are thin, so the economy is conserving gold and resources\./g, "储备不足，经济政策将节省金币与资源。"],
  [/The army is dense enough to seek a direct confrontation\./g, "军队密度足以寻求正面对抗。"],
  [/Urban control is low compared with territorial size\./g, "相对领土规模，城市控制力偏低。"],
  [/No diplomatic action has a strong enough advantage yet\./g, "当前没有具备足够收益的外交行动。"],
  [/A friendly partner is available for future mutual defense\./g, "存在可发展共同防御关系的友好伙伴。"],
  [/Hostility is high and military readiness is strong enough for border war\./g, "敌意较高且军事准备足以发动边境战争。"],
  [/(.+) declared war on (.+)\./g, "$1向$2宣战。"], [/(.+) and (.+) signed a mutual defense alliance\./g, "$1与$2签署共同防御联盟。"],
  [/(.+) and (.+) agreed to a (\d+)-month truce\./g, "$1与$2同意停战$3个月。"],
  [/(.+) became a vassal of (.+)\./g, "$1成为$2的附庸。"], [/(.+) submitted to (.+) as a vassal\./g, "$1向$2臣服。"],
  [/(.+) and (.+) dissolved their alliance after relations cooled\./g, "$1与$2因关系冷却而解散联盟。"],
  [/(.+) from (.+) to (.+) was accepted\./g, "$2向$3发出的$1已被接受。"],
  [/(.+) from (.+) to (.+) was created\./g, "$2已向$3发出$1。"],
  [/(.+) from (.+) to (.+) was expired\./g, "$2向$3发出的$1已过期。"],
  [/(.+) from (.+) to (.+) was rejected\./g, "$2向$3发出的$1已被拒绝。"],
  [/(.+) broke vassalage with (.+)\./g, "$1解除了与$2的附庸关系。"], [/(.+) rebelled against (.+)\./g, "$1反抗其宗主$2。"],
  [/(.+) dispatched a spy to (.+) for (.+)\./g, "$1向$2派遣间谍，任务：$3。"],
  [/(.+) obtained military and resource intelligence on (.+)\./g, "$1获得了$2的军事与资源情报。"],
  [/(.+) sowed discord between (.+) and (.+)\./g, "$1挑拨了$2与$3的关系。"],
  [/(.+) improved relations with (.+) through covert action\./g, "$1通过秘密行动改善了与$2的关系。"],
  [/(.+) damaged relations with (.+) through covert action\./g, "$1通过秘密行动破坏了与$2的关系。"],
  [/(.+) could not fully pay military upkeep; army morale fell to (\d+)%\./g, "$1无法足额支付军费，军队士气降至$2%。"],
  [/(.+) lacked military supplies; army morale fell to (\d+)%\./g, "$1缺少军需，军队士气降至$2%。"],
  [/(.+) disbanded (\d+) soldiers to reduce military expenses\./g, "$1裁撤$2名士兵以降低军费。"],
  [/(.+) disbanded (\d+)名士兵 to reduce military expenses\./g, "$1裁撤$2名士兵以降低军费。"],
  [/(\d+) (.+) finished training in (.+)\./g, "$3完成$1名$2的训练。"],
  [/(.+) invested surplus resources to develop (.+) to level (\d+)\./g, "$1投入富余资源，将$2发展至$3级。"],
  [/(.+) redirected an army group toward (.+)\./g, "$1命令军团转向$2。"], [/(.+) army group reached (.+)\./g, "$1的军团抵达$2。"],
  [/(.+) formed an army group for (.+) from (.+) and ordered it toward (.+)\./g, "$1从$3组建执行$2任务的军团，并命令其前往$4。"],
  [/(\d+) army groups merged in the same province\./g, "$1支军团在同一省份合并。"],
  [/(.+) occupied (.+), taking control of its land and resources from (.+)\./g, "$1占领$2，从$3手中夺取其土地与资源。"],
  [/(.+) occupied (.+), taking control of its land and 资源 from (.+)\./g, "$1占领$2，从$3手中夺取其土地与资源。"],
  [/(.+) and (.+) ended their war because one side no longer controls territory\./g, "$1与$2因一方不再控制领土而结束战争。"],
  [/(.+) and (.+) signed a truce after their armies could no longer reach a viable front\./g, "$1与$2因军队无法抵达有效前线而签署停战协议。"],
  [/(.+) lost (.+), its capital city, to (.+)\./g, "$1的首都$2被$3攻占。"], [/(.+) lost (.+) to (.+)\./g, "$1的城市$2被$3攻占。"],
  [/(.+) lost its cities and population and was defeated by (.+)\./g, "$1失去全部城市与人口，被$2灭亡。"],
  [/(.+) won the battle for (.+) against (.+)\. Attack (\d+), defense (\d+)\./g, "$1在$2击败$3。进攻$4，防御$5。"],
  [/(.+) failed the battle for (.+) against (.+)\. Attack (\d+), defense (\d+)\./g, "$1未能攻下$2，守军来自$3。进攻$4，防御$5。"],
  [/ Accepted$/g, " 已接受"], [/ Created$/g, " 已发出"], [/ Expired$/g, " 已过期"], [/ Rejected$/g, " 已拒绝"],
  [/No active /g, "暂无生效的"], [/No /g, "无"], [/Unknown /g, "未知"],
];

/** 将界面或模拟文本转换为指定语言；英文是内部规范化源文本。 */
export function localizeText(text: string, language: Language, world?: World) {
  if (language === "en" || !text.trim()) return text;
  const leading = text.match(/^\s*/)?.[0] ?? "";
  const trailing = text.match(/\s*$/)?.[0] ?? "";
  let value = text.trim();
  if (world) {
    const entities = [...world.nations, ...world.cities, ...world.provinces].sort((a, b) => b.nameEn.length - a.nameEn.length);
    for (const entity of entities) value = value.split(entity.nameEn).join(entity.nameZh);
  }
  value = staticZh[value] ?? value;
  for (const [pattern, replacement] of phraseZh) value = value.replace(pattern, replacement);
  for (const [english, chinese] of Object.entries(staticZh).sort(([a], [b]) => b.length - a.length)) {
    value = value.split(english).join(chinese);
  }
  return `${leading}${value}${trailing}`;
}

/** 返回资源的本地化名称。 */
export function localizeResource(resource: Resource, language: Language) {
  const english = resource.charAt(0).toUpperCase() + resource.slice(1);
  return language === "zh" ? staticZh[english] ?? english : english;
}

/** 返回地形的本地化名称。 */
export function localizeTerrain(terrain: Terrain, language: Language) {
  const english = terrain.charAt(0).toUpperCase() + terrain.slice(1);
  return language === "zh" ? staticZh[english] ?? english : english;
}
