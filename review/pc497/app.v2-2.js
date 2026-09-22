// src/review-state.mjs
var cleanReview = (r) => r ? Object.fromEntries(Object.entries(r).filter(([k]) => k !== "restore_review")) : null;
function projectReview(reviews, values, { action, field, text = "" }) {
  const next = { ...reviews }, old = next[field], revision = values[field].revision;
  if (action === "confirm") next[field] = { ...old, status: "CONFIRMED", field_revision: revision, explicit_confirmed: true, note: "", restore_review: null };
  else if (action === "discuss" || action === "set_discuss") next[field] = { ...old, status: "DISCUSS", field_revision: revision, note: text, restore_review: old?.status === "DISCUSS" ? old.restore_review : cleanReview(old) };
  else if (action === "undiscuss" && old?.restore_review?.field_revision === revision) next[field] = cleanReview(old.restore_review);
  else delete next[field];
  return next;
}

// src/shared.mjs
var BASELINE_SHA = "9f560ecdd6651671cd55bfbccd5e4b65bf9a2d00cf60088f015304e1eef7fbdc";
var BASE = "/review/pc497/";
var API = BASE + "api/";
var STATUS = { NOT_REVIEWED: "\u672A\u5BA1\u6838", IN_PROGRESS: "\u5BA1\u6838\u4E2D", COMPLETED: "\u5DF2\u5B8C\u6210", DISCUSS: "\u5F85\u786E\u8BA4" };
var TIER_LABELS = { P1: "P1", P2: "P2", P3: "P3" };
function tierSummary(cells, values, reviews) {
  const counts2 = { P1: 0, P2: 0, P3: 0 };
  for (const c of cells) if (["P1", "P2"].includes(c.review_tier) && humanStatus(c.text, values[c.field_id], reviews[c.field_id]) === "\u672A\u5BA1\u6838") counts2[c.review_tier]++;
  return { ...counts2, pending: counts2.P1 + counts2.P2, highest: ["P1", "P2"].find((t) => counts2[t]) || "" };
}
function humanStatus(initial, current, review) {
  if (review?.status === "DISCUSS" && review.field_revision === current.revision) return "\u5F85\u786E\u8BA4";
  if (current.text !== initial && !(current.science_patch && current.science_patch_revision === current.revision && current.science_patch_text === current.text)) return "\u5DF2\u4FEE\u6539";
  if (review?.status === "CONFIRMED" && review.field_revision === current.revision) return "\u5DF2\u6838\u5BF9";
  return "\u672A\u5BA1\u6838";
}
function beijingTime(value) {
  return value ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value)) : "";
}
var lf = (s) => String(s ?? "").replace(/\r\n?/g, "\n");
var NOTE_LABELS = { GENERAL: "\u603B\u4F53\u8BF4\u660E", M01: "\u6587\u732E\u8BC6\u522B", M02: "\u7814\u7A76\u8BBE\u8BA1\u4E0E\u6765\u6E90", M03: "\u75BE\u75C5\u3001\u4EBA\u7FA4\u4E0E\u4EBA\u53E3\u5B66", M04: "\u75C5\u7A0B\u4E0E\u76F8\u5173\u75C5\u53F2", M05: "\u80BF\u7624\u90E8\u4F4D", M06: "\u80BF\u7624\u5927\u5C0F\u4E0E\u6570\u91CF", M07: "\u539F\u53D1\u4E0E\u590D\u53D1\u72B6\u6001" };
function assembleNotes(segments) {
  return Object.entries(NOTE_LABELS).filter(([k]) => lf(segments[k]?.text ?? segments[k]).trim()).map(([k, label]) => (k === "GENERAL" ? "" : "\u3010" + label + "\u3011") + lf(segments[k]?.text ?? segments[k])).join("\n");
}

// src/sandbox.mjs
var Sandbox = class {
  constructor() {
    this.reset();
    this.storage = { getItem: () => null, setItem: () => {
    }, removeItem: () => {
    } };
  }
  reset(account = null) {
    this.enabled = account?.sandbox_mode === true;
    this.records = /* @__PURE__ */ new Map();
  }
  async request(path, options = {}, network) {
    if (!this.enabled || path.startsWith("auth/")) return network(path, options);
    const method = options.method || "GET", parts = path.split("/"), id = parts[1];
    if (method === "GET") {
      if (parts[0] === "records" && id) {
        if (!this.records.has(id)) this.records.set(id, structuredClone(await network("records/" + id)));
        const r2 = this.records.get(id);
        return structuredClone(parts[2] === "review" ? { state: r2.state, values: r2.values, reviews: r2.reviews } : r2);
      }
      const data = await network(path, options);
      if (path === "records") for (const row of data.records) {
        const r2 = this.records.get(row.id);
        if (r2) Object.assign(row, { status: r2.state.status, tier_summary: tierSummary(r2.cells, r2.values, r2.reviews) });
      }
      return data;
    }
    const r = this.records.get(id), b = options.body || {};
    const fail = (message) => {
      const e = Error(message);
      e.status = 409;
      throw e;
    };
    if (parts[0] !== "records" || !r) throw Error("\u6C99\u76D2\u5DF2\u963B\u6B62\u672A\u77E5\u4E1A\u52A1\u5199\u5165");
    if (method === "PATCH" && ["fields", "remarks"].includes(parts[2])) {
      const unit = parts[3], v = r.values[unit];
      if (!v || v.revision !== b.expected_revision) fail("\u6C99\u76D2\u5B57\u6BB5\u7248\u672C\u5DF2\u53D8\u5316");
      const text = lf(b.text), changed = v.text !== text;
      if (changed) {
        Object.assign(v, { text, revision: v.revision + 1, last_author: "srstest" });
        const field = unit.startsWith("SRS") ? unit : "SRS37";
        if (field === "SRS37") {
          r.values.SRS37.text = assembleNotes(r.values);
          r.values.SRS37.revision++;
        }
        if (r.reviews[field]?.status === "CONFIRMED") delete r.reviews[field];
        if (r.reviews[field]?.status === "DISCUSS") r.reviews[field].field_revision = r.values[field].revision;
        r.state.revision++;
        r.state.status = Object.values(r.reviews).some((x) => x.status === "DISCUSS") ? "DISCUSS" : "IN_PROGRESS";
      }
      return structuredClone({ ok: true, changed, text: v.text, revision: v.revision, state: r.state, notes: r.values.SRS37 });
    }
    if (method === "POST" && parts[2] === "review") {
      if (r.state.revision !== (b.action === "complete" ? b.expected_revision : b.expected_record_revision)) fail("\u6C99\u76D2\u6587\u7AE0\u7248\u672C\u5DF2\u53D8\u5316");
      if (b.action === "complete") {
        if (Object.values(r.reviews).some((x) => x.status === "DISCUSS")) fail("\u4ECD\u6709\u5F85\u786E\u8BA4\u4E8B\u9879");
        const unresolved = r.cells.filter((c) => humanStatus(c.text, r.values[c.field_id], r.reviews[c.field_id]) === "\u672A\u5BA1\u6838");
        if (unresolved.some((c) => c.review_tier === "P1")) fail("\u4ECD\u6709\u672A\u5BA1\u6838 P1");
        if (unresolved.length && !b.confirm_remaining) fail("\u8BF7\u786E\u8BA4\u5176\u4F59\u5B57\u6BB5");
        for (const c of unresolved) r.reviews = projectReview(r.reviews, r.values, { action: "confirm", field: c.field_id });
        r.state.status = "COMPLETED";
      } else {
        if (r.values[b.field_id]?.revision !== b.expected_revision) fail("\u6C99\u76D2\u5B57\u6BB5\u7248\u672C\u5DF2\u53D8\u5316");
        if (!["confirm", "unconfirm", "discuss", "set_discuss", "undiscuss"].includes(b.action)) throw Error("\u6C99\u76D2\u5DF2\u963B\u6B62\u672A\u77E5\u5BA1\u6838\u52A8\u4F5C");
        r.reviews = projectReview(r.reviews, r.values, { action: b.action, field: b.field_id, text: b.text });
        r.state.status = Object.values(r.reviews).some((x) => x.status === "DISCUSS") ? "DISCUSS" : "IN_PROGRESS";
      }
      r.state.revision++;
      return structuredClone({ ok: true, state: r.state, values: r.values, reviews: r.reviews, notes: r.values.SRS37 });
    }
    throw Error("\u6C99\u76D2\u5DF2\u963B\u6B62\u4E1A\u52A1\u5199\u5165");
  }
};

// config/field_registry.json
var field_registry_default = { schema_version: "0.3", status: "INTERFACE_ONLY_NO_PUBLISHED_CONTENT", modules: [{ module_id: "M01", label: "\u6587\u732E\u8BC6\u522B", order: 1, field_ids: ["SRS01", "SRS02", "SRS03", "SRS04", "SRS05"] }, { module_id: "M02", label: "\u7814\u7A76\u8BBE\u8BA1\u4E0E\u6765\u6E90", order: 2, field_ids: ["SRS06", "SRS07", "SRS08", "SRS09", "SRS10", "SRS11", "SRS12"] }, { module_id: "M03", label: "\u75BE\u75C5\u3001\u4EBA\u7FA4\u4E0E\u4EBA\u53E3\u5B66", order: 3, field_ids: ["SRS13", "SRS14", "SRS15", "SRS16", "SRS17", "SRS18"] }, { module_id: "M04", label: "\u75C5\u7A0B\u4E0E\u76F8\u5173\u75C5\u53F2", order: 4, field_ids: ["SRS19", "SRS20", "SRS21", "SRS22", "SRS23", "SRS24"] }, { module_id: "M05", label: "\u80BF\u7624\u90E8\u4F4D", order: 5, field_ids: ["SRS25", "SRS26", "SRS27", "SRS28"] }, { module_id: "M06", label: "\u80BF\u7624\u5927\u5C0F\u4E0E\u6570\u91CF", order: 6, field_ids: ["SRS29", "SRS30", "SRS31", "SRS32", "SRS33"] }, { module_id: "M07", label: "\u539F\u53D1\u4E0E\u590D\u53D1\u72B6\u6001", order: 7, field_ids: ["SRS34", "SRS35", "SRS36"] }, { module_id: "M08", label: "\u5907\u6CE8\u6C47\u603B", order: 8, field_ids: ["SRS37"] }], fields: [{ requirement_id: "SRS01", original_column: "A", original_header: "key", original_instruction: "PDF\u547D\u540D", concept_or_path: "record.record_id", domain: "ADMIN", operational_note: "\u6587\u732E\u7F16\u53F7\u6765\u81EA\u56FA\u5B9A\u6E05\u5355\uFF1B\u4E0D\u5FC5\u4F2A\u9020\u539F\u6587\u9AD8\u4EAE", field_id: "SRS01", order: 1, module_id: "M01", label: "key", editable_in_final_platform: false }, { requirement_id: "SRS02", original_column: "B", original_header: "\u9898\u76EE", original_instruction: "\u6587\u7AE0\u7684\u9898\u76EE", concept_or_path: "source.title", domain: "BIBLIOGRAPHY", operational_note: "\u539F\u6587\u9898\u540D\uFF1B\u6E05\u5355\u9898\u540D\u53EA\u4F5C\u6838\u5BF9\u7EBF\u7D22", field_id: "SRS02", order: 2, module_id: "M01", label: "\u9898\u76EE", editable_in_final_platform: true }, { requirement_id: "SRS03", original_column: "C", original_header: "\u4E3B\u7814\u7A76\u7684Study ID\uFF08\u4F5C\u8005+\u5E74\u4EE3\uFF09", original_instruction: "\u4E3B\u7814\u7A76\u7684\u4F5C\u8005\u5168\u540D+\u5E74\u4EFD", concept_or_path: "record.study_label", domain: "BIBLIOGRAPHY", operational_note: "\u4F5C\u8005+\u5E74\u4EFD\u663E\u793A\u6807\u7B7E\uFF1B\u4E0D\u628A\u6807\u7B7E\u5F53\u72EC\u7ACBstudy/cohort\u8EAB\u4EFD", field_id: "SRS03", order: 3, module_id: "M01", label: "\u4E3B\u7814\u7A76\u7684Study ID\uFF08\u4F5C\u8005+\u5E74\u4EE3\uFF09", editable_in_final_platform: true }, { requirement_id: "SRS04", original_column: "D", original_header: "\u5168\u6587/\u6458\u8981\n", original_instruction: "\u662F\u5426\u5168\u6587", concept_or_path: "source.report_extent", domain: "SOURCE", operational_note: "\u5168\u6587/\u4F1A\u8BAE\u6458\u8981/\u90E8\u5206\u5168\u6587\u7B49\u6309\u5B9E\u9645\u6E90", field_id: "SRS04", order: 4, module_id: "M01", label: "\u5168\u6587/\u6458\u8981", editable_in_final_platform: true }, { requirement_id: "SRS05", original_column: "E", original_header: "\u4E2D\u6587/\u82F1\u6587", original_instruction: "\u53D1\u8868\u7684\u8BED\u8A00", concept_or_path: "source.language", domain: "SOURCE", operational_note: "\u4FDD\u7559\u5B9E\u9645\u8BED\u8A00", field_id: "SRS05", order: 5, module_id: "M01", label: "\u4E2D\u6587/\u82F1\u6587", editable_in_final_platform: true }, { requirement_id: "SRS06", original_column: "F", original_header: "\u7814\u7A76\u8BBE\u8BA1", original_instruction: "\u968F\u673A\u5BF9\u7167\u8BD5\u9A8C\uFF08RCT\uFF09\uFF0C\u975E\u968F\u673A\u5BF9\u7167\u8BD5\u9A8C\uFF08CCT\uFF09\uFF0C\u5355\u81C2\u8BD5\u9A8C\uFF08ST\uFF09\uFF0C\u89C2\u5BDF\u6027\u7814\u7A76\uFF08OS\uFF09", concept_or_path: "study.design", domain: "STUDY", operational_note: "\u4FDD\u7559\u4F5C\u8005\u539F\u8BCD\u3001\u5B9E\u9645\u8BBE\u8BA1\u7EC6\u8282\u53CASRS\u7C97\u5206\u7C7B", field_id: "SRS06", order: 6, module_id: "M02", label: "\u7814\u7A76\u8BBE\u8BA1", editable_in_final_platform: true }, { requirement_id: "SRS07", original_column: "G", original_header: "\u8BD5\u9A8C\u53F7", original_instruction: "\u8BD5\u9A8C\u7684\u53F7", concept_or_path: "study.registration_id", domain: "STUDY", operational_note: "\u6309\u539F\u6587", field_id: "SRS07", order: 7, module_id: "M02", label: "\u8BD5\u9A8C\u53F7", editable_in_final_platform: true }, { requirement_id: "SRS08", original_column: "H", original_header: "\u8BD5\u9A8C\u540D\u79F0", original_instruction: "\u8BD5\u9A8C\u7684\u540D\u5B57", concept_or_path: "study.trial_name", domain: "STUDY", operational_note: "\u6309\u539F\u6587", field_id: "SRS08", order: 8, module_id: "M02", label: "\u8BD5\u9A8C\u540D\u79F0", editable_in_final_platform: true }, { requirement_id: "SRS09", original_column: "I", original_header: "\u7814\u7A76\u7684\u4E2D\u5FC3\u6570", original_instruction: "\u5355/\u591A\u4E2D\u5FC3\u7814\u7A76", concept_or_path: "study.centres", domain: "STUDY", operational_note: "single/multi\u4E0E\u786E\u5207\u4E2D\u5FC3\u6570\u5206\u522B\u4FDD\u7559", field_id: "SRS09", order: 9, module_id: "M02", label: "\u7814\u7A76\u7684\u4E2D\u5FC3\u6570", editable_in_final_platform: true }, { requirement_id: "SRS10", original_column: "J", original_header: "\u60A3\u8005\u7684\u62DB\u52DF\u5730\u533A", original_instruction: "\u7701/\u5E02", concept_or_path: "geography.recruitment", domain: "GEOGRAPHY", operational_note: "\u4E0D\u4EE5\u4F5C\u8005\u5355\u4F4D\u66FF\u4EE3\u60A3\u8005\u6765\u6E90", field_id: "SRS10", order: 10, module_id: "M02", label: "\u60A3\u8005\u7684\u62DB\u52DF\u5730\u533A", editable_in_final_platform: true }, { requirement_id: "SRS11", original_column: "K", original_header: "\u5F00\u5C55\u7814\u7A76\u7684\u533B\u9662", original_instruction: "\u5177\u4F53\u5230\u79D1\u5BA4", concept_or_path: "study.institutions", domain: "STUDY", operational_note: "\u533B\u9662\u3001\u79D1\u5BA4\u3001\u89D2\u8272\u53CA\u8BC1\u636E", field_id: "SRS11", order: 11, module_id: "M02", label: "\u5F00\u5C55\u7814\u7A76\u7684\u533B\u9662", editable_in_final_platform: true }, { requirement_id: "SRS12", original_column: "L", original_header: "\u6837\u672C\u5165\u7EC4\u65F6\u95F4\u8303\u56F4", original_instruction: "\u5982\uFF1A2013\u5E746\u6708\u81F32023\u5E749\u6708", concept_or_path: "time.recruitment", domain: "TIME", operational_note: "\u539F\u6587\u533A\u95F4\u53CA\u5E74\u6708\u7CBE\u5EA6", field_id: "SRS12", order: 12, module_id: "M02", label: "\u6837\u672C\u5165\u7EC4\u65F6\u95F4\u8303\u56F4", editable_in_final_platform: true }, { requirement_id: "SRS13", original_column: "M", original_header: "\u75BE\u75C5", original_instruction: "\u5177\u4F53\u7684DT\u75BE\u75C5\u79CD\u7C7B", concept_or_path: "disease.description", domain: "POPULATION", operational_note: "\u539F\u75C5\u79CD\u4E0E\u672C\u6B21DT\u76EE\u6807\u5B50\u96C6", field_id: "SRS13", order: 13, module_id: "M03", label: "\u75BE\u75C5", editable_in_final_platform: true }, { requirement_id: "SRS14", original_column: "N", original_header: "\u8BCA\u65AD\u6807\u51C6", original_instruction: "\u786C\u7EA4\u7EF4\u7624\u7684\u786E\u8BCA\u65B9\u6CD5", concept_or_path: "diagnosis.criteria", domain: "POPULATION", operational_note: "\u8BCA\u65AD\u4F9D\u636E\u3001\u8BC6\u522B\u65B9\u6CD5\u4E0E\u5B9A\u4E49", field_id: "SRS14", order: 14, module_id: "M03", label: "\u8BCA\u65AD\u6807\u51C6", editable_in_final_platform: true }, { requirement_id: "SRS15", original_column: "O", original_header: "\u6837\u672C\u91CF", original_instruction: "\u4E2D\u56FDDT\u60A3\u8005\u7684\u4F8B\u6570", concept_or_path: "population.size", domain: "POPULATION", operational_note: "\u4E2D\u56FDDT\u6570\u4E0E\u5168\u7814\u7A76/\u5B50\u96C6/\u68C0\u6D4B\u6570\u5206\u522B\u8BB0\u5F55", field_id: "SRS15", order: 15, module_id: "M03", label: "\u6837\u672C\u91CF", editable_in_final_platform: true }, { requirement_id: "SRS16", original_column: "P", original_header: "\u5E74\u9F84\u8303\u56F4 (\u5E74/\u6708)", original_instruction: "18\u5C81\u81F360\u5C81", concept_or_path: "demographics.age", domain: "DEMOGRAPHY", operational_note: "range\u4E0E\u5B9E\u9645\u5E74\u9F84\u65F6\u95F4\u70B9", field_id: "SRS16", order: 16, module_id: "M03", label: "\u5E74\u9F84\u8303\u56F4 (\u5E74/\u6708)", editable_in_final_platform: true }, { requirement_id: "SRS17", original_column: "Q", original_header: "\u5E74\u9F84 (\u5E74/\u6708) mean\xB1SD", original_instruction: "\u4F18\u5148\u5199mean\xB1SD\uFF0C\u5982\u662F\u5176\u4ED6\u53D8\u91CF\u5F62\u5F0F\uFF0C\u9700\u8981\u5199\u660E\u5177\u4F53\uFF0C\u5982median (IQR): 45 (20-67)", concept_or_path: "demographics.age", domain: "DEMOGRAPHY", operational_note: "\u5168\u90E8\u539F\u62A5\u7EDF\u8BA1\u5F62\u5F0F\uFF0C\u4E0D\u5F3A\u5236mean\xB1SD", field_id: "SRS17", order: 17, module_id: "M03", label: "\u5E74\u9F84 (\u5E74/\u6708) mean\xB1SD", editable_in_final_platform: true }, { requirement_id: "SRS18", original_column: "R", original_header: "\u5973\u6027\u4EBA\u6570\uFF08%\uFF09", original_instruction: "n(%)", concept_or_path: "demographics.sex", domain: "DEMOGRAPHY", operational_note: "\u5973\u6027n/N\u53CA\u539F\u62A5\u767E\u5206\u6BD4\uFF1B\u5176\u4ED6\u6027\u522B\u7C7B\u522B\u4FDD\u7559", field_id: "SRS18", order: 18, module_id: "M03", label: "\u5973\u6027\u4EBA\u6570\uFF08%\uFF09", editable_in_final_platform: true }, { requirement_id: "SRS19", original_column: "S", original_header: "\u75C5\u7A0B\u65F6\u957F\uFF08\u5E74/\u6708\uFF09 mean\xB1SD", original_instruction: "\u4F18\u5148\u5199mean\xB1SD\uFF0C\u5982\u662F\u5176\u4ED6\u53D8\u91CF\u5F62\u5F0F\uFF0C\u9700\u8981\u5199\u660E\u5177\u4F53\uFF0C\u5982median (IQR): 45 (20-67)", concept_or_path: "history.disease_duration", domain: "HISTORY", operational_note: "\u8D77\u6B62\u4E8B\u4EF6\u4E0E\u7EDF\u8BA1\u5F62\u5F0F", field_id: "SRS19", order: 19, module_id: "M04", label: "\u75C5\u7A0B\u65F6\u957F\uFF08\u5E74/\u6708\uFF09 mean\xB1SD", editable_in_final_platform: true }, { requirement_id: "SRS20", original_column: "T", original_header: "\u53D1\u75C5\u90E8\u4F4D\u624B\u672F\u53F2\u4EBA\u6570\uFF08%\uFF09", original_instruction: "n(%)", concept_or_path: "history.surgery", domain: "HISTORY", operational_note: "\u53D1\u75C5\u524D\u540C\u90E8\u4F4D\u624B\u672F\u4E0E\u65E2\u5F80DT\u5207\u9664\u5206\u5F00", field_id: "SRS20", order: 20, module_id: "M04", label: "\u53D1\u75C5\u90E8\u4F4D\u624B\u672F\u53F2\u4EBA\u6570\uFF08%\uFF09", editable_in_final_platform: true }, { requirement_id: "SRS21", original_column: "U", original_header: "\u65E2\u5F80\u521B\u4F24\u53F2\u4EBA\u6570\uFF08%\uFF09", original_instruction: "n(%)", concept_or_path: "history.trauma", domain: "HISTORY", operational_note: "\u90E8\u4F4D\u3001\u65F6\u5E8F\u3001\u9002\u7528\u5206\u6BCD", field_id: "SRS21", order: 21, module_id: "M04", label: "\u65E2\u5F80\u521B\u4F24\u53F2\u4EBA\u6570\uFF08%\uFF09", editable_in_final_platform: true }, { requirement_id: "SRS22", original_column: "V", original_header: "FAP\u5BB6\u65CF\u53F2\u4EBA\u6570\uFF08%\uFF09", original_instruction: "n(%)\n\u6307\u5BB6\u65CF\u4E2D\u6709 FAP\uFF08\u5BB6\u65CF\u6027\u817A\u7624\u6027\u606F\u8089\u75C5\uFF09\u60A3\u8005\uFF0C\u4E5F\u5C31\u662F\u5BB6\u7CFB\u643A\u5E26APC\u80DA\u7CFB\u7A81\u53D8\uFF0C\u4EB2\u5C5E\u786E\u8BCA FAP\u3002\u672C\u4EBA\u53EF\u80FD\u4EC5\u53D1\u751F\u786C\u7EA4\u7EF4\u7624\uFF0C\u4E0D\u4E00\u5B9A\u6709FAP\u3002", concept_or_path: "history.fap_family", domain: "HISTORY", operational_note: "\u5BB6\u65CF\u53F2\uFF1B\u4E0D\u81EA\u52A8\u8865\u9057\u4F20\u68C0\u6D4B\u7ED3\u8BBA", field_id: "SRS22", order: 22, module_id: "M04", label: "FAP\u5BB6\u65CF\u53F2\u4EBA\u6570\uFF08%\uFF09", editable_in_final_platform: true }, { requirement_id: "SRS23", original_column: "W", original_header: "\u5408\u5E76FAP\uFF08\u5BB6\u65CF\u6027\u817A\u7624\u6837\u606F\u8089\u75C5\uFF09\u4EBA\u6570\uFF08%\uFF09", original_instruction: "n(%)\n\u60A3\u8005\u81EA\u8EAB\u65E2\u60A3\u6709\u786C\u7EA4\u7EF4\u7624\uFF0C\u540C\u65F6\u672C\u4EBA\u786E\u8BCA FAP\uFF08\u81EA\u8EAB\u643A\u5E26 APC \u80DA\u7CFB\u7A81\u53D8\u3001\u7ED3\u80A0\u591A\u53D1\u817A\u7624\u606F\u8089\uFF09", concept_or_path: "history.fap_personal", domain: "HISTORY", operational_note: "\u672C\u4EBAFAP\u4E0E\u57FA\u56E0\u68C0\u6D4B\u5206\u5F00", field_id: "SRS23", order: 23, module_id: "M04", label: "\u5408\u5E76FAP\uFF08\u5BB6\u65CF\u6027\u817A\u7624\u6837\u606F\u8089\u75C5\uFF09\u4EBA\u6570\uFF08%\uFF09", editable_in_final_platform: true }, { requirement_id: "SRS24", original_column: "X", original_header: "\u751F\u80B2\u671F\uFF08\u598A\u5A20\u671F\u53CA\u4EA7\u540E\uFF09\u53D1\u75C5\u4EBA\u6570\uFF08%\uFF09", original_instruction: "n(%)", concept_or_path: "history.pregnancy_onset", domain: "HISTORY", operational_note: "\u598A\u5A20/\u4EA7\u540E\u539F\u59CB\u65F6\u95F4\u4E0E\u5206\u6BCD\uFF1B\u7EDF\u4E00\u7A97\u5F85\u786E\u8BA4", field_id: "SRS24", order: 24, module_id: "M04", label: "\u751F\u80B2\u671F\uFF08\u598A\u5A20\u671F\u53CA\u4EA7\u540E\uFF09\u53D1\u75C5\u4EBA\u6570\uFF08%\uFF09", editable_in_final_platform: true }, { requirement_id: "SRS25", original_column: "Y", original_header: "\u80BF\u7624\u90E8\u4F4D-\u8179\u58C1", original_instruction: "n(%)", concept_or_path: "tumour.site", domain: "TUMOUR", operational_note: "category\u8179\u58C1\uFF1B\u4FDD\u7559\u539F\u6587\u5206\u7C7B\u4E0E\u6620\u5C04", field_id: "SRS25", order: 25, module_id: "M05", label: "\u80BF\u7624\u90E8\u4F4D-\u8179\u58C1", editable_in_final_platform: true }, { requirement_id: "SRS26", original_column: "Z", original_header: "\u80BF\u7624\u90E8\u4F4D-\u8179\u8154\u5185", original_instruction: "n(%)", concept_or_path: "tumour.site", domain: "TUMOUR", operational_note: "category\u8179\u8154\u5185\uFF1B\u4FDD\u7559\u539F\u6587\u5206\u7C7B\u4E0E\u6620\u5C04", field_id: "SRS26", order: 26, module_id: "M05", label: "\u80BF\u7624\u90E8\u4F4D-\u8179\u8154\u5185", editable_in_final_platform: true }, { requirement_id: "SRS27", original_column: "AA", original_header: "\u80BF\u7624\u90E8\u4F4D-\u8179\u8154\u5916", original_instruction: "n(%)", concept_or_path: "tumour.site", domain: "TUMOUR", operational_note: "category\u8179\u8154\u5916\uFF1B\u4FDD\u7559\u539F\u6587\u5206\u7C7B\u4E0E\u6620\u5C04", field_id: "SRS27", order: 27, module_id: "M05", label: "\u80BF\u7624\u90E8\u4F4D-\u8179\u8154\u5916", editable_in_final_platform: true }, { requirement_id: "SRS28", original_column: "AB", original_header: "\u5177\u4F53\u80BF\u7624\u90E8\u4F4D-\u6458\u5F55\u539F\u6587", original_instruction: "", concept_or_path: "tumour.site", domain: "TUMOUR", operational_note: "\u5177\u4F53\u90E8\u4F4D\u539F\u8BCD\u4E0D\u4E22\uFF1B\u591A\u90E8\u4F4D\u91CD\u53E0\u8BF4\u660E", field_id: "SRS28", order: 28, module_id: "M05", label: "\u5177\u4F53\u80BF\u7624\u90E8\u4F4D-\u6458\u5F55\u539F\u6587", editable_in_final_platform: true }, { requirement_id: "SRS29", original_column: "AC", original_header: "\u80BF\u7624\u5927\u5C0F\uFF08cm\uFF09-Mean\xB1SD", original_instruction: "\u4F18\u5148\u5199mean\xB1SD\uFF0C\u5982\u662F\u5176\u4ED6\u53D8\u91CF\u5F62\u5F0F\uFF0C\u9700\u8981\u5199\u660E\u5177\u4F53\uFF0C\u5982median (IQR): 45 (20-67)", concept_or_path: "tumour.size", domain: "TUMOUR", operational_note: "\u7EF4\u5EA6\u3001\u65B9\u6CD5\u3001\u65F6\u70B9\u3001\u75C5\u7076/\u60A3\u8005\u5355\u4F4D", field_id: "SRS29", order: 29, module_id: "M06", label: "\u80BF\u7624\u5927\u5C0F\uFF08cm\uFF09-Mean\xB1SD", editable_in_final_platform: true }, { requirement_id: "SRS30", original_column: "AD", original_header: "\u80BF\u7624\u5927\u5C0F\uFF08\u5206\u7C7B\uFF09-\u5C0F\u4E8E5cm\u4EBA\u6570\uFF08%\uFF09", original_instruction: "\u5206\u7C7B\uFF1A<5cm\uFF1B5\u201310cm\uFF1B>10cm", concept_or_path: "tumour.size_distribution", domain: "TUMOUR", operational_note: "<5cm\uFF1B\u4EC5\u5141\u8BB8\u6709\u4F9D\u636E\u7684\u7CBE\u786E\u6620\u5C04", field_id: "SRS30", order: 30, module_id: "M06", label: "\u80BF\u7624\u5927\u5C0F\uFF08\u5206\u7C7B\uFF09-\u5C0F\u4E8E5cm\u4EBA\u6570\uFF08%\uFF09", editable_in_final_platform: true }, { requirement_id: "SRS31", original_column: "AE", original_header: "\u80BF\u7624\u5927\u5C0F\uFF08\u5206\u7C7B\uFF09-5-10cm\u4EBA\u6570\uFF08%\uFF09", original_instruction: "\u5206\u7C7B\uFF1A<5cm\uFF1B5\u201310cm\uFF1B>10cm", concept_or_path: "tumour.size_distribution", domain: "TUMOUR", operational_note: "5\u201310cm\uFF1B\u4FDD\u7559\u8FB9\u754C", field_id: "SRS31", order: 31, module_id: "M06", label: "\u80BF\u7624\u5927\u5C0F\uFF08\u5206\u7C7B\uFF09-5-10cm\u4EBA\u6570\uFF08%\uFF09", editable_in_final_platform: true }, { requirement_id: "SRS32", original_column: "AF", original_header: "\u80BF\u7624\u5927\u5C0F\uFF08\u5206\u7C7B\uFF09-\u5927\u4E8E10cm\u4EBA\u6570\uFF08%\uFF09", original_instruction: "\u5206\u7C7B\uFF1A<5cm\uFF1B5\u201310cm\uFF1B>10cm", concept_or_path: "tumour.size_distribution", domain: "TUMOUR", operational_note: ">10cm\uFF1B\u4FDD\u7559\u8FB9\u754C", field_id: "SRS32", order: 32, module_id: "M06", label: "\u80BF\u7624\u5927\u5C0F\uFF08\u5206\u7C7B\uFF09-\u5927\u4E8E10cm\u4EBA\u6570\uFF08%\uFF09", editable_in_final_platform: true }, { requirement_id: "SRS33", original_column: "AG", original_header: "\u80BF\u7624\u6570\u91CF-Mean\xB1SD", original_instruction: "\u4F18\u5148\u5199mean\xB1SD\uFF0C\u5982\u662F\u5176\u4ED6\u53D8\u91CF\u5F62\u5F0F\uFF0C\u9700\u8981\u5199\u660E\u5177\u4F53\uFF0C\u5982median (IQR): 45 (20-67)", concept_or_path: "tumour.number", domain: "TUMOUR", operational_note: "\u6BCF\u60A3\u8005\u75C5\u7076\u6570\u91CF\u7EDF\u8BA1\u4E0E\u591A\u7076\u5206\u7C7B\u5747\u4FDD\u7559", field_id: "SRS33", order: 33, module_id: "M06", label: "\u80BF\u7624\u6570\u91CF-Mean\xB1SD", editable_in_final_platform: true }, { requirement_id: "SRS34", original_column: "AH", original_header: "\u539F\u53D1 vs \u590D\u53D1", original_instruction: "\u5206\u7C7B\uFF1A\u539F\u53D1/\u590D\u53D1/Mix/NR", concept_or_path: "disease.presentation", domain: "DISEASE_STATE", operational_note: "\u539F\u53D1/\u590D\u53D1/\u6DF7\u5408/\u4E0D\u660E\u5BF9\u5E94\u7684\u65F6\u95F4\u70B9", field_id: "SRS34", order: 34, module_id: "M07", label: "\u539F\u53D1 vs \u590D\u53D1", editable_in_final_platform: true }, { requirement_id: "SRS35", original_column: "AI", original_header: "\u539F\u53D1DT\u7684\u4EBA\u6570\uFF08%\uFF09", original_instruction: "n(%)", concept_or_path: "disease.presentation", domain: "DISEASE_STATE", operational_note: "\u539F\u53D1n/N\uFF1B\u4E0D\u662F\u968F\u8BBF\u672A\u590D\u53D1\u4EBA\u6570", field_id: "SRS35", order: 35, module_id: "M07", label: "\u539F\u53D1DT\u7684\u4EBA\u6570\uFF08%\uFF09", editable_in_final_platform: true }, { requirement_id: "SRS36", original_column: "AJ", original_header: "\u590D\u53D1DT\u7684\u4EBA\u6570\uFF08%\uFF09", original_instruction: "n(%)", concept_or_path: "disease.presentation", domain: "DISEASE_STATE", operational_note: "\u57FA\u7EBF\u590D\u53D1n/N\uFF1B\u4E0D\u7B49\u4E8E\u968F\u8BBF\u4E8B\u4EF6", field_id: "SRS36", order: 36, module_id: "M07", label: "\u590D\u53D1DT\u7684\u4EBA\u6570\uFF08%\uFF09", editable_in_final_platform: true }, { requirement_id: "SRS37", original_column: "AK", original_header: "\u5907\u6CE8", original_instruction: "", concept_or_path: "issue.restrictions", domain: "LIMITATIONS", operational_note: "\u5173\u952E\u9650\u5236\u53CA\u9700\u8BF4\u660E\u5185\u5BB9\uFF1B\u4E0D\u80FD\u66FF\u4EE3\u6709\u5B9A\u4E49\u7684\u6269\u5C55\u5B57\u6BB5", field_id: "SRS37", order: 37, module_id: "M08", label: "\u5907\u6CE8", editable_in_final_platform: true }], effective_project_notes: { SRS20: "\u4EC5\u9996\u6B21DT\u53D1\u75C5\u524D\u540C\u90E8\u4F4D\u624B\u672F\uFF1B\u65E2\u5F80DT\u5207\u9664\u53E6\u5916\u4FDD\u7559\u3002", SRS22_SRS23: "FAP\u5BB6\u65CF\u53F2\u4E0E\u672C\u4EBA\u5408\u5E76FAP\u5206\u5F00\uFF1B\u4E0D\u8981\u6C42\u5FC5\u987B\u6709\u9057\u4F20\u68C0\u6D4B\u786E\u8BC1\uFF0CAPC\u80DA\u7CFB\u68C0\u6D4B\u53E6\u8BB0\u3002", SRS24: "\u598A\u5A20/\u4EA7\u540E\u4E0D\u8BBE\u7EDF\u4E00\u65F6\u95F4\u7A97\uFF0C\u6309\u539F\u6587\u5B9A\u4E49\u53CA\u5B9E\u9645\u65F6\u95F4\u8BB0\u5F55\u3002" }, remarks_model: { export_field_id: "SRS37", one_excel_cell: true, editable_segments: ["GENERAL", "M01", "M02", "M03", "M04", "M05", "M06", "M07"], segment_optional: true, assembly_order: ["GENERAL", "M01", "M02", "M03", "M04", "M05", "M06", "M07"], assembly: "Deterministic headings and line breaks for nonempty segments; no AI rewrite at export", aggregate_independent_edit_buffer: false, internal_review_comments_exported: false, status: "PROPOSED_WORKING_DESIGN_NO_SCIENTIFIC_NOTE_REWRITE_IN_THIS_STEP" }, provenance: { source_file: "DT-\u4E2D\u56FD\u786C\u7EA4\u7EF4\u7624-\u60A3\u8005\u7279\u5F81-\u6570\u636E\u63D0\u53D6\u8868-\u5168\u7279\u5F81-20260911(4).xlsx", sha256: "7c0a85386ba7e61579247ee269210ffb1233287020fc2c97a36e8f6895de2e53", first_two_rows_verified: true } };

// src/save-queue.mjs
var SaveQueue = class {
  constructor({ actor, record, unit, value, revision, request: request2, storage = localStorage, onState = () => {
  }, onAck = () => {
  } }) {
    Object.assign(this, { actor, record, unit, value: lf(value), base: lf(value), revision, request: request2, storage, onState, onAck });
    this.observed = { text: lf(value), revision };
    this.key = `pc497:${BASELINE_SHA}:${actor}:${record}:${unit}`;
    this.active = true;
    this.state = "\u5DF2\u4FDD\u5B58";
    this.generation = 0;
    try {
      const saved = JSON.parse(storage.getItem(this.key) || "null");
      if (saved) {
        this.value = saved.value;
        this.generation = saved.generation || 1;
        this.pending = saved.pending;
        this.revision = saved.revision;
        this.base = saved.base;
        this.conflict = saved.conflict;
        if (!this.pending && !this.conflict && this.value === lf(value)) {
          this.base = lf(value);
          this.revision = revision;
          storage.removeItem(this.key);
        } else {
          this.state = "\u672A\u540C\u6B65";
          if (!this.pending && this.revision !== revision) this.conflict = { text: lf(value), revision };
        }
      }
    } catch {
      this.storageError = "\u65E0\u6CD5\u8BFB\u53D6\u6D4F\u89C8\u5668\u8349\u7A3F\uFF1B\u8BF7\u4FDD\u6301\u9875\u9762\u6253\u5F00\u5E76\u590D\u5236\u672A\u540C\u6B65\u6587\u5B57";
    }
  }
  get dirty() {
    return !!this.pending || !!this.conflict || this.value !== this.base;
  }
  observe(text, revision) {
    if (revision > this.observed.revision) this.observed = { text, revision };
    if (!this.pending && !this.flight && revision > this.revision && this.dirty) {
      this.conflict = { text, revision };
      this.state = "\u6709\u51B2\u7A81";
      this.persist();
    }
  }
  persist() {
    try {
      this.storage.setItem(this.key, JSON.stringify({ value: this.value, base: this.base, revision: this.revision, generation: this.generation, pending: this.pending, conflict: this.conflict }));
      this.storageError = "";
    } catch {
      this.storageError = "\u672C\u5730\u8349\u7A3F\u5907\u4EFD\u5931\u8D25\uFF0C\u8BF7\u4FDD\u6301\u9875\u9762\u6253\u5F00\u5E76\u590D\u5236\u672A\u540C\u6B65\u6587\u5B57";
    }
    this.notify();
  }
  notify() {
    this.onState(this);
  }
  edit(text, { composing = false } = {}) {
    this.value = lf(text);
    this.generation++;
    this.composing = composing;
    this.state = this.conflict ? "\u6709\u51B2\u7A81" : "\u7F16\u8F91\u4E2D";
    this.persist();
    clearTimeout(this.timer);
    if (!composing) {
      this.timer = setTimeout(() => this.flush(), 800);
      this.maxTimer ??= setTimeout(() => this.flush(), 5e3);
    }
  }
  async flush() {
    clearTimeout(this.timer);
    clearTimeout(this.maxTimer);
    this.maxTimer = null;
    if (!this.active || this.composing || this.conflict) return false;
    if (this.flight) {
      await this.flight;
      return !this.dirty || (!this.pending && !this.conflict && this.state !== "\u672A\u540C\u6B65" ? this.flush() : false);
    }
    if (!this.dirty) {
      this.state = "\u5DF2\u4FDD\u5B58";
      this.notify();
      return true;
    }
    this.pending ??= { operation_id: crypto.randomUUID(), expected_revision: this.revision, text: this.value, generation: this.generation };
    this.persist();
    const sent = { ...this.pending };
    this.state = "\u4FDD\u5B58\u4E2D";
    this.notify();
    this.flight = (async () => {
      try {
        const response = await this.request(`records/${this.record}/${this.unit.startsWith("SRS") ? "fields" : "remarks"}/${this.unit}`, { method: "PATCH", body: { operation_id: sent.operation_id, expected_revision: sent.expected_revision, text: sent.text } });
        this.base = response.text;
        this.revision = response.revision;
        this.pending = null;
        this.state = this.value === this.base ? "\u5DF2\u4FDD\u5B58" : "\u7F16\u8F91\u4E2D";
        if (this.observed.revision > this.revision) {
          this.conflict = this.observed;
          this.state = "\u6709\u51B2\u7A81";
        }
        this.onAck(this, response);
        if (!this.dirty) {
          try {
            this.storage.removeItem(this.key);
          } catch {
            this.storageError = "\u5DF2\u4FDD\u5B58\u5230\u670D\u52A1\u5668\uFF0C\u4F46\u65E7\u672C\u5730\u8349\u7A3F\u672A\u80FD\u6E05\u9664";
          }
        } else this.persist();
      } catch (e) {
        this.error = e.message;
        if (e.status === 409) {
          this.conflict = e.data?.current ?? { text: "\u8BF7\u91CD\u65B0\u52A0\u8F7D\u8BFB\u53D6\u5F53\u524D\u7248\u672C", revision: null };
          this.state = "\u6709\u51B2\u7A81";
        } else this.state = "\u672A\u540C\u6B65";
        this.persist();
      } finally {
        this.flight = null;
        this.notify();
      }
    })();
    await this.flight;
    if (this.active && this.dirty && !this.pending && !this.conflict && this.state !== "\u672A\u540C\u6B65") return this.flush();
    return !this.dirty;
  }
  resolve(choice) {
    if (!this.conflict || !Number.isSafeInteger(this.conflict.revision)) return;
    const remote = this.conflict;
    this.pending = null;
    this.conflict = null;
    this.revision = remote.revision;
    this.base = remote.text;
    if (choice === "server") {
      this.value = remote.text;
      this.state = "\u5DF2\u4FDD\u5B58";
      try {
        this.storage.removeItem(this.key);
      } catch {
        this.storageError = "\u65E7\u8349\u7A3F\u6E05\u9664\u5931\u8D25";
      }
      this.notify();
    } else {
      this.state = "\u7F16\u8F91\u4E2D";
      this.generation++;
      this.persist();
      this.flush();
    }
  }
  deactivate() {
    this.active = false;
    clearTimeout(this.timer);
    clearTimeout(this.maxTimer);
    if (this.dirty) this.persist();
  }
};
async function apiRequest(path, { method = "GET", body } = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12e3);
  try {
    const res = await fetch(API + path, { method, headers: body ? { "Content-Type": "application/json" } : void 0, body: body ? JSON.stringify(body) : void 0, signal: controller.signal, cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      const e = Error(data.error || "\u8BF7\u6C42\u5931\u8D25");
      e.status = res.status;
      e.data = data;
      throw e;
    }
    return data;
  } catch (e) {
    if (e.name === "AbortError") throw Error("\u4FDD\u5B58\u8BF7\u6C42\u8D85\u65F6\uFF0C\u53EF\u91CD\u8BD5\u540C\u4E00\u64CD\u4F5C");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// src/viewer.mjs
import * as pdfjs from "/review/pc497/pdfjs/build/pdf.mjs";
var vendor = new URL("/review/pc497/pdfjs/", location.origin);
pdfjs.GlobalWorkerOptions.workerSrc = new URL("build/pdf.worker.mjs", vendor).href;
var Viewer = class {
  constructor() {
    this.groups = [];
    this.showAll = true;
    this.docs = /* @__PURE__ */ new Map();
    this.token = 0;
    this.page = 1;
    this.rotation = 0;
    this.zoom = "fit";
    this.stage = document.querySelector("#pdf-stage");
    this.scroll = document.querySelector("#pdf-scroll");
    this.stats = { document_loads: 0, page_renders: 0, overlay_reuses: 0, failures: 0 };
    this.fitWidth = this.scroll.clientWidth;
    new ResizeObserver(() => {
      const width = this.scroll.clientWidth;
      if (Math.abs(width - this.fitWidth) < 2) return;
      clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        const current = this.scroll.clientWidth;
        if (Math.abs(current - this.fitWidth) < 2) return;
        this.fitWidth = current;
        if (this.source && !this.failed && this.zoom === "fit") this.render(false);
      }, 150);
    }).observe(this.scroll);
  }
  suspend() {
    this.token++;
    clearTimeout(this.resizeTimer);
    this.renderTask?.cancel();
    this.guard = () => false;
    this.source = null;
    this.anchor = null;
    this.stage.hidden = true;
    this.stage.querySelector("svg")?.remove();
    delete this.stage.dataset.anchor;
    delete this.stage.dataset.segments;
    document.querySelector("#page-number").textContent = "\u2014";
  }
  clear() {
    this.token++;
    clearTimeout(this.resizeTimer);
    this.renderTask?.cancel();
    this.guard = () => false;
    this.stage.hidden = true;
    this.source = null;
    this.anchor = null;
    this.renderKey = null;
    this.stage.replaceChildren();
    for (const k of Object.keys(this.stage.dataset)) delete this.stage.dataset[k];
    document.querySelector("#page-number").textContent = "\u2014";
  }
  async open(source, page, anchor = null, guard = () => true, scrollToAnchor = true) {
    if (!guard()) return;
    this.guard = guard;
    this.failed = false;
    if (this.lastSourceSha !== source.sha256) this.rotation = 0;
    this.lastSourceSha = source.sha256;
    this.source = source;
    this.page = page;
    this.anchor = anchor;
    await this.render(scrollToAnchor);
  }
  async document(source) {
    const key = source.sha256;
    if (this.docs.has(key)) {
      const cached = this.docs.get(key);
      this.docs.delete(key);
      this.docs.set(key, cached);
      return cached.promise;
    }
    this.stats.document_loads++;
    const port = new Worker(new URL("build/pdf.worker.mjs", vendor), { type: "module" }), worker = new pdfjs.PDFWorker({ port });
    const task = pdfjs.getDocument({ url: source.url, cMapUrl: new URL("cmaps/", vendor).href, cMapPacked: true, standardFontDataUrl: new URL("standard_fonts/", vendor).href, wasmUrl: new URL("wasm/", vendor).href, isEvalSupported: false, worker });
    const item = { task, worker, port };
    let timer;
    const failed = new Promise((_, reject) => {
      port.addEventListener("error", (e) => {
        e.preventDefault();
        reject(Error("\u9605\u8BFB\u5668\u6A21\u5757\u52A0\u8F7D\u5931\u8D25"));
      }, { once: true });
      timer = setTimeout(() => reject(Error("\u539F\u6587\u52A0\u8F7D\u8D85\u65F6\uFF0C\u53EF\u91CD\u8BD5")), 2e4);
    });
    item.promise = Promise.race([task.promise, failed]).finally(() => clearTimeout(timer)).catch((e) => {
      if (this.docs.get(key) === item) this.docs.delete(key);
      task.destroy().catch(() => {
      });
      worker.destroy();
      port.terminate();
      throw e;
    });
    this.docs.set(key, item);
    while (this.docs.size > 3) {
      const [old, item2] = this.docs.entries().next().value;
      this.docs.delete(old);
      item2.promise.then(() => item2.task.destroy()).catch(() => {
      });
      item2.worker.destroy();
      item2.port.terminate();
    }
    return item.promise;
  }
  async retry() {
    const guard = this.guard, source = this.source;
    if (!guard?.() || !source) return;
    this.failed = false;
    const key = this.source?.sha256, item = this.docs.get(key);
    if (item) {
      this.docs.delete(key);
      try {
        await item.task.destroy();
      } catch {
      }
      item.worker.destroy();
      item.port.terminate();
    }
    if (!guard() || this.source !== source) return;
    this.renderKey = null;
    await this.render(true);
  }
  overlay(viewport, source, pageNumber, anchor, token, scrollToAnchor) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", viewport.width);
    svg.setAttribute("height", viewport.height);
    svg.setAttribute("viewBox", `0 0 ${viewport.width} ${viewport.height}`);
    const selected = new Set(anchor?.group_ids || []), regions = /* @__PURE__ */ new Map();
    const add = (seg, group = null) => {
      if (seg.page !== pageNumber || seg.source_sha256 !== source.sha256 || seg.quad?.length !== 8) return;
      const key = seg.quad.join(",");
      if (!regions.has(key)) regions.set(key, { seg, groups: [], selected: false });
      const item = regions.get(key);
      if (group && !item.groups.some((g) => g.id === group.id)) item.groups.push(group);
      if (!group || selected.has(group.id)) item.selected = true;
    };
    for (const g of this.groups) if (this.showAll || selected.has(g.id)) for (const seg of g.segments) add(seg, g);
    if (!anchor?.group_ids) for (const seg of anchor?.segments || []) add(seg);
    for (const item of regions.values()) {
      const { seg, groups } = item, points = [];
      for (let i = 0; i < 8; i += 2) points.push(viewport.convertToViewportPoint(seg.quad[i], seg.quad[i + 1]));
      const poly = document.createElementNS(svg.namespaceURI, "polygon");
      poly.setAttribute("points", points.map((p) => p.join(",")).join(" "));
      poly.dataset.role = seg.role || "evidence";
      poly.dataset.selected = String(item.selected);
      if (groups.length) {
        poly.dataset.groups = groups.map((g) => g.id).join(",");
        poly.setAttribute("tabindex", "0");
        poly.setAttribute("role", "button");
        poly.setAttribute("aria-label", groups.map((g) => g.label).join("\uFF1B") + (seg.role === "table_header" ? "\uFF08\u8868\u5934\u4E0A\u4E0B\u6587\uFF09" : ""));
        poly.onclick = () => this.onRegion?.(groups);
        poly.onkeydown = (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this.onRegion?.(groups);
          }
        };
        const title = document.createElementNS(svg.namespaceURI, "title");
        title.textContent = poly.getAttribute("aria-label");
        poly.append(title);
      }
      svg.append(poly);
    }
    this.stage.querySelector("svg")?.remove();
    this.stage.hidden = false;
    this.stage.append(svg);
    document.querySelector("#page-number").textContent = `${pageNumber} / ${source.page_count}`;
    const segments = [...regions.values()].filter((x) => x.selected);
    Object.assign(this.stage.dataset, { source: source.source_id, sha: source.sha256, page: pageNumber, anchor: anchor?.anchor_id || "", segments: segments.length, overviewRegions: regions.size, token, viewport: JSON.stringify({ scale: viewport.scale, rotation: viewport.rotation, dpr: devicePixelRatio, width: viewport.width, height: viewport.height, transform: viewport.transform }) });
    this.stage.dataset.stats = JSON.stringify(this.stats);
    delete this.stage.dataset.error;
    if (segments.length && scrollToAnchor) {
      const pt = viewport.convertToViewportPoint(...segments[0].seg.quad.slice(0, 2));
      this.scroll.scrollTop = Math.max(0, pt[1] - 90);
      this.scroll.scrollLeft = Math.max(0, pt[0] - 80);
    } else if (scrollToAnchor) {
      this.scroll.scrollTop = 0;
      this.scroll.scrollLeft = 0;
    }
    document.dispatchEvent(new CustomEvent("pdf-rendered", { detail: { source: source.source_id, page: pageNumber, segments: segments.length, token } }));
  }
  async render(scrollToAnchor = false) {
    if (!this.guard?.() || !this.source || !this.page || this.scroll.clientWidth < 20) return;
    const token = ++this.token, guard = this.guard, source = this.source, pageNumber = this.page, anchor = this.anchor;
    const width = this.scroll.clientWidth;
    this.fitWidth = width;
    const key = [source.sha256, pageNumber, this.rotation, this.zoom, width, devicePixelRatio].join(":");
    if (this.renderKey === key && this.viewport && this.stage.querySelector("canvas")) {
      this.stats.overlay_reuses++;
      this.overlay(this.viewport, source, pageNumber, anchor, token, scrollToAnchor);
      return;
    }
    this.renderTask?.cancel();
    this.renderKey = null;
    this.stage.replaceChildren();
    for (const k of Object.keys(this.stage.dataset)) delete this.stage.dataset[k];
    try {
      const doc = await this.document(source);
      if (token !== this.token || !guard()) return;
      const page = await doc.getPage(pageNumber);
      if (token !== this.token || !guard()) return;
      if (doc.numPages !== source.page_count) throw Error("PDF\u9875\u6570\u4E0E\u57FA\u7EBF\u4E0D\u7B26");
      if (anchor?.geometry) {
        const g = anchor.geometry;
        if (g.view_pdf.some((v, i) => Math.abs(v - page.view[i]) > 0.02) || g.intrinsic_rotation !== page.rotate || g.user_unit !== page.userUnit) throw Error("PDF\u9875\u9762\u51E0\u4F55\u4E0E\u57FA\u7EBF\u4E0D\u7B26");
      }
      const rotation = (page.rotate + this.rotation) % 360, unit = page.getViewport({ scale: 1, rotation }), scale = this.zoom === "fit" ? Math.max(0.25, (width - 20) / unit.width) : Number(this.zoom), viewport = page.getViewport({ scale, rotation }), dpr = devicePixelRatio || 1, canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = viewport.width + "px";
      canvas.style.height = viewport.height + "px";
      this.stats.page_renders++;
      this.renderTask = page.render({ canvasContext: canvas.getContext("2d"), viewport, transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0] });
      await this.renderTask.promise;
      if (token !== this.token || !guard()) return;
      this.stage.style.minWidth = "0";
      this.stage.style.width = viewport.width + "px";
      this.stage.style.minHeight = viewport.height + "px";
      this.stage.replaceChildren(canvas);
      this.viewport = viewport;
      this.renderKey = key;
      this.overlay(viewport, source, pageNumber, anchor, token, scrollToAnchor);
    } catch (e) {
      if (token !== this.token || !guard() || e.name === "RenderingCancelledException") return;
      this.failed = true;
      this.stats.failures++;
      this.stage.dataset.error = e.message;
      this.stage.dataset.stats = JSON.stringify(this.stats);
      console.error("PDF_LOAD_FAILURE", { source: source.source_id, page: pageNumber, error: e.message });
      const p = document.createElement("p");
      p.className = "error";
      p.textContent = "\u539F\u6587\u6682\u65F6\u65E0\u6CD5\u6253\u5F00";
      const b = document.createElement("button");
      b.textContent = "\u91CD\u65B0\u52A0\u8F7D";
      b.onclick = () => this.retry();
      this.stage.hidden = false;
      this.stage.replaceChildren(p, b);
      document.dispatchEvent(new CustomEvent("pdf-failed"));
    }
  }
};

// src/layout.mjs
var KEY = "pc497:web02.1:layout";
var clamp = (n, min, max) => Math.max(min, Math.min(max, n));
function reviewLayout() {
  const grid = document.querySelector(".workspace"), left = document.querySelector(".library"), right = document.querySelector(".pdf-pane");
  left.id = "library-pane";
  right.id = "fulltext-pane";
  let prefs = { left: 244, right: null, hideLeft: false, hideRight: false };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved) {
      for (const k of ["left", "right"]) if (Number.isFinite(saved[k])) prefs[k] = saved[k];
      for (const k of ["hideLeft", "hideRight"]) if (typeof saved[k] === "boolean") prefs[k] = saved[k];
    }
  } catch {
  }
  const dividers = ["left", "right"].map((side) => {
    const n = document.createElement("div");
    n.className = "pane-divider " + side;
    n.dataset.divider = side;
    n.tabIndex = 0;
    n.setAttribute("role", "separator");
    n.setAttribute("aria-orientation", "vertical");
    n.setAttribute("aria-label", side === "left" ? "\u8C03\u6574\u6587\u732E\u5217\u8868\u5BBD\u5EA6" : "\u8C03\u6574\u5168\u6587\u680F\u5BBD\u5EA6");
    n.setAttribute("aria-controls", side === "left" ? left.id : right.id);
    if (side === "left") left.after(n);
    else right.before(n);
    return n;
  });
  const defaults = () => ({ left: innerWidth < 1120 ? 190 : 244, right: Math.round(grid.clientWidth * 0.39) });
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
    }
  }
  function apply(save = false) {
    const width = grid.clientWidth || innerWidth, mobile = innerWidth <= 850, gap = 8;
    let l = clamp(prefs.left, 168, 340);
    const gaps = (prefs.hideLeft ? 0 : gap) + (prefs.hideRight ? 0 : gap);
    const room = width - (prefs.hideLeft ? 0 : l) - gaps;
    const rightMin = clamp(room - 600, 260, 440), mid = Math.min(600, Math.max(340, room - rightMin));
    if (!mobile && !prefs.hideLeft) l = clamp(Math.min(l, width - gaps - mid - (prefs.hideRight ? 0 : rightMin)), 168, 340);
    const rightMax = Math.max(rightMin, width - (prefs.hideLeft ? 0 : l) - gaps - mid);
    const r = clamp(prefs.right ?? defaults().right, rightMin, rightMax);
    grid.style.setProperty("--left-width", l + "px");
    grid.style.setProperty("--right-width", r + "px");
    grid.dataset.hideLeft = String(prefs.hideLeft);
    grid.dataset.hideRight = String(prefs.hideRight);
    left.hidden = prefs.hideLeft;
    right.hidden = prefs.hideRight;
    for (const [i, side] of ["left", "right"].entries()) {
      const hidden = side === "left" ? prefs.hideLeft : prefs.hideRight, b = document.querySelector("#toggle-" + side), size = side === "left" ? l : r;
      dividers[i].hidden = mobile || hidden;
      dividers[i].setAttribute("aria-valuenow", Math.round(size));
      dividers[i].setAttribute("aria-valuemin", side === "left" ? 168 : rightMin);
      dividers[i].setAttribute("aria-valuemax", side === "left" ? 340 : rightMax);
      if (b) {
        const label = (hidden ? "\u663E\u793A" : "\u9690\u85CF") + (side === "left" ? "\u6587\u732E\u5217\u8868\u680F" : "\u5168\u6587\u680F");
        b.title = label;
        b.setAttribute("aria-label", label);
        b.setAttribute("aria-expanded", String(!hidden));
        b.setAttribute("aria-pressed", String(hidden));
      }
    }
    if (save) persist();
  }
  for (const [i, side] of ["left", "right"].entries()) {
    const n = dividers[i];
    let drag = null;
    n.addEventListener("pointerdown", (e) => {
      if (innerWidth <= 850 || e.button !== 0) return;
      drag = { x: e.clientX, width: parseFloat(grid.style.getPropertyValue("--" + side + "-width")) };
      n.setPointerCapture(e.pointerId);
      document.body.classList.add("resizing");
      e.preventDefault();
    });
    n.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const delta = (e.clientX - drag.x) * (side === "left" ? 1 : -1);
      prefs[side] = drag.width + delta;
      apply();
      prefs[side] = parseFloat(grid.style.getPropertyValue("--" + side + "-width"));
    });
    const stop = () => {
      if (!drag) return;
      drag = null;
      document.body.classList.remove("resizing");
      persist();
    };
    n.addEventListener("pointerup", stop);
    n.addEventListener("pointercancel", stop);
    n.addEventListener("lostpointercapture", stop);
    n.ondblclick = () => {
      prefs[side] = defaults()[side];
      apply(true);
    };
    n.onkeydown = (e) => {
      if (innerWidth <= 850) return;
      if (e.key === "Home") {
        prefs[side] = defaults()[side];
        apply(true);
        e.preventDefault();
      } else if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
        prefs[side] = parseFloat(grid.style.getPropertyValue("--" + side + "-width")) + (e.key === "ArrowRight" ? 20 : -20) * (side === "left" ? 1 : -1);
        apply(true);
        e.preventDefault();
      }
    };
  }
  function mount() {
    const host = document.querySelector("#review-toolbar");
    host.querySelector(".pane-toggles")?.remove();
    const controls = document.createElement("div");
    controls.className = "pane-toggles";
    for (const side of ["left", "right"]) {
      const b = document.createElement("button");
      b.id = "toggle-" + side;
      b.type = "button";
      b.setAttribute("aria-controls", side === "left" ? left.id : right.id);
      b.innerHTML = `<svg viewBox="0 0 24 20" aria-hidden="true"><rect x="2" y="2" width="20" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M${side === "left" ? 8 : 16} 2v16" stroke="currentColor" stroke-width="1.5"/><rect x="${side === "left" ? 3 : 17}" y="3" width="4" height="14" rx="1" fill="currentColor" opacity=".28"/></svg>`;
      b.onclick = () => {
        prefs[side === "left" ? "hideLeft" : "hideRight"] = !prefs[side === "left" ? "hideLeft" : "hideRight"];
        apply(true);
      };
      controls.append(b);
    }
    host.append(controls);
    apply();
  }
  window.addEventListener("resize", () => apply());
  apply();
  return { mount, showRight() {
    if (prefs.hideRight) {
      prefs.hideRight = false;
      apply(true);
    }
  } };
}

// src/review-queue.mjs
var ReviewQueue = class {
  constructor({ actor, record, prepare, request: request2, apply, onState = () => {
  }, onAck = () => {
  } }) {
    Object.assign(this, { actor, recordData: record, prepare, request: request2, apply, onState, onAck });
    this.record = record.record_id;
    this.tasks = [];
    this.state = "\u5DF2\u4FDD\u5B58";
    this.active = true;
    this.generation = 0;
  }
  get dirty() {
    return this.tasks.length > 0;
  }
  get reviews() {
    return this.error ? this.recordData.reviews : this.tasks.reduce((reviews, t) => projectReview(reviews, this.recordData.values, t), this.recordData.reviews);
  }
  enqueue(action, field, text = "") {
    if (!this.active || this.error) return false;
    this.tasks.push({ action, field, text, generation: ++this.generation, operation_id: crypto.randomUUID() });
    this.onState(this);
    this.flush();
    return true;
  }
  async flush() {
    if (this.flight) {
      await this.flight;
      return !this.dirty;
    }
    if (!this.active || this.error) return false;
    this.flight = (async () => {
      while (this.active && this.tasks.length) {
        const t = this.tasks[0];
        try {
          this.state = "\u4FDD\u5B58\u4E2D";
          this.onState(this);
          if (!await this.prepare()) throw Error("\u6B63\u6587\u4ECD\u672A\u540C\u6B65\uFF0C\u8BF7\u5148\u5904\u7406\u6B63\u6587\u4FDD\u5B58");
          if (!this.active) break;
          t.body ??= { action: t.action, field_id: t.field, text: t.text, operation_id: t.operation_id, expected_revision: this.recordData.values[t.field].revision, expected_record_revision: this.recordData.state.revision };
          const response = await this.request("records/" + this.record + "/review", { method: "POST", body: t.body });
          this.apply(response);
          this.tasks.shift();
          this.onAck(this);
        } catch (e) {
          this.error = e.message;
          this.conflict = e.status === 409;
          this.state = this.conflict ? "\u6709\u51B2\u7A81" : "\u672A\u540C\u6B65";
          if (e.data?.current?.reviews) this.apply(e.data.current);
          break;
        } finally {
          this.onState(this);
        }
      }
    })();
    await this.flight;
    this.flight = null;
    if (!this.dirty) this.state = "\u5DF2\u4FDD\u5B58";
    this.onState(this);
    return !this.dirty;
  }
  async retry() {
    if (this.conflict || !this.active) return false;
    this.error = "";
    this.state = "\u4FDD\u5B58\u4E2D";
    return this.flush();
  }
  async acceptServer() {
    if (!this.active) return;
    try {
      const snapshot = await this.request("records/" + this.record + "/review");
      this.apply(snapshot);
      this.tasks = [];
      this.error = "";
      this.conflict = false;
      this.state = "\u5DF2\u4FDD\u5B58";
    } catch (e) {
      this.error = e.message;
      this.state = "\u672A\u540C\u6B65";
    }
    this.onState(this);
  }
  deactivate() {
    this.active = false;
  }
};

// src/global-save-status.mjs
var GlobalSaveStatus = class {
  constructor({ queues, render, now = () => Date.now(), schedule = (fn, ms) => setTimeout(fn, ms), cancel = (id) => clearTimeout(id), slowMs = 1500, savedMs = 1600 }) {
    Object.assign(this, { queues, render, now, schedule, cancel, slowMs, savedMs });
    this.state = "idle";
    this.pendingSince = null;
    this.ackPending = false;
  }
  ack() {
    this.ackPending = true;
  }
  reset() {
    this.cancel(this.timer);
    this.timer = null;
    this.pendingSince = null;
    this.ackPending = false;
    this.savedUntil = null;
    this.show("idle", "");
  }
  show(state2, text) {
    this.state = state2;
    this.render({ state: state2, text });
  }
  update() {
    this.cancel(this.timer);
    this.timer = null;
    const queues = [...this.queues()], now = this.now();
    if (queues.some((q) => q.conflict)) {
      this.savedUntil = null;
      this.show("conflict", "\u7248\u672C\u51B2\u7A81 \xB7 \u8BF7\u5904\u7406\u540E\u540C\u6B65");
      return;
    }
    if (queues.some((q) => q.state === "\u672A\u540C\u6B65" || q.storageError)) {
      this.savedUntil = null;
      this.show("unsynced", queues.some((q) => q.error) ? "\u4FDD\u5B58\u5931\u8D25 \xB7 \u6709\u672A\u540C\u6B65\u5185\u5BB9" : "\u672A\u540C\u6B65 \xB7 \u8BF7\u68C0\u67E5\u5E76\u91CD\u8BD5");
      return;
    }
    if (queues.some((q) => q.dirty || q.flight)) {
      this.savedUntil = null;
      this.pendingSince ??= now;
      const remaining = this.slowMs - (now - this.pendingSince);
      if (remaining <= 0) this.show("saving", "\u4FDD\u5B58\u4E2D\u2026");
      else {
        this.show("pending", "");
        this.timer = this.schedule(() => this.update(), remaining);
      }
      return;
    }
    this.pendingSince = null;
    if (this.ackPending) {
      this.savedUntil = now + this.savedMs;
      this.ackPending = false;
    }
    if (this.savedUntil > now) {
      this.show("saved", "\u2713 \u5DF2\u4FDD\u5B58");
      this.timer = this.schedule(() => this.update(), this.savedUntil - now);
    } else {
      this.savedUntil = null;
      this.show("idle", "");
    }
  }
};

// src/app.mjs
var $ = (s) => document.querySelector(s);
var moduleLabels = ["\u6587\u732E\u4FE1\u606F", "\u8BBE\u8BA1\u4E0E\u6765\u6E90", "\u4EBA\u7FA4\u4E0E\u4EBA\u53E3\u5B66", "\u75C5\u7A0B\u4E0E\u75C5\u53F2", "\u80BF\u7624\u90E8\u4F4D", "\u5927\u5C0F\u4E0E\u6570\u91CF", "\u539F\u53D1\u4E0E\u590D\u53D1", "\u5907\u6CE8"];
var moduleLabel = (m) => m.order + ". " + moduleLabels[m.order - 1];
function updateEvidenceReturn() {
  const t = state.currentEvidence?.targets[state.currentEvidence.index], source = state.record?.sources[t?.source_id];
  $("#evidence-back").hidden = !(t && t.mode !== "SOURCE_UNAVAILABLE" && source?.url && source.sha256 === t.source_sha256 && Number.isInteger(t.page_index));
}
var el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== void 0) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
var button = (text, fn, cls) => {
  const b = el("button", text, cls);
  b.type = "button";
  b.onclick = fn;
  return b;
};
var state = { account: null, records: [], record: null, module: "M01", epoch: 0, queues: /* @__PURE__ */ new Map(), reviewQueues: /* @__PURE__ */ new Map(), positions: /* @__PURE__ */ new Map(), currentEvidence: null, target: null };
var sandbox = new Sandbox();
var viewer = new Viewer();
var layout = reviewLayout();
layout.mount();
var tierTip = el("div", "", "tier-tooltip");
tierTip.id = "tier-tooltip";
tierTip.setAttribute("role", "tooltip");
tierTip.hidden = true;
document.body.append(tierTip);
function showTierTip(node, c) {
  tierTip.textContent = `P1 ${c.P1} \xB7 P2 ${c.P2}`;
  tierTip.hidden = false;
  const r = node.getBoundingClientRect();
  tierTip.style.left = Math.max(8, Math.min(innerWidth - 238, r.left)) + "px";
  tierTip.style.top = Math.max(8, Math.min(innerHeight - 48, r.bottom + 5)) + "px";
}
function decorateTier(node, c) {
  node.textContent = "\u5F85\u6838 " + c.pending;
  node.hidden = !c.pending;
  node.dataset.tier = c.highest;
  node.setAttribute("aria-label", `\u5F85\u6838 ${c.pending}\uFF1B\u6700\u9AD8\u5C42\u7EA7 ${c.highest || "\u65E0"}\uFF1BP1 ${c.P1} \xB7 P2 ${c.P2}`);
  node.setAttribute("aria-describedby", "tier-tooltip");
  node.onmouseenter = node.onfocus = () => showTierTip(node, c);
  node.onmouseleave = node.onblur = () => tierTip.hidden = true;
}
document.addEventListener("pointerdown", (e) => {
  if (!e.target.closest(".tier-badge")) tierTip.hidden = true;
});
var resume = null;
var globalSave = new GlobalSaveStatus({ queues: () => [...state.queues.values(), ...state.reviewQueues.values()].filter((q) => q.actor === (state.account?.id || resume?.actor)), render: ({ state: status, text }) => {
  const node = $("#global-save-status");
  node.dataset.state = status;
  node.textContent = text;
  node.setAttribute("aria-hidden", String(!text));
} });
async function request(...args) {
  try {
    return await sandbox.request(args[0], args[1], apiRequest);
  } catch (e) {
    if (e.status === 401 && state.account) {
      resume = { actor: state.account.id, record: state.record?.record_id };
      for (const q of [...state.queues.values(), ...state.reviewQueues.values()]) q.deactivate();
      state.account = null;
      state.epoch++;
      viewer.clear();
      $("#app").hidden = true;
      $("#login").hidden = false;
      $("#login-error").textContent = "\u767B\u5F55\u5DF2\u8FC7\u671F\u3002\u672A\u540C\u6B65\u8349\u7A3F\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u91CD\u65B0\u8F93\u5165\u539F\u4EE3\u53F7\u7EED\u63A5\u3002";
    }
    throw e;
  }
}
function notice(text) {
  $("#notice").textContent = text;
  $("#notice").hidden = !text;
}
function queueKey(record, unit) {
  return record + ":" + unit;
}
function getQueue(record, unit) {
  const key = queueKey(record.record_id, unit);
  if (state.queues.has(key)) {
    const old = state.queues.get(key);
    if (old.flight || old.dirty) {
      old.observe(record.values[unit].text, record.values[unit].revision);
      return old;
    }
    old.deactivate();
    state.queues.delete(key);
  }
  const v = record.values[unit];
  const q = new SaveQueue({ ...sandbox.enabled ? { storage: sandbox.storage } : {}, actor: state.account.id, record: record.record_id, unit, value: v.text, revision: v.revision, request, onState: paintSave, onAck: (q2, res) => {
    if (q2.actor === state.account?.id) globalSave.ack();
    if (state.record?.record_id === record.record_id) record = state.record;
    if (res.revision >= record.values[unit].revision) record.values[unit] = { ...record.values[unit], text: res.text, revision: res.revision };
    if (res.state && res.state.revision >= record.state.revision) Object.assign(record.state, res.state);
    if (res.changed) {
      const field = unit.startsWith("SRS") ? unit : "SRS37";
      if (record.reviews[field]?.status === "CONFIRMED") delete record.reviews[field];
      if (field === "SRS37" && res.notes.revision >= record.values.SRS37.revision) Object.assign(record.values.SRS37, res.notes);
      if (record.reviews[field]?.status === "DISCUSS") record.reviews[field].field_revision = record.values[field].revision;
    }
    if (state.record?.record_id === record.record_id) {
      paintStatus();
      paintBadges();
      const preview = $("#notes-preview");
      if (preview) preview.textContent = record.values.SRS37.text;
    }
  } });
  state.queues.set(key, q);
  return q;
}
function paintSave(q) {
  globalSave.update();
  if (state.account?.id !== q.actor || state.record?.record_id !== q.record) return;
  paintStatus();
  const card = document.querySelector(`[data-unit="${q.unit}"]`);
  if (!card) return;
  const status = card.querySelector(".save-state");
  if (status) {
    status.textContent = q.conflict ? "\u6709\u51B2\u7A81" : q.state;
    status.classList.toggle("warn", !!q.conflict || q.state === "\u672A\u540C\u6B65");
  }
  const warning = card.querySelector(".draft-warning");
  warning.textContent = q.storageError || (q.state === "\u672A\u540C\u6B65" ? q.error || "\u68C0\u6D4B\u5230\u672C\u8D26\u53F7\u672A\u540C\u6B65\u8349\u7A3F\uFF0C\u53EF\u91CD\u8BD5\u4FDD\u5B58" : "");
  const retry = card.querySelector(".retry");
  retry.hidden = !(q.state === "\u672A\u540C\u6B65" || q.storageError) || !!q.conflict;
  const box = card.querySelector(".conflict");
  box.hidden = !q.conflict;
  if (!q.conflict) {
    box.replaceChildren();
    return;
  }
  if (!box.firstChild) {
    box.append(el("strong", "\u670D\u52A1\u5668\u5DF2\u6709\u65B0\u7248\u672C\uFF1B\u60A8\u7684\u6587\u5B57\u4FDD\u7559\u5728\u4E0A\u65B9"), el("p", "\u670D\u52A1\u5668\u5F53\u524D\u5185\u5BB9\uFF1A"), el("pre"));
    box.append(button("\u91C7\u7528\u670D\u52A1\u5668\u5185\u5BB9", () => {
      q.resolve("server");
      const area = card.querySelector("textarea.result");
      area.value = q.value;
      autosize(area);
    }), button("\u4FDD\u7559\u6211\u7684\u6587\u5B57\u5E76\u91CD\u65B0\u63D0\u4EA4", () => q.resolve("mine")));
  }
  box.querySelector("pre").textContent = q.conflict.text;
}
function editor(record, unit, parent) {
  parent.dataset.unit = unit;
  const q = getQueue(record, unit), area = el("textarea", void 0, "result");
  area.rows = 1;
  area.value = q.value;
  area.spellcheck = false;
  area.setAttribute("aria-label", (field_registry_default.fields.find((f) => f.field_id === unit)?.label || NOTE_LABELS[unit]) + " \u5F53\u524D\u7ED3\u679C");
  area.dataset.field = unit;
  area.addEventListener("compositionstart", () => {
    q.composing = true;
  });
  area.addEventListener("compositionend", () => {
    q.composing = false;
    q.edit(area.value);
  });
  area.addEventListener("input", (e) => {
    q.edit(area.value, { composing: e.isComposing || q.composing });
    autosize(area);
  });
  area.addEventListener("blur", () => {
    q.composing = false;
    q.edit(area.value);
    q.flush();
  });
  const status = el("span", q.state, "save-state"), retry = button("\u91CD\u8BD5\u540C\u6B65", () => q.flush(), "retry");
  retry.hidden = true;
  const foot = el("div", void 0, "field-foot");
  foot.append(status, retry);
  const warning = el("p", "", "draft-warning reason"), conflict = el("div", void 0, "conflict");
  conflict.hidden = true;
  parent.append(area, foot, warning, conflict);
  queueMicrotask(() => {
    autosize(area);
    paintSave(q);
    if (q.dirty && !q.conflict) q.flush();
  });
}
function autosize(area) {
  area.style.height = "auto";
  const compact = area.closest(".note-section") || area.classList.contains("discussion");
  area.style.height = (compact ? Math.min(126, Math.max(34, area.scrollHeight + 2)) : Math.max(70, area.scrollHeight + 2)) + "px";
}
async function flushContents() {
  const active = [...state.queues.values()].filter((q) => q.actor === state.account?.id);
  return (await Promise.all(active.map((q) => q.flush()))).every(Boolean);
}
async function flush() {
  if (!await flushContents()) return false;
  return (await Promise.all([...state.reviewQueues.values()].filter((q) => q.actor === state.account?.id).map((q) => q.flush()))).every(Boolean);
}
function displayedReviews() {
  return state.reviewQueues.get(state.record?.record_id)?.reviews || state.record?.reviews || {};
}
function getReviewQueue(record) {
  let q = state.reviewQueues.get(record.record_id);
  if (q) {
    q.recordData = record;
    return q;
  }
  q = new ReviewQueue({ actor: state.account.id, record, prepare: () => state.account?.id === q.actor ? flushContents() : false, request, apply: (snapshot) => {
    const r = q.recordData;
    if (snapshot.state.revision < r.state.revision) return;
    r.state = { ...r.state, ...snapshot.state };
    r.reviews = snapshot.reviews;
    for (const [unit, v] of Object.entries(snapshot.values)) {
      if (v.revision < r.values[unit].revision) continue;
      const editorQueue = state.queues.get(queueKey(r.record_id, unit));
      if (editorQueue?.dirty) editorQueue.observe(v.text, v.revision);
      else if (editorQueue && v.revision > editorQueue.revision) {
        Object.assign(editorQueue, { base: v.text, value: v.text, revision: v.revision, observed: { text: v.text, revision: v.revision } });
        const area = state.record === r ? document.querySelector(`[data-unit="${unit}"] textarea.result`) : null;
        if (area) {
          area.value = v.text;
          autosize(area);
        }
      }
      r.values[unit] = { ...r.values[unit], ...v };
    }
  }, onState: () => {
    globalSave.update();
    if (state.account?.id !== q.actor) return;
    paintArticleSummary(q.recordData, q.reviews);
    if (state.record?.record_id === q.record) {
      paintBadges();
      paintStatus();
      paintReviewSync(q);
    }
  }, onAck: () => globalSave.ack() });
  state.reviewQueues.set(record.record_id, q);
  return q;
}
function paintReviewSync(q) {
  for (const card of $("#cards").querySelectorAll("[data-card]")) {
    const box = card.querySelector(".review-sync");
    if (!box) continue;
    const active = q.error && q.tasks[0]?.field === card.dataset.card;
    box.hidden = !active;
    if (!active) {
      box.replaceChildren();
      continue;
    }
    if (box.dataset.message === q.error && box.firstChild) continue;
    box.dataset.message = q.error;
    box.replaceChildren(el("span", q.error), q.conflict ? button("\u91C7\u7528\u670D\u52A1\u5668\u5BA1\u6838\u72B6\u6001", () => q.acceptServer()) : button("\u91CD\u8BD5\u5BA1\u6838\u4FDD\u5B58", () => q.retry()), button("\u8BFB\u53D6\u670D\u52A1\u5668\u5BA1\u6838\u72B6\u6001", () => q.acceptServer()));
  }
}
function toggleReview(field, status) {
  if (!state.record || !state.account.can_write || state.reviewBusy) return;
  const q = getReviewQueue(state.record), old = q.reviews[field], active = old?.status === status && old.field_revision === state.record.values[field].revision;
  q.enqueue(status === "CONFIRMED" ? active ? "unconfirm" : "confirm" : active ? "undiscuss" : "set_discuss", field, status === "DISCUSS" ? document.querySelector(`[data-card="${field}"] textarea.discussion`)?.value || old?.note || "" : "");
}
function pending() {
  return [...state.queues.values(), ...state.reviewQueues.values()].some((q) => q.actor === state.account?.id && q.dirty);
}
function resolved(cell) {
  return humanStatus(cell.text, state.record.values[cell.field_id], displayedReviews()[cell.field_id]) !== "\u672A\u5BA1\u6838";
}
function counts(module) {
  return tierSummary(state.record.cells.filter((c) => !module || c.module_id === module), state.record.values, displayedReviews());
}
function paintArticleSummary(record, reviews) {
  const c = tierSummary(record.cells, record.values, reviews), item = state.records.find((r) => r.id === record.record_id);
  if (!item) return;
  Object.assign(item, { tier_summary: c, status: record.state.status });
  const node = document.querySelector(`[data-record="${item.id}"]`), wrap = node?.closest(".library-record");
  if (wrap) {
    wrap.dataset.tier = c.highest;
    decorateTier(wrap.querySelector(".tier-badge"), c);
    node.querySelector(".meta").textContent = STATUS[item.status];
  }
  $("#progress").textContent = `\u5DF2\u5B8C\u6210 ${state.records.filter((r) => r.status === "COMPLETED").length} / ${state.records.length} \xB7 ${state.account?.role === "reviewer" ? "\u672C\u4EBA\u5206\u5DE5" : "\u5168\u5E93\u8303\u56F4"}`;
  updateNavigation();
}
function paintBadges() {
  if (!state.record) return;
  for (const cell of state.record.cells) {
    const label = document.querySelector(`[data-card="${cell.field_id}"] .human-status`);
    if (label) {
      label.textContent = humanStatus(cell.text, state.record.values[cell.field_id], displayedReviews()[cell.field_id]);
      label.dataset.status = label.textContent;
    }
  }
  for (const mod of field_registry_default.modules) {
    const c = counts(mod.module_id), cells = state.record.cells.filter((c2) => c2.module_id === mod.module_id), reviewed = cells.filter((c2) => humanStatus(c2.text, state.record.values[c2.field_id], displayedReviews()[c2.field_id]) !== "\u672A\u5BA1\u6838").length;
    const summary = document.querySelector(`[data-summary="${mod.module_id}"]`);
    if (summary) summary.textContent = `\u5F85\u6838 ${c.pending} \xB7 \u5DF2\u5BA1 ${reviewed}/${cells.length}`;
    const option = $("#module-picker").querySelector(`[value="${mod.module_id}"]`);
    if (option) option.textContent = moduleLabel(mod) + "\u3000" + c.pending;
    const rail = document.querySelector(`[data-module="${mod.module_id}"]`);
    if (rail) {
      rail.dataset.tier = c.highest;
      rail.title = moduleLabel(mod) + " \xB7 \u5F85\u6838 " + c.pending;
      rail.setAttribute("aria-label", rail.title);
    }
  }
  for (const card of document.querySelectorAll("[data-card]")) {
    const review = displayedReviews()[card.dataset.card], value = state.record.values[card.dataset.card];
    for (const b of card.querySelectorAll("[data-review-state]")) b.setAttribute("aria-pressed", String(review?.status === b.dataset.reviewState && review.field_revision === value.revision));
  }
  for (const card of $("#cards").querySelectorAll("[data-card]")) {
    const review = displayedReviews()[card.dataset.card], note = card.querySelector(".review-note"), controls = card.querySelector(".discussion-controls");
    if (note) {
      note.textContent = review?.status === "DISCUSS" && review.note ? "\u5F85\u786E\u8BA4\uFF1A" + review.note : "";
      note.hidden = state.account.can_write || !note.textContent;
    }
    if (controls) {
      controls.hidden = review?.status !== "DISCUSS";
      const area = controls.querySelector("textarea");
      if (area && !controls.hidden) {
        if (document.activeElement !== area && review?.note !== void 0) area.value = review.note;
        autosize(area);
      }
    }
  }
  paintArticleSummary(state.record, displayedReviews());
}
function paintStatus() {
  if (!state.record) return;
  const waiting = pending();
  $("#review-status").textContent = STATUS[state.record.state.status] + (waiting ? " \xB7 \u6709\u672A\u540C\u6B65\u5185\u5BB9" : " \xB7 \u5185\u5BB9\u5DF2\u540C\u6B65");
  $("#complete").disabled = !state.account.can_write || !!state.reviewBusy;
}
function filteredRecords() {
  const term = $("#search").value.toLowerCase(), filter = $("#status-filter").value;
  return state.records.filter((r) => (r.id + " " + r.title).toLowerCase().includes(term) && (!filter || r.status === filter));
}
function renderList() {
  const term = $("#search").value.toLowerCase(), filter = $("#status-filter").value;
  $("#record-total").textContent = state.records.length + " \u7BC7";
  $("#progress").textContent = `\u5DF2\u5B8C\u6210 ${state.records.filter((r) => r.status === "COMPLETED").length} / ${state.records.length} \xB7 ${state.account?.role === "reviewer" ? "\u672C\u4EBA\u5206\u5DE5" : "\u5168\u5E93\u8303\u56F4"}`;
  $("#records").replaceChildren(...filteredRecords().map((r) => {
    const wrap = el("article", void 0, "library-record"), c = r.tier_summary;
    wrap.dataset.tier = c.highest;
    const b = button("", () => selectRecord(r.id));
    b.dataset.record = r.id;
    b.classList.toggle("active", state.record?.record_id === r.id);
    b.append(el("strong", r.id.replace("rayyan-", "")), el("span", r.title, "title"), el("span", STATUS[r.status], "meta"));
    const badge = button("", () => selectPending(r.id), "tier-badge");
    decorateTier(badge, c);
    wrap.append(b, badge);
    return wrap;
  }));
  updateNavigation();
}
async function list() {
  const data = await request("records");
  state.records = data.records;
  renderList();
}
function remember() {
  if (state.record) state.positions.set(state.record.record_id, { module: state.module, scroll: $("main").scrollTop });
}
async function selectRecord(id, { attention = false, restoreFocus = null } = {}) {
  if (state.reviewBusy) return;
  remember();
  flush();
  $("#module-picker").disabled = true;
  const epoch = ++state.epoch;
  viewer.clear();
  state.focus = null;
  state.currentEvidence = null;
  state.target = null;
  updateEvidenceReturn();
  $("#targets").replaceChildren();
  $("#source-caution").textContent = "";
  $("#article-head").textContent = "\u6B63\u5728\u8BFB\u53D6\u6587\u7AE0\u2026";
  layout.mount();
  $("#cards").replaceChildren();
  $("#section-rail").replaceChildren();
  state.record = null;
  try {
    const record = await request("records/" + id);
    if (epoch !== state.epoch) return;
    state.record = record;
    getReviewQueue(record);
    renderList();
    state.module = state.positions.get(id)?.module || "M01";
    $("#article-head").textContent = record.record_id.replace("rayyan-", "") + " \xB7 " + record.title + " \xB7 " + record.study_label;
    $("#article-head").title = $("#article-head").textContent;
    layout.mount();
    $("#source-select").replaceChildren(...Object.values(record.sources).map((s, i) => {
      const option = el("option", (s.kind === "main" ? "\u4E3B\u6587" : "\u652F\u6301\u6765\u6E90") + " \xB7 " + s.title);
      option.value = s.source_id;
      return option;
    }));
    const caution = record.sources[record.source_ids.find((s) => s.endsWith(":main"))];
    $("#source-caution").textContent = caution?.source_unit_caution || caution?.article_boundary || "";
    buildModules();
    renderModule();
    $("#review-footer").hidden = false;
    paintStatus();
    paintBadges();
    $("main").scrollTop = state.positions.get(id)?.scroll || 0;
    if (attention) focusPending();
    else if (restoreFocus) {
      focusReview([...$("#cards").querySelectorAll("[data-review-focus]")].find((n) => n.dataset.reviewFocus === restoreFocus), true, true);
    } else openSource(mainSource());
  } catch (e) {
    if (epoch !== state.epoch) return;
    notice(e.message);
    $("#article-head").textContent = "\u6587\u7AE0\u8BFB\u53D6\u5931\u8D25";
    layout.mount();
  }
}
function updateNavigation() {
  const rows = filteredRecords(), index = rows.findIndex((r) => r.id === state.record?.record_id), moduleIndex = field_registry_default.modules.findIndex((m) => m.module_id === state.module);
  for (const [id, disabled] of [["record-prev", index <= 0], ["record-next", index < 0 || index === rows.length - 1], ["module-prev", moduleIndex <= 0], ["module-next", moduleIndex === field_registry_default.modules.length - 1]]) $("#" + id).disabled = !state.record || !!state.reviewBusy || disabled;
}
function syncModule(id) {
  state.module = id;
  $("#module-picker").value = id;
  for (const b of document.querySelectorAll("[data-module]")) {
    const active = b.dataset.module === id;
    b.classList.toggle("active", active);
    if (active) b.setAttribute("aria-current", "location");
    else b.removeAttribute("aria-current");
  }
  updateNavigation();
}
function buildModules() {
  $("#module-picker").disabled = false;
  $("#module-picker").replaceChildren(...field_registry_default.modules.map((m) => {
    const o = el("option", moduleLabel(m));
    o.value = m.module_id;
    return o;
  }));
  $("#section-rail").replaceChildren(...field_registry_default.modules.map((m) => {
    const b = button("", () => selectModule(m.module_id));
    b.dataset.module = m.module_id;
    return b;
  }));
  syncModule(state.module);
  paintBadges();
}
function scrollToReview(node) {
  if (!node) return;
  const offset = $("#review-toolbar").getBoundingClientRect().height + 8, top = node.getBoundingClientRect().top;
  if (innerWidth <= 850) window.scrollTo({ top: window.scrollY + top - offset, behavior: "instant" });
  else $("main").scrollTop += top - $("main").getBoundingClientRect().top - offset;
}
function selectModule(id) {
  if (!state.record || state.reviewBusy) return;
  syncModule(id);
  scrollToReview(document.getElementById("section-" + id));
}
function moveRecord(delta) {
  const rows = filteredRecords(), i = rows.findIndex((r) => r.id === state.record?.record_id);
  if (i >= 0 && rows[i + delta]) selectRecord(rows[i + delta].id);
}
function moveModule(delta) {
  const i = field_registry_default.modules.findIndex((m) => m.module_id === state.module);
  if (field_registry_default.modules[i + delta]) selectModule(field_registry_default.modules[i + delta].module_id);
}
async function selectPending(id) {
  if (state.reviewBusy) return;
  if (state.record?.record_id !== id) await selectRecord(id, { attention: true });
  else focusPending();
}
function focusPending() {
  const target = state.record?.cells.filter((c) => ["P1", "P2"].includes(c.review_tier) && humanStatus(c.text, state.record.values[c.field_id], displayedReviews()[c.field_id]) === "\u672A\u5BA1\u6838").sort((a, b) => a.review_tier.localeCompare(b.review_tier) || a.field_id.localeCompare(b.field_id))[0];
  if (!target) {
    openSource(mainSource());
    return;
  }
  syncModule(target.module_id);
  const node = document.querySelector(`[data-card="${target.field_id}"]`);
  scrollToReview(node);
  focusReview(node, true, true);
  node.focus({ preventScroll: true });
}
var spyFrame = 0;
function scheduleSpy() {
  if (spyFrame) return;
  spyFrame = requestAnimationFrame(() => {
    spyFrame = 0;
    if (!state.record) return;
    const main = $("main"), mobile = innerWidth <= 850, edge = (mobile ? 0 : main.getBoundingClientRect().top) + $("#review-toolbar").getBoundingClientRect().height + 16;
    let active = field_registry_default.modules[0].module_id;
    for (const m of field_registry_default.modules) {
      const n = document.getElementById("section-" + m.module_id);
      if (n?.getBoundingClientRect().top <= edge) active = m.module_id;
    }
    if (!mobile && main.scrollTop + main.clientHeight >= main.scrollHeight - 2) active = field_registry_default.modules.at(-1).module_id;
    syncModule(active);
  });
}
$("main").addEventListener("scroll", scheduleSpy, { passive: true });
window.addEventListener("scroll", scheduleSpy, { passive: true });
new ResizeObserver(() => {
  $("main").style.setProperty("--toolbar-height", $("#review-toolbar").getBoundingClientRect().height + "px");
  scheduleSpy();
}).observe($("#review-toolbar"));
var centerWidth = 0;
var sizeTimer;
new ResizeObserver((entries) => {
  const width = entries[0].contentRect.width;
  if (width === centerWidth) return;
  centerWidth = width;
  clearTimeout(sizeTimer);
  sizeTimer = setTimeout(() => {
    for (const area of $("#cards").querySelectorAll("textarea")) autosize(area);
    scheduleSpy();
  }, 80);
}).observe($("main"));
function mainSource() {
  return Object.values(state.record?.sources || {}).find((s) => s.kind === "main");
}
function openSource(source, page = 1) {
  if (!source?.url) {
    notice("\u5F53\u524D\u6765\u6E90\u4E0D\u53EF\u7528\u3002");
    return;
  }
  layout.showRight();
  const epoch = state.epoch;
  state.target = null;
  $("#source-select").value = source.source_id;
  $("#targets").replaceChildren();
  updateEvidenceReturn();
  $("#source-caution").textContent = source.source_unit_caution || source.article_boundary || "";
  notice("");
  viewer.open(source, page, null, () => epoch === state.epoch);
}
function markFocus(node, key, buttons = []) {
  node.dataset.reviewFocus = key;
  node.tabIndex = -1;
  node.reviewEvidence = buttons;
}
function focusReview(node, follow = true, force = false) {
  if (!node || !state.record) return;
  const changed = state.focus !== node.dataset.reviewFocus;
  state.focus = node.dataset.reviewFocus;
  for (const card of $("#cards").querySelectorAll("[data-card]")) card.classList.toggle("focus-card", card === node.closest("[data-card]"));
  for (const item of $("#cards").querySelectorAll("[data-review-focus]")) {
    const active = item === node;
    item.classList.toggle("review-current", active);
    if (active) item.setAttribute("aria-current", "true");
    else item.removeAttribute("aria-current");
  }
  if (!follow || !changed && !force) return;
  const targets = (node.reviewEvidence || []).flatMap((b) => b.targets);
  if (targets.length) selectEvidence(targets, 0, "\u5F53\u524D\u5B57\u6BB5\u8BC1\u636E");
  else {
    state.currentEvidence = null;
    updateEvidenceReturn();
    const main = mainSource();
    openSource(main, viewer.source?.source_id === main?.source_id ? viewer.page : 1);
  }
}
for (const type of ["click", "focusin"]) $("#cards").addEventListener(type, (e) => {
  if (e.target.closest(".review-actions,.review-sync,.discussion-controls")) return;
  const node = e.target.closest("[data-review-focus]");
  focusReview(node, !e.target.closest("button,a") || !!e.target.closest(".review-actions"));
});
function renderModule() {
  const r = state.record;
  if (!r) return;
  $("#cards").replaceChildren();
  for (const mod of field_registry_default.modules) {
    const moduleSection = el("section", void 0, "module-section");
    moduleSection.dataset.section = mod.module_id;
    const sectionHead = el("div", void 0, "section-heading");
    sectionHead.id = "section-" + mod.module_id;
    sectionHead.append(el("h2", moduleLabel(mod)));
    const summary = el("span");
    summary.dataset.summary = mod.module_id;
    sectionHead.append(summary);
    moduleSection.append(sectionHead);
    $("#cards").append(moduleSection);
    for (const c of r.cells.filter((c2) => c2.module_id === mod.module_id)) {
      const field = field_registry_default.fields.find((f) => f.field_id === c.field_id), card = el("section", void 0, "card");
      card.dataset.card = c.field_id;
      markFocus(card, c.field_id, c.evidence_buttons);
      const heading = el("div", void 0, "field-heading"), human = el("span", humanStatus(c.text, r.values[c.field_id], r.reviews[c.field_id]), "human-status");
      human.dataset.status = human.textContent;
      heading.append(el("h3", field.label), human);
      if (["P1", "P2", "P3"].includes(c.review_tier)) heading.append(el("span", TIER_LABELS[c.review_tier], "tier-pill " + c.review_tier));
      card.append(heading);
      if (c.field_id === "SRS37") {
        const p = el("div", r.values.SRS37.text || "\uFF08\u5C1A\u65E0\u5907\u6CE8\uFF09", "readonly");
        p.id = "notes-preview";
        card.append(p, el("small", "\u7531\u603B\u4F53\u8BF4\u660E\u4E0E\u5404\u6A21\u5757\u5907\u6CE8\u81EA\u52A8\u62FC\u63A5"));
      } else if (state.account.can_write && field.editable_in_final_platform) editor(r, c.field_id, card);
      else card.append(el("div", r.values[c.field_id].text, "readonly"));
      if (c.readonly_details.length) {
        const detail = el("details", void 0, "extraction-details");
        detail.append(el("summary", "\u67E5\u770B\u63D0\u53D6\u8BE6\u60C5"));
        for (const [index, item] of c.readonly_details.entries()) {
          const section = el("section", void 0, "detail-item");
          markFocus(section, c.field_id + ":detail:" + index, (item.button_indices || []).map((i) => c.evidence_buttons[i]));
          section.append(el("strong", item.heading));
          for (const text of item.paragraphs) if (text) section.append(el("p", text));
          detail.append(section);
        }
        card.append(detail);
      }
      const review = r.reviews[c.field_id], reviewNote = el("p", review?.status === "DISCUSS" && review.note ? "\u5F85\u786E\u8BA4\uFF1A" + review.note : "", "reason review-note");
      reviewNote.hidden = !reviewNote.textContent;
      card.append(reviewNote);
      if (state.account.can_write) {
        const controls = el("div", void 0, "field-controls");
        for (const n of [...heading.children].filter((n2) => !n2.matches("h3"))) controls.append(n);
        const actions = el("div", void 0, "review-actions");
        actions.append(button("\u2713 \u5DF2\u6838\u5BF9", () => toggleReview(c.field_id, "CONFIRMED")), button("? \u5F85\u786E\u8BA4", () => toggleReview(c.field_id, "DISCUSS")));
        actions.children[0].dataset.reviewState = "CONFIRMED";
        actions.children[1].dataset.reviewState = "DISCUSS";
        controls.append(actions);
        heading.append(controls);
        const sync = el("div", void 0, "review-sync");
        sync.hidden = true;
        card.append(sync);
        const discussion = el("div", void 0, "discussion-controls"), area = el("textarea", void 0, "discussion");
        area.spellcheck = false;
        area.rows = 1;
        area.placeholder = "\u5F85\u786E\u8BA4\u8BF4\u660E\uFF08\u53EF\u76F4\u63A5\u7F16\u8F91\uFF09";
        area.value = review?.note || "";
        area.setAttribute("aria-label", field.label + " \u5F85\u786E\u8BA4\u8BF4\u660E");
        let noteTimer, composing = false;
        const saveNote = () => {
          clearTimeout(noteTimer);
          if (composing) return;
          const q = getReviewQueue(r), current = q.reviews[c.field_id];
          if (current?.status === "DISCUSS" && current.note !== area.value) q.enqueue("set_discuss", c.field_id, area.value);
        };
        area.addEventListener("compositionstart", () => composing = true);
        area.addEventListener("compositionend", () => {
          composing = false;
          saveNote();
        });
        area.addEventListener("input", () => {
          autosize(area);
          clearTimeout(noteTimer);
          noteTimer = setTimeout(saveNote, 800);
        });
        area.addEventListener("blur", saveNote);
        discussion.append(area);
        discussion.hidden = review?.status !== "DISCUSS";
        card.append(discussion);
        queueMicrotask(() => {
          if (!discussion.hidden) autosize(area);
        });
      }
      moduleSection.append(card);
    }
    const segment = mod.module_id === "M08" ? "GENERAL" : mod.module_id;
    if (Object.hasOwn(NOTE_LABELS, segment)) {
      const section = el("section", void 0, "note-section");
      markFocus(section, "note:" + segment);
      section.append(el("h3", NOTE_LABELS[segment] + " \xB7 \u53EF\u9009\u5907\u6CE8"));
      if (state.account.can_write) editor(r, segment, section);
      else section.append(el("div", r.values[segment].text || "\uFF08\u672A\u586B\u5199\uFF09", "readonly"));
      moduleSection.append(section);
    }
  }
  if (state.focus) focusReview([...$("#cards").querySelectorAll("[data-review-focus]")].find((n) => n.dataset.reviewFocus === state.focus), false);
  paintBadges();
}
async function reviewAction(action, field, text = "") {
  if (action !== "complete") {
    getReviewQueue(state.record).enqueue(action, field, text);
    return;
  }
  const record = state.record, id = record?.record_id;
  if (!record || !state.account.can_write || state.reviewBusy) return;
  state.reviewBusy = true;
  paintStatus();
  for (const a of document.querySelectorAll("textarea")) a.disabled = true;
  try {
    if (!await flush()) {
      notice("\u4ECD\u6709\u672A\u540C\u6B65\u3001\u8F93\u5165\u6CD5\u7EC4\u5408\u6216\u51B2\u7A81\u5185\u5BB9\uFF0C\u8BF7\u5148\u5904\u7406\uFF0C\u518D\u786E\u8BA4\u5BA1\u6838\u3002");
      return;
    }
    if (state.record?.record_id !== id) return;
    let confirmRemaining = false;
    if (action === "complete") {
      const remaining = { ...counts(), P3: record.cells.filter((c) => c.review_tier === "P3" && !resolved(c)).length }, p1 = record.cells.filter((c) => c.review_tier === "P1" && !resolved(c));
      if (p1.length) {
        notice(`\u4ECD\u6709 ${p1.length} \u4E2A P1 \u5B57\u6BB5\u672A\u660E\u786E\u5904\u7406\uFF1A` + p1.map((c) => field_registry_default.fields.find((f) => f.field_id === c.field_id).label).join("\u3001"));
        return;
      }
      if (Object.values(record.reviews).some((r) => r.status === "DISCUSS")) {
        notice("\u4ECD\u6709\u5F85\u786E\u8BA4\u4E8B\u9879\uFF0C\u8BF7\u5148\u89E3\u51B3\u518D\u5B8C\u6210\u672C\u7BC7\u3002");
        return;
      }
      if (remaining.P2 || remaining.P3) {
        confirmRemaining = await confirmCompletion(remaining);
        if (!confirmRemaining) return;
      }
    }
    await request("records/" + id + "/review", { method: "POST", body: { action, field_id: field, text, confirm_remaining: confirmRemaining, operation_id: crypto.randomUUID(), expected_revision: action === "complete" ? record.state.revision : record.values[field].revision, expected_record_revision: record.state.revision } });
    notice(action === "complete" ? "\u672C\u7BC7\u5DF2\u5B8C\u6210\u5BA1\u6838\uFF1B\u5176\u4F59\u672A\u5BA1\u6838\u5B57\u6BB5\u5DF2\u6279\u91CF\u8BB0\u4E3A\u5DF2\u6838\u5BF9\uFF0C\u5DF2\u4FEE\u6539\u5B57\u6BB5\u4FDD\u7559\u3002" : "\u5BA1\u6838\u52A8\u4F5C\u5DF2\u4FDD\u5B58\u3002");
    state.reviewBusy = false;
    await selectRecord(id, { restoreFocus: state.focus });
  } catch (e) {
    notice(e.message + (e.status === 409 ? "\uFF1B\u70B9\u51FB\u6587\u7AE0\u91CD\u65B0\u8BFB\u53D6\uFF0C\u672A\u540C\u6B65\u6587\u5B57\u4F1A\u4FDD\u7559\u3002" : ""));
  } finally {
    state.reviewBusy = false;
    for (const a of document.querySelectorAll("textarea")) a.disabled = false;
    paintStatus();
  }
}
function selectEvidence(targets, index, label, remember2 = true) {
  layout.showRight();
  if (!state.record || !targets.length) return;
  state.target = { targets, index, label };
  state.currentEvidence = state.target;
  updateEvidenceReturn();
  $("#targets").replaceChildren();
  if (targets.length > 1) {
    const prev = button("\u2039", () => selectEvidence(targets, index - 1, label)), next = button("\u203A", () => selectEvidence(targets, index + 1, label));
    prev.disabled = index === 0;
    next.disabled = index === targets.length - 1;
    prev.setAttribute("aria-label", "\u4E0A\u4E00\u6761\u8BC1\u636E");
    next.setAttribute("aria-label", "\u4E0B\u4E00\u6761\u8BC1\u636E");
    const count = el("span", `${index + 1} / ${targets.length}`);
    count.setAttribute("aria-live", "polite");
    $("#targets").append(prev, count, next);
  }
  const t = targets[index], source = state.record.sources[t.source_id], a = state.record.anchors[t.anchor_id];
  const epoch = state.epoch;
  if (t.mode === "SOURCE_UNAVAILABLE" || !source?.url || source.sha256 !== t.source_sha256 || !Number.isInteger(t.page_index)) {
    viewer.clear();
    $("#source-caution").textContent = t.reason || "\u539F\u5F15\u7528\u6765\u6E90\u5F53\u524D\u4E0D\u53EF\u7528\uFF1B\u672A\u66FF\u6362\u4E3A\u5176\u4ED6PDF\u3002";
    notice("\u6765\u6E90\u4E0D\u53EF\u7528\uFF1A\u8BE5\u8BC1\u636E\u65E0\u6CD5\u7CBE\u786E\u6253\u5F00\u3002");
    return;
  }
  $("#source-select").value = source.source_id;
  $("#source-caution").textContent = [source.source_unit_caution, t.reason].filter(Boolean).join("\n");
  const anchor = t.mode === "HIGHLIGHT" && a ? { anchor_id: a.anchor_id, geometry: a.page_geometry, segments: a.rects.map((r) => ({ page: t.page_index + 1, source_sha256: source.sha256, quad: [r[0], r[1], r[2], r[1], r[2], r[3], r[0], r[3]] })) } : null;
  notice(t.mode === "PAGE_ONLY" ? "\u5DF2\u5B9A\u4F4D\u5230\u539F\u6587\u9875\uFF1B\u73B0\u6709\u5750\u6807\u4E0D\u8DB3\u4EE5\u5B89\u5168\u9AD8\u4EAE\u3002" : "");
  viewer.open(source, t.page_index + 1, anchor, () => epoch === state.epoch);
}
async function enter(data) {
  for (const q of [...state.queues.values(), ...state.reviewQueues.values()]) q.deactivate();
  state.queues.clear();
  state.reviewQueues.clear();
  globalSave.reset();
  state.account = data.account;
  sandbox.reset(data.account);
  state.record = null;
  state.positions.clear();
  $("#cards").replaceChildren();
  $("#article-head").replaceChildren(el("p", "\u9009\u62E9\u6587\u7AE0\u5F00\u59CB\u5BA1\u6838", "muted"));
  layout.mount();
  $("#section-rail").replaceChildren();
  $("#review-footer").hidden = true;
  $("#login").hidden = true;
  $("#app").hidden = false;
  $("#identity").textContent = data.account.name + (sandbox.enabled ? " \xB7 \u4F53\u9A8C\u6C99\u76D2\uFF08\u5237\u65B0\u590D\u539F\uFF09" : "");
  notice("");
  await list();
  if (resume?.actor === data.account.id && state.records.some((r) => r.id === resume.record)) {
    const id = resume.record;
    resume = null;
    await selectRecord(id);
  }
}
$("#login-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const data = await request("auth/login", { method: "POST", body: { code: $("#code").value } });
    $("#code").value = "";
    $("#login-error").textContent = "";
    await enter(data);
  } catch (e2) {
    $("#login-error").textContent = loginMessage(e2);
    if ($("#login").hidden) notice(loginMessage(e2));
  }
};
$("#logout").onclick = async () => {
  await flush();
  const unsaved = pending();
  try {
    await request("auth/logout", { method: "POST", body: {} });
  } catch (e) {
    notice(e.message);
    return;
  }
  for (const q of [...state.queues.values(), ...state.reviewQueues.values()]) q.deactivate();
  state.queues.clear();
  state.reviewQueues.clear();
  state.account = null;
  sandbox.reset();
  state.record = null;
  state.epoch++;
  viewer.clear();
  for (const item of viewer.docs.values()) {
    item.task.destroy().catch(() => {
    });
    item.worker.destroy();
    item.port.terminate();
  }
  viewer.docs.clear();
  $("#cards").replaceChildren();
  $("#records").replaceChildren();
  $("#app").hidden = true;
  $("#login").hidden = false;
  $("#login-error").textContent = unsaved ? "\u672A\u540C\u6B65\u8349\u7A3F\u4FDD\u7559\u5728\u539F\u4EE3\u53F7\u4E0B\uFF0C\u91CD\u65B0\u767B\u5F55\u53EF\u5904\u7406\u3002" : "";
};
$("#module-picker").onchange = (e) => selectModule(e.target.value);
$("#search").oninput = renderList;
$("#status-filter").onchange = renderList;
$("#complete").onclick = () => reviewAction("complete");
$("#record-prev").onclick = () => moveRecord(-1);
$("#record-next").onclick = () => moveRecord(1);
$("#module-prev").onclick = () => moveModule(-1);
$("#module-next").onclick = () => moveModule(1);
$("#source-select").onchange = () => openSource(state.record?.sources[$("#source-select").value]);
$("#evidence-back").onclick = () => {
  const old = state.currentEvidence;
  if (old) selectEvidence(old.targets, old.index, old.label, false);
};
$("#zoom").onchange = (e) => {
  viewer.zoom = e.target.value;
  viewer.render(true);
};
$("#rotate").onclick = () => {
  viewer.rotation = (viewer.rotation + 90) % 360;
  viewer.render(true);
};
$("#pdf-prev").onclick = () => {
  if (viewer.page > 1) {
    viewer.page--;
    viewer.render(true);
  }
};
$("#pdf-next").onclick = () => {
  if (viewer.source && viewer.page < viewer.source.page_count) {
    viewer.page++;
    viewer.render(true);
  }
};
$("#export").onclick = async () => {
  try {
    const saved = await flush();
    if (!saved) notice("\u4ECD\u6709\u4FEE\u6539\u5C1A\u672A\u540C\u6B65\uFF0C\u5EFA\u8BAE\u4FDD\u5B58\u5B8C\u6210\u540E\u518D\u5BFC\u51FA\u3002");
    else notice("\u6B63\u5728\u8BFB\u53D6\u670D\u52A1\u5668\u5DF2\u4FDD\u5B58\u5185\u5BB9\u5E76\u751F\u6210\u516D\u8868Excel\u2026");
    const data = await request("export-data");
    const worker = new Worker(BASE + "export-worker.js?controlled=01", { type: "module" });
    worker.onmessage = ({ data: message }) => {
      worker.terminate();
      if (message.error) {
        notice(message.error);
        return;
      }
      const blob = new Blob([message.buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), url = URL.createObjectURL(blob), a = el("a");
      a.href = url;
      a.download = "PC497_\u516D\u8868\u5BA1\u6838_" + beijingTime(/* @__PURE__ */ new Date()).replace(/[-: ]/g, "") + ".xlsx";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 6e4);
      notice("\u516D\u8868Excel\u5DF2\u5BFC\u51FA\uFF0C\u5171497\u7BC7\u3002" + (!saved ? "\u4ECD\u6709\u4FEE\u6539\u5C1A\u672A\u540C\u6B65\uFF0C\u672C\u6B21\u672A\u5305\u542B\u3002" : ""));
    };
    worker.onerror = () => {
      worker.terminate();
      notice("Excel \u751F\u6210\u5931\u8D25\uFF0C\u53EF\u91CD\u8BD5\u5BFC\u51FA\u3002");
    };
    worker.postMessage(data);
  } catch (e) {
    notice(e.message);
  }
};
window.addEventListener("beforeunload", (e) => {
  if (pending()) {
    e.preventDefault();
    e.returnValue = "";
  }
});
window.addEventListener("online", () => {
  for (const q of state.queues.values()) if (q.dirty && !q.conflict) q.flush();
});
try {
  await enter(await request("auth/me"));
} catch (e) {
  if (e.status !== 401) $("#login-error").textContent = loginMessage(e);
  if ($("#login").hidden) notice(loginMessage(e));
}
function loginMessage(e) {
  if (e.status === 401 && e.message === "\u4EE3\u53F7\u65E0\u6548") return "\u4EE3\u53F7\u65E0\u6548";
  return ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) || location.protocol === "file:" ? "\u5BA1\u6838\u670D\u52A1\u672A\u8FDE\u63A5\u3002\u672C\u5730\u6D4B\u8BD5\u8BF7\u5148\u5728 web02 \u76EE\u5F55\u8FD0\u884C npm run dev\uFF0C\u518D\u8BBF\u95EE http://127.0.0.1:8799/review/pc497/" : "\u5BA1\u6838\u670D\u52A1\u6682\u4E0D\u53EF\u7528\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002";
}
function confirmCompletion(c) {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.id = "completion-confirm";
    const heading = el("h2", "\u5B8C\u6210\u672C\u7BC7\u5BA1\u6838"), p = el("p", `\u4ECD\u6709 P2 ${c.P2} / P3 ${c.P3} \u9879\u672A\u9010\u9879\u786E\u8BA4\uFF0C\u5B8C\u6210\u672C\u7BC7\u5C06\u6279\u91CF\u6807\u8BB0\u5DF2\u6838\u5BF9\u3002`), actions = el("div", void 0, "dialog-actions");
    const finish = (value) => {
      d.close();
      d.remove();
      resolve(value);
    };
    actions.append(button("\u8FD4\u56DE\u9010\u9879\u6838\u5BF9", () => finish(false)), button("\u786E\u8BA4\u5B8C\u6210", () => finish(true), "primary"));
    d.append(heading, p, actions);
    d.oncancel = (e) => {
      e.preventDefault();
      finish(false);
    };
    document.body.append(d);
    d.showModal();
  });
}
