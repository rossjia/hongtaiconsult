<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>专业排序</title>
<style>
:root {
  --primary:#0f766e;
  --primary-dark:#115e59;
  --soft:#ecfdf5;
  --border:#d9e7e4;
  --text:#1f2937;
  --muted:#64748b;
  --bg:#f6f9f8;
  --card:#fff;
}
* { box-sizing:border-box; }
body {
  margin:0;
  background:var(--bg);
  color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei","PingFang SC",Arial,sans-serif;
}
main {
  width:min(760px,calc(100% - 20px));
  margin:0 auto;
  padding:18px 0 36px;
}
.top {
  display:flex;
  justify-content:space-between;
  gap:12px;
  align-items:flex-start;
  margin-bottom:14px;
}
h1 {
  margin:0;
  font-size:24px;
  color:var(--primary-dark);
}
.tip {
  margin:6px 0 0;
  color:var(--muted);
  font-size:13px;
  line-height:1.5;
}
.save-status {
  flex:0 0 auto;
  min-width:72px;
  padding-top:5px;
  text-align:right;
  color:var(--muted);
  font-size:12px;
}
.save-status.saving { color:#b45309; }
.save-status.saved { color:var(--primary); }
.save-status.error { color:#b91c1c; }
#list {
  display:flex;
  flex-direction:column;
  gap:8px;
}
.item {
  background:var(--card);
  border:1px solid var(--border);
  border-radius:12px;
  overflow:hidden;
  box-shadow:0 4px 14px rgba(15,118,110,.06);
}
.item.dragging {
  opacity:.78;
  box-shadow:0 12px 28px rgba(15,118,110,.20);
  transform:scale(1.01);
  z-index:50;
}
.item.excluded {
  opacity:.58;
  background:#f3f4f6;
}
.item.excluded .name {
  text-decoration:line-through;
  text-decoration-thickness:1px;
}
.item.excluded .rank {
  background:#e5e7eb;
  color:#6b7280;
}
.item-main {
  display:grid;
  grid-template-columns:32px 42px minmax(0,1fr) auto auto auto;
  align-items:center;
  gap:6px;
  min-height:58px;
  padding:8px 8px 8px 10px;
  cursor:grab;
  touch-action:none;
  user-select:none;
  -webkit-user-select:none;
}
.item-main:active { cursor:grabbing; }
.select-box {
  width:20px;
  height:20px;
  accent-color:var(--primary);
  cursor:pointer;
}
.rank {
  width:34px;
  height:34px;
  display:grid;
  place-items:center;
  border-radius:9px;
  background:var(--soft);
  color:var(--primary-dark);
  font-weight:750;
}
.name {
  font-size:16px;
  font-weight:700;
  line-height:1.35;
}
.status-text {
  margin-left:6px;
  color:#9a3412;
  font-size:12px;
  font-weight:600;
  text-decoration:none;
}
.school-count {
  margin-top:3px;
  color:var(--muted);
  font-size:12px;
}
.icon-btn {
  width:34px;
  height:34px;
  padding:0;
  display:grid;
  place-items:center;
  border:1px solid var(--border);
  background:#fff;
  border-radius:9px;
  color:var(--primary-dark);
  font-size:16px;
  cursor:pointer;
  touch-action:manipulation;
}
.icon-btn:hover { border-color:var(--primary); }
.details {
  display:none;
  padding:4px 12px 12px;
  border-top:1px solid var(--border);
  background:#fbfdfc;
}
.item.open .details { display:block; }
.school {
  padding:9px 0;
  border-bottom:1px dashed #dce7e5;
}
.school:last-child { border-bottom:none; }
.school-name {
  font-size:14px;
  font-weight:700;
}
.school-meta {
  margin-top:3px;
  color:var(--muted);
  font-size:12px;
  line-height:1.55;
}
.loading {
  padding:32px 12px;
  text-align:center;
  color:var(--muted);
}
.toast {
  position:fixed;
  left:50%;
  bottom:20px;
  transform:translateX(-50%) translateY(12px);
  opacity:0;
  background:#0f172a;
  color:#fff;
  border-radius:9px;
  padding:9px 13px;
  font-size:13px;
  pointer-events:none;
  transition:.18s;
  z-index:100;
}
.toast.show {
  opacity:.94;
  transform:translateX(-50%) translateY(0);
}
@media(max-width:560px) {
  main { width:calc(100% - 14px); padding-top:13px; }
  h1 { font-size:21px; }
  .item-main {
    grid-template-columns:28px 36px minmax(0,1fr) 31px 31px 31px;
    min-height:55px;
    padding-left:7px;
    gap:4px;
  }
  .rank { width:32px; height:32px; }
  .icon-btn { width:31px; height:31px; }
  .name { font-size:15px; }
}
</style>
</head>
<body>
<main>
  <div class="top">
    <div>
      <h1>专业排序</h1>
      <div class="tip">默认全部考虑。取消勾选后自动移到最下方；专业可以整体拖动，也可用“↑ / ↓”调整。所有改动会自动共享。</div>
    </div>
    <div id="saveStatus" class="save-status">正在读取…</div>
  </div>
  <div id="list"><div class="loading">正在读取最新结果…</div></div>
</main>
<div id="toast" class="toast"></div>

<script>
const ITEMS = [{"name": "全媒体广告策划与营销", "category": "设计传媒", "options": [{"school": "湖北开放职业学院", "group_code": "C601(01)", "profession_code": "25", "raw_name": "全媒体广告策划与营销", "score25": "-/-", "score24": "287/108266", "tuition": 9800, "plan": 20}]}, {"name": "数字媒体技术", "category": "设计传媒", "options": [{"school": "武汉商贸职业学院", "group_code": "C607(01)", "profession_code": "35", "raw_name": "数字媒体技术 (大一在红安教学改革基地就读，大二起就读武汉校区)", "score25": "-/-", "score24": "334/88931", "tuition": 12000, "plan": 47}, {"school": "武汉光谷职业学院", "group_code": "C611(01)", "profession_code": "20", "raw_name": "数字媒体技术", "score25": "-/-", "score24": "-/-", "tuition": 10200, "plan": 60}]}, {"name": "数字媒体艺术设计", "category": "设计传媒", "options": [{"school": "武昌职业学院", "group_code": "C608(10)", "profession_code": "72", "raw_name": "数字媒体艺术设计", "score25": "-/-", "score24": "296/105123", "tuition": 13600, "plan": 20}, {"school": "湖北商贸学院", "group_code": "C235(04)", "profession_code": "38", "raw_name": "数字媒体艺术设计 (办学地点:武汉校区)", "score25": "-/-", "score24": "-/-", "tuition": 15000, "plan": 40}, {"school": "湖北城市建设职业技术学院 中外合作办学", "group_code": "C560(04)", "profession_code": "35", "raw_name": "数字媒体艺术设计 (中外合作办学)", "score25": "226/134082", "score24": "-/-", "tuition": 16000, "plan": 35}]}, {"name": "新闻采编与制作", "category": "设计传媒", "options": [{"school": "武汉体育学院体育科技学院", "group_code": "C221(03)", "profession_code": "08", "raw_name": "新闻采编与制作", "score25": "267/126601", "score24": "299/104024", "tuition": 13000, "plan": 70}, {"school": "武汉传媒学院", "group_code": "C207(05)", "profession_code": "36", "raw_name": "新闻采编与制作 (融媒体方向;学生就读大悟校区)", "score25": "150/138155", "score24": "378/68245", "tuition": 15000, "plan": 60}]}, {"name": "环境艺术设计", "category": "设计传媒", "options": [{"school": "湖北商贸学院", "group_code": "C235(04)", "profession_code": "36", "raw_name": "环境艺术设计 (办学地点:武汉校区)", "score25": "-/-", "score24": "-/-", "tuition": 15000, "plan": 40}]}, {"name": "电子竞技运动与管理", "category": "设计传媒", "options": [{"school": "武汉光谷职业学院", "group_code": "C611(01)", "profession_code": "39", "raw_name": "电子竞技运动与管理", "score25": "-/-", "score24": "289/107577", "tuition": 9700, "plan": 15}]}, {"name": "视觉传达设计", "category": "设计传媒", "options": [{"school": "湖北商贸学院", "group_code": "C235(04)", "profession_code": "37", "raw_name": "视觉传达设计 (办学地点:武汉校区)", "score25": "-/-", "score24": "-/-", "tuition": 15000, "plan": 50}]}, {"name": "国际经济与贸易", "category": "商贸运营", "options": [{"school": "武汉工商学院", "group_code": "C217(09)", "profession_code": "49", "raw_name": "国际经济与贸易", "score25": "298/117062", "score24": "310/99648", "tuition": 14500, "plan": 10}]}, {"name": "大数据与财务管理", "category": "商贸运营", "options": [{"school": "文华学院", "group_code": "C203(07)", "profession_code": "54", "raw_name": "大数据与财务管理 (办学地点:湖北武汉)", "score25": "-/-", "score24": "258/116236", "tuition": 11500, "plan": 62}]}, {"name": "现代物流管理", "category": "商贸运营", "options": [{"school": "武汉工贸职业学院", "group_code": "C602(01)", "profession_code": "12", "raw_name": "现代物流管理", "score25": "-/-", "score24": "293/106226", "tuition": 9000, "plan": 20}]}, {"name": "电子商务", "category": "商贸运营", "options": [{"school": "武汉工贸职业学院", "group_code": "C602(01)", "profession_code": "11", "raw_name": "电子商务", "score25": "-/-", "score24": "291/106884", "tuition": 11800, "plan": 20}, {"school": "武昌职业学院", "group_code": "C608(10)", "profession_code": "68", "raw_name": "电子商务", "score25": "-/-", "score24": "287/108266", "tuition": 12600, "plan": 20}, {"school": "武汉交通职业学院 乡村振兴计划", "group_code": "C537(09)", "profession_code": "63", "raw_name": "电子商务 (乡村振兴)", "score25": "-/-", "score24": "-/-", "tuition": 5000, "plan": 10}, {"school": "湖北健康职业学院", "group_code": "C612(01)", "profession_code": "21", "raw_name": "电子商务", "score25": "-/-", "score24": "246/118511", "tuition": 11900, "plan": 33}, {"school": "武汉光谷职业学院", "group_code": "C611(01)", "profession_code": "29", "raw_name": "电子商务", "score25": "-/-", "score24": "294/105863", "tuition": 9500, "plan": 70}, {"school": "武汉传媒学院", "group_code": "C207(05)", "profession_code": "38", "raw_name": "电子商务 (智能商务运营方向;学生就读大悟校区)", "score25": "155/138077", "score24": "-/-", "tuition": 15000, "plan": 35}]}, {"name": "网络营销与直播电商", "category": "商贸运营", "options": [{"school": "武汉商贸职业学院", "group_code": "C607(01)", "profession_code": "16", "raw_name": "网络营销与直播电商 (办学地点:武汉校区)", "score25": "-/-", "score24": "328/91715", "tuition": 8800, "plan": 60}, {"school": "湖北职业技术学院 乡村振兴计划", "group_code": "C505(04)", "profession_code": "43", "raw_name": "网络营销与直播电商 (乡村振兴)", "score25": "-/-", "score24": "-/-", "tuition": 5000, "plan": 10}, {"school": "湖北开放职业学院", "group_code": "C601(01)", "profession_code": "23", "raw_name": "网络营销与直播电商", "score25": "-/-", "score24": "264/114895", "tuition": 9800, "plan": 20}, {"school": "武汉工程科技学院", "group_code": "C210(05)", "profession_code": "45", "raw_name": "网络营销与直播电商", "score25": "-/-", "score24": "269/113702", "tuition": 14800, "plan": 137}]}, {"name": "连锁经营与管理", "category": "商贸运营", "options": [{"school": "武汉设计工程学院", "group_code": "C209(05)", "profession_code": "32", "raw_name": "连锁经营与管理 (办学地点:红安教学改革基地)", "score25": "303/115202", "score24": "-/-", "tuition": 13000, "plan": 31}]}, {"name": "旅游管理", "category": "旅游服务", "options": [{"school": "武汉商贸职业学院", "group_code": "C607(01)", "profession_code": "20", "raw_name": "旅游管理 (办学地点:武汉校区)", "score25": "-/-", "score24": "335/88481", "tuition": 8800, "plan": 11}, {"school": "武汉工贸职业学院", "group_code": "C602(01)", "profession_code": "15", "raw_name": "旅游管理", "score25": "-/-", "score24": "-/-", "tuition": 9000, "plan": 15}, {"school": "湖北职业技术学院 乡村振兴计划", "group_code": "C505(04)", "profession_code": "44", "raw_name": "旅游管理 (乡村振兴)", "score25": "-/-", "score24": "-/-", "tuition": 5000, "plan": 10}, {"school": "武汉光谷职业学院", "group_code": "C611(01)", "profession_code": "33", "raw_name": "旅游管理", "score25": "-/-", "score24": "294/105863", "tuition": 9500, "plan": 40}]}, {"name": "西式烹饪工艺", "category": "旅游服务", "options": [{"school": "武汉商贸职业学院", "group_code": "C607(01)", "profession_code": "21", "raw_name": "西式烹饪工艺 (办学地点:武汉校区)", "score25": "-/-", "score24": "328/91715", "tuition": 8800, "plan": 35}]}, {"name": "酒店管理与数字化运营", "category": "旅游服务", "options": [{"school": "武昌职业学院", "group_code": "C608(10)", "profession_code": "71", "raw_name": "酒店管理与数字化运营", "score25": "-/-", "score24": "286/108597", "tuition": 9800, "plan": 20}, {"school": "武汉交通职业学院 乡村振兴计划", "group_code": "C537(09)", "profession_code": "58", "raw_name": "酒店管理与数字化运营 (乡村振兴)", "score25": "299/116699", "score24": "-/-", "tuition": 5000, "plan": 3}]}, {"name": "国际邮轮乘务管理", "category": "交通航空", "options": [{"school": "武汉交通职业学院 乡村振兴计划", "group_code": "C537(09)", "profession_code": "65", "raw_name": "国际邮轮乘务管理 (乡村振兴)", "score25": "-/-", "score24": "347/82851", "tuition": 5000, "plan": 15}]}, {"name": "城市轨道车辆应用技术", "category": "交通航空", "options": [{"school": "武汉科技职业学院", "group_code": "C605(01)", "profession_code": "07", "raw_name": "城市轨道车辆应用技术", "score25": "-/-", "score24": "-/-", "tuition": 12000, "plan": 10}]}, {"name": "机场运行服务与管理", "category": "交通航空", "options": [{"school": "武汉商贸职业学院", "group_code": "C607(01)", "profession_code": "24", "raw_name": "机场运行服务与管理 (办学地点:武汉校区)", "score25": "-/-", "score24": "352/80482", "tuition": 12000, "plan": 16}]}, {"name": "民航运输服务", "category": "交通航空", "options": [{"school": "武汉科技职业学院", "group_code": "C605(01)", "profession_code": "06", "raw_name": "民航运输服务", "score25": "-/-", "score24": "-/-", "tuition": 9800, "plan": 60}]}, {"name": "汽车技术服务与营销", "category": "交通航空", "options": [{"school": "武汉交通职业学院 乡村振兴计划", "group_code": "C537(09)", "profession_code": "60", "raw_name": "汽车技术服务与营销 (乡村振兴)", "score25": "353/92941", "score24": "-/-", "tuition": 5000, "plan": 5}]}, {"name": "港口与航运管理", "category": "交通航空", "options": [{"school": "武汉交通职业学院 乡村振兴计划", "group_code": "C537(09)", "profession_code": "61", "raw_name": "港口与航运管理 (乡村振兴)", "score25": "-/-", "score24": "-/-", "tuition": 5000, "plan": 5}]}, {"name": "铁道交通运营管理", "category": "交通航空", "options": [{"school": "武汉科技职业学院", "group_code": "C605(01)", "profession_code": "05", "raw_name": "铁道交通运营管理", "score25": "-/-", "score24": "333/89432", "tuition": 12000, "plan": 20}]}, {"name": "铁道机车运用与维护", "category": "交通航空", "options": [{"school": "武汉科技职业学院", "group_code": "C605(01)", "profession_code": "04", "raw_name": "铁道机车运用与维护", "score25": "-/-", "score24": "330/90817", "tuition": 12000, "plan": 3}]}, {"name": "高速铁路客运服务", "category": "交通航空", "options": [{"school": "武汉商贸职业学院", "group_code": "C607(01)", "profession_code": "25", "raw_name": "高速铁路客运服务 (办学地点:武汉校区)", "score25": "-/-", "score24": "330/90817", "tuition": 12000, "plan": 15}, {"school": "武汉交通职业学院 乡村振兴计划", "group_code": "C537(09)", "profession_code": "64", "raw_name": "高速铁路客运服务 (乡村振兴)", "score25": "-/-", "score24": "-/-", "tuition": 5000, "plan": 5}]}, {"name": "医学美容技术", "category": "健康生活", "options": [{"school": "湖北健康职业学院", "group_code": "C612(01)", "profession_code": "03", "raw_name": "医学美容技术", "score25": "-/-", "score24": "251/117666", "tuition": 12900, "plan": 115}, {"school": "武汉光谷职业学院", "group_code": "C611(01)", "profession_code": "24", "raw_name": "医学美容技术", "score25": "-/-", "score24": "-/-", "tuition": 10200, "plan": 85}]}, {"name": "宠物医疗技术", "category": "健康生活", "options": [{"school": "湖北健康职业学院", "group_code": "C612(01)", "profession_code": "11", "raw_name": "宠物医疗技术", "score25": "-/-", "score24": "-/-", "tuition": 12900, "plan": 90}]}, {"name": "人工智能技术应用", "category": "理工技术", "options": [{"school": "湖北职业技术学院 乡村振兴计划", "group_code": "C505(04)", "profession_code": "49", "raw_name": "人工智能技术应用 (乡村振兴)", "score25": "314/110853", "score24": "301/103228", "tuition": 5000, "plan": 5}, {"school": "武昌职业学院", "group_code": "C608(10)", "profession_code": "60", "raw_name": "人工智能技术应用", "score25": "-/-", "score24": "296/105123", "tuition": 16600, "plan": 30}]}, {"name": "新能源汽车技术", "category": "理工技术", "options": [{"school": "湖北交通职业技术学院 中外合作办学", "group_code": "C523(06)", "profession_code": "48", "raw_name": "新能源汽车技术 (中外合作办学)(与日本中日本自动车短期大学合作办学)", "score25": "372/83620", "score24": "363/75276", "tuition": 17000, "plan": 20}, {"school": "武汉城市学院", "group_code": "C212(04)", "profession_code": "62", "raw_name": "新能源汽车技术 (第一年红安教育改革基地，第二年回武汉主校区)", "score25": "-/-", "score24": "288/107919", "tuition": 9000, "plan": 110}, {"school": "湖北开放职业学院", "group_code": "C601(01)", "profession_code": "11", "raw_name": "新能源汽车技术", "score25": "-/-", "score24": "347/82851", "tuition": 11880, "plan": 20}]}, {"name": "药品生物技术", "category": "理工技术", "options": [{"school": "湖北工业职业技术学院 中外合作办学", "group_code": "C506(08)", "profession_code": "44", "raw_name": "药品生物技术 (中外合作办学)(与白俄罗斯莫吉廖夫国立大学合作办学)", "score25": "203/136151", "score24": "-/-", "tuition": 15000, "plan": 15}]}];
const API_URL = "api.php";
const list = document.getElementById("list");
const saveStatus = document.getElementById("saveStatus");
const toast = document.getElementById("toast");

let sharedState = {
  version: 1,
  updatedAt: "",
  order: ITEMS.map(x => x.name),
  selected: Object.fromEntries(ITEMS.map(x => [x.name, true]))
};
let lastServerUpdatedAt = "";
let saveTimer = null;
let saveInFlight = false;
let saveAgain = false;
let dragging = null;
let localDirty = false;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
function money(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("zh-CN")+"元/年" : "-";
}
function setStatus(text, type="") {
  saveStatus.textContent = text;
  saveStatus.className = "save-status" + (type ? " "+type : "");
}
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => toast.classList.remove("show"), 1300);
}
function schoolHTML(o) {
  return `
    <div class="school">
      <div class="school-name">${esc(o.school)}</div>
      <div class="school-meta">
        专业组 ${esc(o.group_code)} · 专业代码 ${esc(o.profession_code)} ·
        学费 ${money(o.tuition)} · 计划 ${esc(o.plan)} 人<br>
        ${esc(o.raw_name)}
      </div>
    </div>`;
}
function normalizeState(state) {
  const itemNames = ITEMS.map(x => x.name);
  const allowed = new Set(itemNames);
  const seen = new Set();
  const order = [];
  if (Array.isArray(state?.order)) {
    state.order.forEach(name => {
      if (allowed.has(name) && !seen.has(name)) {
        order.push(name);
        seen.add(name);
      }
    });
  }
  itemNames.forEach(name => {
    if (!seen.has(name)) order.push(name);
  });
  const selected = {};
  itemNames.forEach(name => {
    selected[name] = state?.selected?.[name] !== false;
  });
  return {
    version: 1,
    updatedAt: typeof state?.updatedAt === "string" ? state.updatedAt : "",
    order,
    selected
  };
}
function orderedItems() {
  const byName = new Map(ITEMS.map(x => [x.name,x]));
  return sharedState.order.map(name => byName.get(name)).filter(Boolean);
}
function render() {
  const ordered = orderedItems().sort((a,b) =>
    Number(sharedState.selected[b.name] !== false) - Number(sharedState.selected[a.name] !== false)
  );
  sharedState.order = ordered.map(x => x.name);

  list.innerHTML = ordered.map(item => {
    const checked = sharedState.selected[item.name] !== false;
    return `
      <section class="item ${checked ? "" : "excluded"}" data-name="${esc(item.name)}">
        <div class="item-main">
          <input class="select-box" type="checkbox" ${checked ? "checked" : ""} aria-label="是否考虑">
          <div class="rank"></div>
          <div>
            <div class="name">${esc(item.name)}${checked ? "" : '<span class="status-text">不考虑</span>'}</div>
            <div class="school-count">${item.options.length} 个学校/专业项</div>
          </div>
          <button class="icon-btn up" type="button" title="上移">↑</button>
          <button class="icon-btn down" type="button" title="下移">↓</button>
          <button class="icon-btn expand" type="button" title="查看学校">⌄</button>
        </div>
        <div class="details">${item.options.map(schoolHTML).join("")}</div>
      </section>`;
  }).join("");

  bindEvents();
  updateRanks();
}
function collectStateFromDom() {
  sharedState.order = [...list.querySelectorAll(".item")].map(el => el.dataset.name);
  sharedState.selected = {};
  list.querySelectorAll(".item").forEach(el => {
    sharedState.selected[el.dataset.name] = el.querySelector(".select-box").checked;
  });
}
function updateRanks() {
  let selectedRank = 0;
  list.querySelectorAll(".item").forEach(el => {
    const checked = el.querySelector(".select-box").checked;
    el.querySelector(".rank").textContent = checked ? ++selectedRank : "×";
  });
}
function sameGroup(a,b) {
  return a && b &&
    a.querySelector(".select-box").checked === b.querySelector(".select-box").checked;
}
function moveUp(item) {
  const prev = item.previousElementSibling;
  if (!sameGroup(item, prev)) return;
  list.insertBefore(item, prev);
  changed("已上移");
}
function moveDown(item) {
  const next = item.nextElementSibling;
  if (!sameGroup(item, next)) return;
  list.insertBefore(next, item);
  changed("已下移");
}
function placeBySelection(item, checked) {
  if (checked) {
    const firstExcluded = [...list.querySelectorAll(".item")]
      .find(el => !el.querySelector(".select-box").checked && el !== item);
    if (firstExcluded) list.insertBefore(item, firstExcluded);
    else list.appendChild(item);
  } else {
    list.appendChild(item);
  }
  item.classList.toggle("excluded", !checked);
  const nameEl = item.querySelector(".name");
  nameEl.innerHTML = checked
    ? esc(item.dataset.name)
    : esc(item.dataset.name)+'<span class="status-text">不考虑</span>';
}
function changed(message="") {
  collectStateFromDom();
  updateRanks();
  localDirty = true;
  setStatus("正在保存…","saving");
  if (message) showToast(message);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 450);
}
async function loadState(showLoading=false) {
  try {
    if (showLoading) setStatus("正在读取…");
    const response = await fetch(API_URL+"?t="+Date.now(), {cache:"no-store"});
    if (!response.ok) throw new Error("读取失败");
    const data = await response.json();
    if (!data.ok || !data.state) throw new Error("数据格式错误");

    const incoming = normalizeState(data.state);
    if (!localDirty && !saveInFlight) {
      const changedOnServer = incoming.updatedAt !== lastServerUpdatedAt;
      sharedState = incoming;
      lastServerUpdatedAt = incoming.updatedAt;
      render();
      if (changedOnServer && !showLoading) showToast("已同步最新结果");
    }

    const timeText = incoming.updatedAt
      ? new Date(incoming.updatedAt).toLocaleTimeString("zh-CN", {hour:"2-digit",minute:"2-digit"})
      : "";
    setStatus(timeText ? "已同步 "+timeText : "已同步","saved");
  } catch (err) {
    setStatus("读取失败","error");
    if (showLoading) {
      render();
      showToast("读取共享结果失败，已显示默认顺序");
    }
  }
}
async function saveState() {
  if (saveInFlight) {
    saveAgain = true;
    return;
  }
  saveInFlight = true;
  localDirty = true;
  collectStateFromDom();
  setStatus("正在保存…","saving");

  try {
    const response = await fetch(API_URL, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        order:sharedState.order,
        selected:sharedState.selected
      })
    });
    if (!response.ok) throw new Error("保存失败");
    const data = await response.json();
    if (!data.ok || !data.state) throw new Error(data.error || "保存失败");

    sharedState = normalizeState(data.state);
    lastServerUpdatedAt = sharedState.updatedAt;
    localDirty = false;
    const timeText = new Date(sharedState.updatedAt).toLocaleTimeString("zh-CN", {
      hour:"2-digit", minute:"2-digit"
    });
    setStatus("已保存 "+timeText,"saved");
  } catch (err) {
    setStatus("保存失败","error");
    showToast("保存失败，请检查服务器写入权限");
  } finally {
    saveInFlight = false;
    if (saveAgain) {
      saveAgain = false;
      saveState();
    }
  }
}
function bindEvents() {
  list.querySelectorAll(".select-box").forEach(box => {
    box.addEventListener("click", e => e.stopPropagation());
    box.addEventListener("change", () => {
      const item = box.closest(".item");
      placeBySelection(item, box.checked);
      changed(box.checked ? "已恢复考虑" : "已移至不考虑");
    });
  });
  list.querySelectorAll(".up").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      moveUp(btn.closest(".item"));
    });
  });
  list.querySelectorAll(".down").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      moveDown(btn.closest(".item"));
    });
  });
  list.querySelectorAll(".expand").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const item = btn.closest(".item");
      item.classList.toggle("open");
      btn.textContent = item.classList.contains("open") ? "⌃" : "⌄";
    });
  });
  bindDrag();
}
function bindDrag() {
  let pointerId = null;
  let startY = 0;
  let moved = false;
  let activeRow = null;

  list.querySelectorAll(".item-main").forEach(row => {
    row.addEventListener("pointerdown", e => {
      if (e.target.closest("button") || e.target.closest(".select-box")) return;
      if (e.button !== undefined && e.button !== 0) return;
      dragging = row.closest(".item");
      pointerId = e.pointerId;
      startY = e.clientY;
      moved = false;
      activeRow = row;
      row.setPointerCapture(pointerId);
      dragging.classList.add("dragging");
      document.body.style.userSelect = "none";
      e.preventDefault();
    });
    row.addEventListener("pointermove", e => {
      if (!dragging || e.pointerId !== pointerId) return;
      if (Math.abs(e.clientY-startY)>4) moved = true;
      if (e.clientY<70) window.scrollBy(0,-18);
      if (e.clientY>window.innerHeight-60) window.scrollBy(0,18);

      const hit = document.elementFromPoint(e.clientX,e.clientY);
      const target = hit ? hit.closest(".item") : null;
      if (!target || target===dragging || !sameGroup(dragging,target)) return;

      const rect = target.getBoundingClientRect();
      list.insertBefore(dragging,
        e.clientY < rect.top+rect.height/2 ? target : target.nextSibling);
      e.preventDefault();
    });
    const end = e => {
      if (!dragging || e.pointerId!==pointerId) return;
      dragging.classList.remove("dragging");
      try { activeRow.releasePointerCapture(pointerId); } catch(err) {}
      dragging = null;
      pointerId = null;
      activeRow = null;
      document.body.style.userSelect = "";
      if (moved) changed("排序已更新");
    };
    row.addEventListener("pointerup",end);
    row.addEventListener("pointercancel",end);
  });
}

loadState(true);
setInterval(() => {
  if (!dragging && !localDirty && !saveInFlight) loadState(false);
}, 10000);

window.addEventListener("beforeunload", () => {
  if (!localDirty) return;
  collectStateFromDom();
  navigator.sendBeacon(API_URL, new Blob([JSON.stringify({
    order:sharedState.order,
    selected:sharedState.selected
  })], {type:"application/json"}));
});
</script>
</body>
</html>
