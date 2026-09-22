// config/accounts.json
var accounts_default = {
  version: "PC497_WEB01_AUTH_v1",
  normalization: "trim_then_lowercase_ASCII",
  login_mode: "single_fixed_code_no_additional_password",
  exact_allowlist: true,
  no_auto_account_creation: true,
  server_only_role_authority: true,
  accounts: [
    {
      id: "srsqn",
      name: "\u5029\u6960",
      role: "reviewer",
      read_scope: "assigned",
      write_scope: "assigned",
      export_scope: "all_497",
      expected_assignments: 105
    },
    {
      id: "srsyh",
      name: "\u7389\u7EA2",
      role: "reviewer",
      read_scope: "assigned",
      write_scope: "assigned",
      export_scope: "all_497",
      expected_assignments: 101
    },
    {
      id: "srsxl",
      name: "\u5B66\u8389",
      role: "reviewer",
      read_scope: "assigned",
      write_scope: "assigned",
      export_scope: "all_497",
      expected_assignments: 104
    },
    {
      id: "srssq",
      name: "\u68EE\u742A",
      role: "reviewer",
      read_scope: "assigned",
      write_scope: "assigned",
      export_scope: "all_497",
      expected_assignments: 101
    },
    {
      id: "srszh",
      name: "\u5B50\u6DB5",
      role: "reviewer",
      read_scope: "assigned",
      write_scope: "assigned",
      export_scope: "all_497",
      expected_assignments: 86
    },
    {
      id: "srszy",
      name: "\u9879\u76EE\u8D1F\u8D23\u4EBA",
      role: "lead",
      read_scope: "all_497",
      write_scope: "all_497",
      export_scope: "all_497",
      expected_assignments: null
    },
    {
      id: "srstest",
      name: "\u53EA\u8BFB\u67E5\u770B\u8005",
      role: "read_only",
      read_scope: "all_497",
      write_scope: "none",
      export_scope: "all_497",
      expected_assignments: null
    }
  ],
  limit: "Lightweight code-based access; not verified personal identity or electronic signature. Never advertise as strong authentication."
};

// src/shared.mjs
var BASELINE_SHA = "9f560ecdd6651671cd55bfbccd5e4b65bf9a2d00cf60088f015304e1eef7fbdc";
var BASELINE_ID = "PC497_SRS37_REVIEW_BASELINE_v1.1_20260921";
var EXPORT_NOTICE = "\u5BFC\u51FA\u57FA\u4E8E\u670D\u52A1\u5668\u5DF2\u4FDD\u5B58\u6570\u636E\uFF0C\u6700\u8FD1\u7EA61\u5206\u949F\u5185\u7684\u4FEE\u6539\u53EF\u80FD\u5C1A\u672A\u5305\u542B\u3002";
var BASE = "/review/pc497/";
var API = BASE + "api/";
var STATUS = { NOT_REVIEWED: "\u672A\u5BA1\u6838", IN_PROGRESS: "\u5BA1\u6838\u4E2D", COMPLETED: "\u5DF2\u5B8C\u6210", DISCUSS: "\u5F85\u786E\u8BA4" };
var TIER_LABELS = { P1: "P1", P2: "P2", P3: "P3" };
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

// src/review-state.mjs
var cleanReview = (r) => r ? Object.fromEntries(Object.entries(r).filter(([k]) => k !== "restore_review")) : null;
async function reviewSnapshot(db, id) {
  const rows = await db.batch([
    db.prepare("SELECT status,revision FROM records WHERE id=?").bind(id),
    db.prepare("SELECT c.unit,c.text,c.revision,c.last_author,c.last_modified,p.new_text IS NOT NULL science_patch,p.applied_revision science_patch_revision,p.new_text science_patch_text FROM current_values c LEFT JOIN pc497_science_patches p ON p.record_id=c.record_id AND p.field_id=c.unit AND p.applied_revision=c.revision AND p.new_text=c.text WHERE c.record_id=?").bind(id),
    db.prepare("SELECT f.*,EXISTS(SELECT 1 FROM operations o WHERE o.record_id=f.record_id AND o.unit=f.field_id AND o.action='confirm' AND o.result_revision=f.field_revision) explicit_confirmed FROM field_reviews f WHERE record_id=?").bind(id),
    db.prepare("SELECT rowid AS seq,unit,action,result_revision,old_text,actor,changed FROM operations WHERE record_id=? ORDER BY rowid DESC").bind(id)
  ]);
  const reviews = Object.fromEntries(rows[2].results.map((r) => [r.field_id, r])), history = rows[3].results;
  for (const r of Object.values(reviews)) if (r.status === "DISCUSS") {
    const discussion = history.find((o) => o.unit === r.field_id && o.action === "discuss");
    let restore = null, stored = false;
    try {
      const data = JSON.parse(discussion?.old_text);
      if (data?.review_before === 1) {
        stored = true;
        restore = data.restore;
      }
    } catch {
    }
    if (!stored) {
      for (const o of history) {
        if (discussion && o.seq >= discussion.seq) continue;
        if (o.action === "edit" && o.changed && (o.unit === r.field_id || r.field_id === "SRS37" && !o.unit.startsWith("SRS"))) break;
        if (o.unit === r.field_id && ["unconfirm", "undiscuss"].includes(o.action)) break;
        if (o.unit === r.field_id && o.action === "confirm" && o.result_revision === r.field_revision || o.action === "complete") {
          restore = { ...cleanReview(r), status: "CONFIRMED", note: "", author: o.actor };
          break;
        }
      }
    }
    r.restore_review = restore?.field_revision === r.field_revision ? cleanReview(restore) : null;
  }
  return { state: rows[0].results[0], values: Object.fromEntries(rows[1].results.map((v) => [v.unit, v])), reviews };
}
async function mutateReview(db, account, record, input, { fail: fail2, digest: digest2 }) {
  const op = input.operation_id, field = input.field_id, action = input.action === "set_discuss" ? "discuss" : input.action;
  if (typeof op !== "string" || !/^[a-zA-Z0-9_-]{16,100}$/.test(op)) fail2(400, "operation_id \u65E0\u6548");
  if (!Number.isSafeInteger(input.expected_revision) || input.expected_revision < 0 || !Number.isSafeInteger(input.expected_record_revision) || input.expected_record_revision < 0) fail2(400, "\u7F3A\u5C11\u5BF9\u8C61\u6216\u6587\u7AE0\u7248\u672C");
  if (typeof (input.text ?? "") !== "string" || (input.text ?? "").length > 32767) fail2(400, "\u6587\u5B57\u4E0D\u5F97\u8D85\u8FC732767\u5B57\u7B26");
  const text = (input.text ?? "").replace(/\r\n?/g, "\n");
  if (input.action === "discuss" && !text.trim()) fail2(400, "\u8BF7\u8F93\u5165\u5F85\u786E\u8BA4\u5185\u5BB9");
  const hash = await digest2(JSON.stringify({ actor: account.id, record: record.id, unit: field, action: input.action, input: { ...input, text } }));
  const result = async (saved2, replayed = false) => {
    const snapshot = await reviewSnapshot(db, record.id);
    return { ok: true, revision: saved2.result_revision, text: saved2.new_text, changed: false, replayed, ...snapshot, notes: snapshot.values.SRS37 };
  };
  const receipt = await db.prepare("SELECT * FROM operations WHERE id=?").bind(op).first();
  if (receipt) {
    if (receipt.actor !== account.id || receipt.request_hash !== hash) fail2(409, "\u64CD\u4F5C ID \u5DF2\u7528\u4E8E\u4E0D\u540C\u8BF7\u6C42");
    return result(receipt, true);
  }
  const before = await reviewSnapshot(db, record.id), old = before.reviews[field];
  if (before.state.revision !== input.expected_record_revision || before.values[field]?.revision !== input.expected_revision) {
    const raced = await db.prepare("SELECT * FROM operations WHERE id=?").bind(op).first();
    if (raced?.actor === account.id && raced.request_hash === hash) return result(raced, true);
    fail2(409, "\u5BA1\u6838\u7248\u672C\u5DF2\u53D8\u5316\uFF0C\u8BF7\u8BFB\u53D6\u670D\u52A1\u5668\u72B6\u6001", { current: before });
  }
  if (action === "unconfirm" && old?.status !== "CONFIRMED" || action === "undiscuss" && old?.status !== "DISCUSS") fail2(409, "\u5BA1\u6838\u72B6\u6001\u5DF2\u53D8\u5316\uFF0C\u8BF7\u8BFB\u53D6\u670D\u52A1\u5668\u72B6\u6001", { current: before });
  const restore = old?.status === "DISCUSS" ? old.restore_review : cleanReview(old), auditBefore = JSON.stringify({ review_before: 1, restore });
  const insert = db.prepare(`INSERT OR IGNORE INTO operations(id,actor,request_hash,record_id,unit,action,old_text,new_text,result_revision,changed,task_ids)
 SELECT ?,?,?,c.record_id,c.unit,?,?,?,c.revision,0,i.task_ids FROM current_values c JOIN initial_cells i ON i.record_id=c.record_id AND i.field_id=c.unit JOIN records r ON r.id=c.record_id WHERE c.record_id=? AND c.unit=? AND c.revision=? AND r.revision=?`).bind(op, account.id, hash, action, auditBefore, text, record.id, field, input.expected_revision, input.expected_record_revision);
  const statements = [insert];
  if (action === "unconfirm" || action === "undiscuss") {
    const gate = "EXISTS(SELECT 1 FROM operations o JOIN records r ON r.id=o.record_id WHERE o.id=? AND o.request_hash=? AND r.revision=?)";
    const args = [op, hash, input.expected_record_revision];
    statements.push(db.prepare(`DELETE FROM field_reviews WHERE record_id=? AND field_id=? AND ${gate}`).bind(record.id, field, ...args));
    if (action === "undiscuss" && restore?.field_revision === input.expected_revision) statements.push(db.prepare(`INSERT INTO field_reviews(record_id,field_id,status,field_revision,task_ids,note,author) SELECT ?,?,?,?,?,?,? WHERE ${gate}`).bind(record.id, field, restore.status, restore.field_revision, restore.task_ids || "[]", restore.note || "", restore.author || account.id, ...args));
    statements.push(db.prepare(`UPDATE records SET revision=revision+1,status=CASE WHEN EXISTS(SELECT 1 FROM field_reviews f WHERE f.record_id=records.id AND f.status='DISCUSS') THEN 'DISCUSS' ELSE 'IN_PROGRESS' END WHERE id=? AND ${gate}`).bind(record.id, ...args));
  }
  await db.batch(statements);
  const saved = await db.prepare("SELECT * FROM operations WHERE id=?").bind(op).first();
  if (!saved) fail2(409, "\u5BA1\u6838\u7248\u672C\u5DF2\u53D8\u5316\uFF0C\u8BF7\u8BFB\u53D6\u670D\u52A1\u5668\u72B6\u6001", { current: await reviewSnapshot(db, record.id) });
  if (saved.actor !== account.id || saved.request_hash !== hash) fail2(409, "\u64CD\u4F5C ID \u5DF2\u7528\u4E8E\u4E0D\u540C\u8BF7\u6C42");
  return result(saved);
}

// config/field_registry.json
var field_registry_default = { schema_version: "0.3", status: "INTERFACE_ONLY_NO_PUBLISHED_CONTENT", modules: [{ module_id: "M01", label: "\u6587\u732E\u8BC6\u522B", order: 1, field_ids: ["SRS01", "SRS02", "SRS03", "SRS04", "SRS05"] }, { module_id: "M02", label: "\u7814\u7A76\u8BBE\u8BA1\u4E0E\u6765\u6E90", order: 2, field_ids: ["SRS06", "SRS07", "SRS08", "SRS09", "SRS10", "SRS11", "SRS12"] }, { module_id: "M03", label: "\u75BE\u75C5\u3001\u4EBA\u7FA4\u4E0E\u4EBA\u53E3\u5B66", order: 3, field_ids: ["SRS13", "SRS14", "SRS15", "SRS16", "SRS17", "SRS18"] }, { module_id: "M04", label: "\u75C5\u7A0B\u4E0E\u76F8\u5173\u75C5\u53F2", order: 4, field_ids: ["SRS19", "SRS20", "SRS21", "SRS22", "SRS23", "SRS24"] }, { module_id: "M05", label: "\u80BF\u7624\u90E8\u4F4D", order: 5, field_ids: ["SRS25", "SRS26", "SRS27", "SRS28"] }, { module_id: "M06", label: "\u80BF\u7624\u5927\u5C0F\u4E0E\u6570\u91CF", order: 6, field_ids: ["SRS29", "SRS30", "SRS31", "SRS32", "SRS33"] }, { module_id: "M07", label: "\u539F\u53D1\u4E0E\u590D\u53D1\u72B6\u6001", order: 7, field_ids: ["SRS34", "SRS35", "SRS36"] }, { module_id: "M08", label: "\u5907\u6CE8\u6C47\u603B", order: 8, field_ids: ["SRS37"] }], fields: [{ requirement_id: "SRS01", original_column: "A", original_header: "key", original_instruction: "PDF\u547D\u540D", concept_or_path: "record.record_id", domain: "ADMIN", operational_note: "\u6587\u732E\u7F16\u53F7\u6765\u81EA\u56FA\u5B9A\u6E05\u5355\uFF1B\u4E0D\u5FC5\u4F2A\u9020\u539F\u6587\u9AD8\u4EAE", field_id: "SRS01", order: 1, module_id: "M01", label: "key", editable_in_final_platform: false }, { requirement_id: "SRS02", original_column: "B", original_header: "\u9898\u76EE", original_instruction: "\u6587\u7AE0\u7684\u9898\u76EE", concept_or_path: "source.title", domain: "BIBLIOGRAPHY", operational_note: "\u539F\u6587\u9898\u540D\uFF1B\u6E05\u5355\u9898\u540D\u53EA\u4F5C\u6838\u5BF9\u7EBF\u7D22", field_id: "SRS02", order: 2, module_id: "M01", label: "\u9898\u76EE", editable_in_final_platform: true }, { requirement_id: "SRS03", original_column: "C", original_header: "\u4E3B\u7814\u7A76\u7684Study ID\uFF08\u4F5C\u8005+\u5E74\u4EE3\uFF09", original_instruction: "\u4E3B\u7814\u7A76\u7684\u4F5C\u8005\u5168\u540D+\u5E74\u4EFD", concept_or_path: "record.study_label", domain: "BIBLIOGRAPHY", operational_note: "\u4F5C\u8005+\u5E74\u4EFD\u663E\u793A\u6807\u7B7E\uFF1B\u4E0D\u628A\u6807\u7B7E\u5F53\u72EC\u7ACBstudy/cohort\u8EAB\u4EFD", field_id: "SRS03", order: 3, module_id: "M01", label: "\u4E3B\u7814\u7A76\u7684Study ID\uFF08\u4F5C\u8005+\u5E74\u4EE3\uFF09", editable_in_final_platform: true }, { requirement_id: "SRS04", original_column: "D", original_header: "\u5168\u6587/\u6458\u8981\n", original_instruction: "\u662F\u5426\u5168\u6587", concept_or_path: "source.report_extent", domain: "SOURCE", operational_note: "\u5168\u6587/\u4F1A\u8BAE\u6458\u8981/\u90E8\u5206\u5168\u6587\u7B49\u6309\u5B9E\u9645\u6E90", field_id: "SRS04", order: 4, module_id: "M01", label: "\u5168\u6587/\u6458\u8981", editable_in_final_platform: true }, { requirement_id: "SRS05", original_column: "E", original_header: "\u4E2D\u6587/\u82F1\u6587", original_instruction: "\u53D1\u8868\u7684\u8BED\u8A00", concept_or_path: "source.language", domain: "SOURCE", operational_note: "\u4FDD\u7559\u5B9E\u9645\u8BED\u8A00", field_id: "SRS05", order: 5, module_id: "M01", label: "\u4E2D\u6587/\u82F1\u6587", editable_in_final_platform: true }, { requirement_id: "SRS06", original_column: "F", original_header: "\u7814\u7A76\u8BBE\u8BA1", original_instruction: "\u968F\u673A\u5BF9\u7167\u8BD5\u9A8C\uFF08RCT\uFF09\uFF0C\u975E\u968F\u673A\u5BF9\u7167\u8BD5\u9A8C\uFF08CCT\uFF09\uFF0C\u5355\u81C2\u8BD5\u9A8C\uFF08ST\uFF09\uFF0C\u89C2\u5BDF\u6027\u7814\u7A76\uFF08OS\uFF09", concept_or_path: "study.design", domain: "STUDY", operational_note: "\u4FDD\u7559\u4F5C\u8005\u539F\u8BCD\u3001\u5B9E\u9645\u8BBE\u8BA1\u7EC6\u8282\u53CASRS\u7C97\u5206\u7C7B", field_id: "SRS06", order: 6, module_id: "M02", label: "\u7814\u7A76\u8BBE\u8BA1", editable_in_final_platform: true }, { requirement_id: "SRS07", original_column: "G", original_header: "\u8BD5\u9A8C\u53F7", original_instruction: "\u8BD5\u9A8C\u7684\u53F7", concept_or_path: "study.registration_id", domain: "STUDY", operational_note: "\u6309\u539F\u6587", field_id: "SRS07", order: 7, module_id: "M02", label: "\u8BD5\u9A8C\u53F7", editable_in_final_platform: true }, { requirement_id: "SRS08", original_column: "H", original_header: "\u8BD5\u9A8C\u540D\u79F0", original_instruction: "\u8BD5\u9A8C\u7684\u540D\u5B57", concept_or_path: "study.trial_name", domain: "STUDY", operational_note: "\u6309\u539F\u6587", field_id: "SRS08", order: 8, module_id: "M02", label: "\u8BD5\u9A8C\u540D\u79F0", editable_in_final_platform: true }, { requirement_id: "SRS09", original_column: "I", original_header: "\u7814\u7A76\u7684\u4E2D\u5FC3\u6570", original_instruction: "\u5355/\u591A\u4E2D\u5FC3\u7814\u7A76", concept_or_path: "study.centres", domain: "STUDY", operational_note: "single/multi\u4E0E\u786E\u5207\u4E2D\u5FC3\u6570\u5206\u522B\u4FDD\u7559", field_id: "SRS09", order: 9, module_id: "M02", label: "\u7814\u7A76\u7684\u4E2D\u5FC3\u6570", editable_in_final_platform: true }, { requirement_id: "SRS10", original_column: "J", original_header: "\u60A3\u8005\u7684\u62DB\u52DF\u5730\u533A", original_instruction: "\u7701/\u5E02", concept_or_path: "geography.recruitment", domain: "GEOGRAPHY", operational_note: "\u4E0D\u4EE5\u4F5C\u8005\u5355\u4F4D\u66FF\u4EE3\u60A3\u8005\u6765\u6E90", field_id: "SRS10", order: 10, module_id: "M02", label: "\u60A3\u8005\u7684\u62DB\u52DF\u5730\u533A", editable_in_final_platform: true }, { requirement_id: "SRS11", original_column: "K", original_header: "\u5F00\u5C55\u7814\u7A76\u7684\u533B\u9662", original_instruction: "\u5177\u4F53\u5230\u79D1\u5BA4", concept_or_path: "study.institutions", domain: "STUDY", operational_note: "\u533B\u9662\u3001\u79D1\u5BA4\u3001\u89D2\u8272\u53CA\u8BC1\u636E", field_id: "SRS11", order: 11, module_id: "M02", label: "\u5F00\u5C55\u7814\u7A76\u7684\u533B\u9662", editable_in_final_platform: true }, { requirement_id: "SRS12", original_column: "L", original_header: "\u6837\u672C\u5165\u7EC4\u65F6\u95F4\u8303\u56F4", original_instruction: "\u5982\uFF1A2013\u5E746\u6708\u81F32023\u5E749\u6708", concept_or_path: "time.recruitment", domain: "TIME", operational_note: "\u539F\u6587\u533A\u95F4\u53CA\u5E74\u6708\u7CBE\u5EA6", field_id: "SRS12", order: 12, module_id: "M02", label: "\u6837\u672C\u5165\u7EC4\u65F6\u95F4\u8303\u56F4", editable_in_final_platform: true }, { requirement_id: "SRS13", original_column: "M", original_header: "\u75BE\u75C5", original_instruction: "\u5177\u4F53\u7684DT\u75BE\u75C5\u79CD\u7C7B", concept_or_path: "disease.description", domain: "POPULATION", operational_note: "\u539F\u75C5\u79CD\u4E0E\u672C\u6B21DT\u76EE\u6807\u5B50\u96C6", field_id: "SRS13", order: 13, module_id: "M03", label: "\u75BE\u75C5", editable_in_final_platform: true }, { requirement_id: "SRS14", original_column: "N", original_header: "\u8BCA\u65AD\u6807\u51C6", original_instruction: "\u786C\u7EA4\u7EF4\u7624\u7684\u786E\u8BCA\u65B9\u6CD5", concept_or_path: "diagnosis.criteria", domain: "POPULATION", operational_note: "\u8BCA\u65AD\u4F9D\u636E\u3001\u8BC6\u522B\u65B9\u6CD5\u4E0E\u5B9A\u4E49", field_id: "SRS14", order: 14, module_id: "M03", label: "\u8BCA\u65AD\u6807\u51C6", editable_in_final_platform: true }, { requirement_id: "SRS15", original_column: "O", original_header: "\u6837\u672C\u91CF", original_instruction: "\u4E2D\u56FDDT\u60A3\u8005\u7684\u4F8B\u6570", concept_or_path: "population.size", domain: "POPULATION", operational_note: "\u4E2D\u56FDDT\u6570\u4E0E\u5168\u7814\u7A76/\u5B50\u96C6/\u68C0\u6D4B\u6570\u5206\u522B\u8BB0\u5F55", field_id: "SRS15", order: 15, module_id: "M03", label: "\u6837\u672C\u91CF", editable_in_final_platform: true }, { requirement_id: "SRS16", original_column: "P", original_header: "\u5E74\u9F84\u8303\u56F4 (\u5E74/\u6708)", original_instruction: "18\u5C81\u81F360\u5C81", concept_or_path: "demographics.age", domain: "DEMOGRAPHY", operational_note: "range\u4E0E\u5B9E\u9645\u5E74\u9F84\u65F6\u95F4\u70B9", field_id: "SRS16", order: 16, module_id: "M03", label: "\u5E74\u9F84\u8303\u56F4 (\u5E74/\u6708)", editable_in_final_platform: true }, { requirement_id: "SRS17", original_column: "Q", original_header: "\u5E74\u9F84 (\u5E74/\u6708) mean\xB1SD", original_instruction: "\u4F18\u5148\u5199mean\xB1SD\uFF0C\u5982\u662F\u5176\u4ED6\u53D8\u91CF\u5F62\u5F0F\uFF0C\u9700\u8981\u5199\u660E\u5177\u4F53\uFF0C\u5982median (IQR): 45 (20-67)", concept_or_path: "demographics.age", domain: "DEMOGRAPHY", operational_note: "\u5168\u90E8\u539F\u62A5\u7EDF\u8BA1\u5F62\u5F0F\uFF0C\u4E0D\u5F3A\u5236mean\xB1SD", field_id: "SRS17", order: 17, module_id: "M03", label: "\u5E74\u9F84 (\u5E74/\u6708) mean\xB1SD", editable_in_final_platform: true }, { requirement_id: "SRS18", original_column: "R", original_header: "\u5973\u6027\u4EBA\u6570\uFF08%\uFF09", original_instruction: "n(%)", concept_or_path: "demographics.sex", domain: "DEMOGRAPHY", operational_note: "\u5973\u6027n/N\u53CA\u539F\u62A5\u767E\u5206\u6BD4\uFF1B\u5176\u4ED6\u6027\u522B\u7C7B\u522B\u4FDD\u7559", field_id: "SRS18", order: 18, module_id: "M03", label: "\u5973\u6027\u4EBA\u6570\uFF08%\uFF09", editable_in_final_platform: true }, { requirement_id: "SRS19", original_column: "S", original_header: "\u75C5\u7A0B\u65F6\u957F\uFF08\u5E74/\u6708\uFF09 mean\xB1SD", original_instruction: "\u4F18\u5148\u5199mean\xB1SD\uFF0C\u5982\u662F\u5176\u4ED6\u53D8\u91CF\u5F62\u5F0F\uFF0C\u9700\u8981\u5199\u660E\u5177\u4F53\uFF0C\u5982median (IQR): 45 (20-67)", concept_or_path: "history.disease_duration", domain: "HISTORY", operational_note: "\u8D77\u6B62\u4E8B\u4EF6\u4E0E\u7EDF\u8BA1\u5F62\u5F0F", field_id: "SRS19", order: 19, module_id: "M04", label: "\u75C5\u7A0B\u65F6\u957F\uFF08\u5E74/\u6708\uFF09 mean\xB1SD", editable_in_final_platform: true }, { requirement_id: "SRS20", original_column: "T", original_header: "\u53D1\u75C5\u90E8\u4F4D\u624B\u672F\u53F2\u4EBA\u6570\uFF08%\uFF09", original_instruction: "n(%)", concept_or_path: "history.surgery", domain: "HISTORY", operational_note: "\u53D1\u75C5\u524D\u540C\u90E8\u4F4D\u624B\u672F\u4E0E\u65E2\u5F80DT\u5207\u9664\u5206\u5F00", field_id: "SRS20", order: 20, module_id: "M04", label: "\u53D1\u75C5\u90E8\u4F4D\u624B\u672F\u53F2\u4EBA\u6570\uFF08%\uFF09", editable_in_final_platform: true }, { requirement_id: "SRS21", original_column: "U", original_header: "\u65E2\u5F80\u521B\u4F24\u53F2\u4EBA\u6570\uFF08%\uFF09", original_instruction: "n(%)", concept_or_path: "history.trauma", domain: "HISTORY", operational_note: "\u90E8\u4F4D\u3001\u65F6\u5E8F\u3001\u9002\u7528\u5206\u6BCD", field_id: "SRS21", order: 21, module_id: "M04", label: "\u65E2\u5F80\u521B\u4F24\u53F2\u4EBA\u6570\uFF08%\uFF09", editable_in_final_platform: true }, { requirement_id: "SRS22", original_column: "V", original_header: "FAP\u5BB6\u65CF\u53F2\u4EBA\u6570\uFF08%\uFF09", original_instruction: "n(%)\n\u6307\u5BB6\u65CF\u4E2D\u6709 FAP\uFF08\u5BB6\u65CF\u6027\u817A\u7624\u6027\u606F\u8089\u75C5\uFF09\u60A3\u8005\uFF0C\u4E5F\u5C31\u662F\u5BB6\u7CFB\u643A\u5E26APC\u80DA\u7CFB\u7A81\u53D8\uFF0C\u4EB2\u5C5E\u786E\u8BCA FAP\u3002\u672C\u4EBA\u53EF\u80FD\u4EC5\u53D1\u751F\u786C\u7EA4\u7EF4\u7624\uFF0C\u4E0D\u4E00\u5B9A\u6709FAP\u3002", concept_or_path: "history.fap_family", domain: "HISTORY", operational_note: "\u5BB6\u65CF\u53F2\uFF1B\u4E0D\u81EA\u52A8\u8865\u9057\u4F20\u68C0\u6D4B\u7ED3\u8BBA", field_id: "SRS22", order: 22, module_id: "M04", label: "FAP\u5BB6\u65CF\u53F2\u4EBA\u6570\uFF08%\uFF09", editable_in_final_platform: true }, { requirement_id: "SRS23", original_column: "W", original_header: "\u5408\u5E76FAP\uFF08\u5BB6\u65CF\u6027\u817A\u7624\u6837\u606F\u8089\u75C5\uFF09\u4EBA\u6570\uFF08%\uFF09", original_instruction: "n(%)\n\u60A3\u8005\u81EA\u8EAB\u65E2\u60A3\u6709\u786C\u7EA4\u7EF4\u7624\uFF0C\u540C\u65F6\u672C\u4EBA\u786E\u8BCA FAP\uFF08\u81EA\u8EAB\u643A\u5E26 APC \u80DA\u7CFB\u7A81\u53D8\u3001\u7ED3\u80A0\u591A\u53D1\u817A\u7624\u606F\u8089\uFF09", concept_or_path: "history.fap_personal", domain: "HISTORY", operational_note: "\u672C\u4EBAFAP\u4E0E\u57FA\u56E0\u68C0\u6D4B\u5206\u5F00", field_id: "SRS23", order: 23, module_id: "M04", label: "\u5408\u5E76FAP\uFF08\u5BB6\u65CF\u6027\u817A\u7624\u6837\u606F\u8089\u75C5\uFF09\u4EBA\u6570\uFF08%\uFF09", editable_in_final_platform: true }, { requirement_id: "SRS24", original_column: "X", original_header: "\u751F\u80B2\u671F\uFF08\u598A\u5A20\u671F\u53CA\u4EA7\u540E\uFF09\u53D1\u75C5\u4EBA\u6570\uFF08%\uFF09", original_instruction: "n(%)", concept_or_path: "history.pregnancy_onset", domain: "HISTORY", operational_note: "\u598A\u5A20/\u4EA7\u540E\u539F\u59CB\u65F6\u95F4\u4E0E\u5206\u6BCD\uFF1B\u7EDF\u4E00\u7A97\u5F85\u786E\u8BA4", field_id: "SRS24", order: 24, module_id: "M04", label: "\u751F\u80B2\u671F\uFF08\u598A\u5A20\u671F\u53CA\u4EA7\u540E\uFF09\u53D1\u75C5\u4EBA\u6570\uFF08%\uFF09", editable_in_final_platform: true }, { requirement_id: "SRS25", original_column: "Y", original_header: "\u80BF\u7624\u90E8\u4F4D-\u8179\u58C1", original_instruction: "n(%)", concept_or_path: "tumour.site", domain: "TUMOUR", operational_note: "category\u8179\u58C1\uFF1B\u4FDD\u7559\u539F\u6587\u5206\u7C7B\u4E0E\u6620\u5C04", field_id: "SRS25", order: 25, module_id: "M05", label: "\u80BF\u7624\u90E8\u4F4D-\u8179\u58C1", editable_in_final_platform: true }, { requirement_id: "SRS26", original_column: "Z", original_header: "\u80BF\u7624\u90E8\u4F4D-\u8179\u8154\u5185", original_instruction: "n(%)", concept_or_path: "tumour.site", domain: "TUMOUR", operational_note: "category\u8179\u8154\u5185\uFF1B\u4FDD\u7559\u539F\u6587\u5206\u7C7B\u4E0E\u6620\u5C04", field_id: "SRS26", order: 26, module_id: "M05", label: "\u80BF\u7624\u90E8\u4F4D-\u8179\u8154\u5185", editable_in_final_platform: true }, { requirement_id: "SRS27", original_column: "AA", original_header: "\u80BF\u7624\u90E8\u4F4D-\u8179\u8154\u5916", original_instruction: "n(%)", concept_or_path: "tumour.site", domain: "TUMOUR", operational_note: "category\u8179\u8154\u5916\uFF1B\u4FDD\u7559\u539F\u6587\u5206\u7C7B\u4E0E\u6620\u5C04", field_id: "SRS27", order: 27, module_id: "M05", label: "\u80BF\u7624\u90E8\u4F4D-\u8179\u8154\u5916", editable_in_final_platform: true }, { requirement_id: "SRS28", original_column: "AB", original_header: "\u5177\u4F53\u80BF\u7624\u90E8\u4F4D-\u6458\u5F55\u539F\u6587", original_instruction: "", concept_or_path: "tumour.site", domain: "TUMOUR", operational_note: "\u5177\u4F53\u90E8\u4F4D\u539F\u8BCD\u4E0D\u4E22\uFF1B\u591A\u90E8\u4F4D\u91CD\u53E0\u8BF4\u660E", field_id: "SRS28", order: 28, module_id: "M05", label: "\u5177\u4F53\u80BF\u7624\u90E8\u4F4D-\u6458\u5F55\u539F\u6587", editable_in_final_platform: true }, { requirement_id: "SRS29", original_column: "AC", original_header: "\u80BF\u7624\u5927\u5C0F\uFF08cm\uFF09-Mean\xB1SD", original_instruction: "\u4F18\u5148\u5199mean\xB1SD\uFF0C\u5982\u662F\u5176\u4ED6\u53D8\u91CF\u5F62\u5F0F\uFF0C\u9700\u8981\u5199\u660E\u5177\u4F53\uFF0C\u5982median (IQR): 45 (20-67)", concept_or_path: "tumour.size", domain: "TUMOUR", operational_note: "\u7EF4\u5EA6\u3001\u65B9\u6CD5\u3001\u65F6\u70B9\u3001\u75C5\u7076/\u60A3\u8005\u5355\u4F4D", field_id: "SRS29", order: 29, module_id: "M06", label: "\u80BF\u7624\u5927\u5C0F\uFF08cm\uFF09-Mean\xB1SD", editable_in_final_platform: true }, { requirement_id: "SRS30", original_column: "AD", original_header: "\u80BF\u7624\u5927\u5C0F\uFF08\u5206\u7C7B\uFF09-\u5C0F\u4E8E5cm\u4EBA\u6570\uFF08%\uFF09", original_instruction: "\u5206\u7C7B\uFF1A<5cm\uFF1B5\u201310cm\uFF1B>10cm", concept_or_path: "tumour.size_distribution", domain: "TUMOUR", operational_note: "<5cm\uFF1B\u4EC5\u5141\u8BB8\u6709\u4F9D\u636E\u7684\u7CBE\u786E\u6620\u5C04", field_id: "SRS30", order: 30, module_id: "M06", label: "\u80BF\u7624\u5927\u5C0F\uFF08\u5206\u7C7B\uFF09-\u5C0F\u4E8E5cm\u4EBA\u6570\uFF08%\uFF09", editable_in_final_platform: true }, { requirement_id: "SRS31", original_column: "AE", original_header: "\u80BF\u7624\u5927\u5C0F\uFF08\u5206\u7C7B\uFF09-5-10cm\u4EBA\u6570\uFF08%\uFF09", original_instruction: "\u5206\u7C7B\uFF1A<5cm\uFF1B5\u201310cm\uFF1B>10cm", concept_or_path: "tumour.size_distribution", domain: "TUMOUR", operational_note: "5\u201310cm\uFF1B\u4FDD\u7559\u8FB9\u754C", field_id: "SRS31", order: 31, module_id: "M06", label: "\u80BF\u7624\u5927\u5C0F\uFF08\u5206\u7C7B\uFF09-5-10cm\u4EBA\u6570\uFF08%\uFF09", editable_in_final_platform: true }, { requirement_id: "SRS32", original_column: "AF", original_header: "\u80BF\u7624\u5927\u5C0F\uFF08\u5206\u7C7B\uFF09-\u5927\u4E8E10cm\u4EBA\u6570\uFF08%\uFF09", original_instruction: "\u5206\u7C7B\uFF1A<5cm\uFF1B5\u201310cm\uFF1B>10cm", concept_or_path: "tumour.size_distribution", domain: "TUMOUR", operational_note: ">10cm\uFF1B\u4FDD\u7559\u8FB9\u754C", field_id: "SRS32", order: 32, module_id: "M06", label: "\u80BF\u7624\u5927\u5C0F\uFF08\u5206\u7C7B\uFF09-\u5927\u4E8E10cm\u4EBA\u6570\uFF08%\uFF09", editable_in_final_platform: true }, { requirement_id: "SRS33", original_column: "AG", original_header: "\u80BF\u7624\u6570\u91CF-Mean\xB1SD", original_instruction: "\u4F18\u5148\u5199mean\xB1SD\uFF0C\u5982\u662F\u5176\u4ED6\u53D8\u91CF\u5F62\u5F0F\uFF0C\u9700\u8981\u5199\u660E\u5177\u4F53\uFF0C\u5982median (IQR): 45 (20-67)", concept_or_path: "tumour.number", domain: "TUMOUR", operational_note: "\u6BCF\u60A3\u8005\u75C5\u7076\u6570\u91CF\u7EDF\u8BA1\u4E0E\u591A\u7076\u5206\u7C7B\u5747\u4FDD\u7559", field_id: "SRS33", order: 33, module_id: "M06", label: "\u80BF\u7624\u6570\u91CF-Mean\xB1SD", editable_in_final_platform: true }, { requirement_id: "SRS34", original_column: "AH", original_header: "\u539F\u53D1 vs \u590D\u53D1", original_instruction: "\u5206\u7C7B\uFF1A\u539F\u53D1/\u590D\u53D1/Mix/NR", concept_or_path: "disease.presentation", domain: "DISEASE_STATE", operational_note: "\u539F\u53D1/\u590D\u53D1/\u6DF7\u5408/\u4E0D\u660E\u5BF9\u5E94\u7684\u65F6\u95F4\u70B9", field_id: "SRS34", order: 34, module_id: "M07", label: "\u539F\u53D1 vs \u590D\u53D1", editable_in_final_platform: true }, { requirement_id: "SRS35", original_column: "AI", original_header: "\u539F\u53D1DT\u7684\u4EBA\u6570\uFF08%\uFF09", original_instruction: "n(%)", concept_or_path: "disease.presentation", domain: "DISEASE_STATE", operational_note: "\u539F\u53D1n/N\uFF1B\u4E0D\u662F\u968F\u8BBF\u672A\u590D\u53D1\u4EBA\u6570", field_id: "SRS35", order: 35, module_id: "M07", label: "\u539F\u53D1DT\u7684\u4EBA\u6570\uFF08%\uFF09", editable_in_final_platform: true }, { requirement_id: "SRS36", original_column: "AJ", original_header: "\u590D\u53D1DT\u7684\u4EBA\u6570\uFF08%\uFF09", original_instruction: "n(%)", concept_or_path: "disease.presentation", domain: "DISEASE_STATE", operational_note: "\u57FA\u7EBF\u590D\u53D1n/N\uFF1B\u4E0D\u7B49\u4E8E\u968F\u8BBF\u4E8B\u4EF6", field_id: "SRS36", order: 36, module_id: "M07", label: "\u590D\u53D1DT\u7684\u4EBA\u6570\uFF08%\uFF09", editable_in_final_platform: true }, { requirement_id: "SRS37", original_column: "AK", original_header: "\u5907\u6CE8", original_instruction: "", concept_or_path: "issue.restrictions", domain: "LIMITATIONS", operational_note: "\u5173\u952E\u9650\u5236\u53CA\u9700\u8BF4\u660E\u5185\u5BB9\uFF1B\u4E0D\u80FD\u66FF\u4EE3\u6709\u5B9A\u4E49\u7684\u6269\u5C55\u5B57\u6BB5", field_id: "SRS37", order: 37, module_id: "M08", label: "\u5907\u6CE8", editable_in_final_platform: true }], effective_project_notes: { SRS20: "\u4EC5\u9996\u6B21DT\u53D1\u75C5\u524D\u540C\u90E8\u4F4D\u624B\u672F\uFF1B\u65E2\u5F80DT\u5207\u9664\u53E6\u5916\u4FDD\u7559\u3002", SRS22_SRS23: "FAP\u5BB6\u65CF\u53F2\u4E0E\u672C\u4EBA\u5408\u5E76FAP\u5206\u5F00\uFF1B\u4E0D\u8981\u6C42\u5FC5\u987B\u6709\u9057\u4F20\u68C0\u6D4B\u786E\u8BC1\uFF0CAPC\u80DA\u7CFB\u68C0\u6D4B\u53E6\u8BB0\u3002", SRS24: "\u598A\u5A20/\u4EA7\u540E\u4E0D\u8BBE\u7EDF\u4E00\u65F6\u95F4\u7A97\uFF0C\u6309\u539F\u6587\u5B9A\u4E49\u53CA\u5B9E\u9645\u65F6\u95F4\u8BB0\u5F55\u3002" }, remarks_model: { export_field_id: "SRS37", one_excel_cell: true, editable_segments: ["GENERAL", "M01", "M02", "M03", "M04", "M05", "M06", "M07"], segment_optional: true, assembly_order: ["GENERAL", "M01", "M02", "M03", "M04", "M05", "M06", "M07"], assembly: "Deterministic headings and line breaks for nonempty segments; no AI rewrite at export", aggregate_independent_edit_buffer: false, internal_review_comments_exported: false, status: "PROPOSED_WORKING_DESIGN_NO_SCIENTIFIC_NOTE_REWRITE_IN_THIS_STEP" }, provenance: { source_file: "DT-\u4E2D\u56FD\u786C\u7EA4\u7EF4\u7624-\u60A3\u8005\u7279\u5F81-\u6570\u636E\u63D0\u53D6\u8868-\u5168\u7279\u5F81-20260911(4).xlsx", sha256: "7c0a85386ba7e61579247ee269210ffb1233287020fc2c97a36e8f6895de2e53", first_two_rows_verified: true } };

// src/api.mjs
var accounts = new Map(accounts_default.accounts.map((a) => [a.id, a]));
var enc = new TextEncoder();
var json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers } });
var HttpError = class extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
};
var fail = (status, message, details) => {
  throw new HttpError(status, message, details);
};
var hex = (b) => [...new Uint8Array(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
var digest = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
async function mac(secret, s) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(s)));
}
function equal(a, b) {
  if (a.length !== b.length) return false;
  let c = 0;
  for (let i = 0; i < a.length; i++) c |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return c === 0;
}
function cookie(value, request, clear = false) {
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname);
  return `pc497_session=${value}; Path=${BASE}; HttpOnly; SameSite=Lax; ${local && new URL(request.url).protocol === "http:" ? "" : "Secure; "}Max-Age=${clear ? 0 : 43200}`;
}
async function body(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) fail(415, "\u8BF7\u4F7F\u7528 JSON");
  if (Number(request.headers.get("content-length")) > 14e4) fail(413, "\u5185\u5BB9\u592A\u957F");
  const reader = request.body?.getReader();
  if (!reader) fail(400, "\u7F3A\u5C11\u5185\u5BB9");
  let size = 0, parts = [];
  for (; ; ) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 14e4) {
      await reader.cancel();
      fail(413, "\u5185\u5BB9\u592A\u957F");
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    bytes.set(p, at);
    at += p.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    fail(400, "JSON \u65E0\u6548");
  }
}
async function signedSessionId(request, env) {
  const token = (request.headers.get("cookie") || "").split(";").map((s) => s.trim()).find((s) => s.startsWith("pc497_session="))?.slice(14);
  if (!token || !/^([a-f0-9]{64})\.([a-f0-9]{64})$/.test(token)) return null;
  const [id, sig] = token.split(".");
  return equal(sig, await mac(env.PC497_SESSION_SECRET, id)) ? id : null;
}
async function session(request, env) {
  const id = await signedSessionId(request, env);
  if (!id) fail(401, "\u767B\u5F55\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u8F93\u5165\u4EE3\u53F7");
  const row = await env.PC497_DB.prepare("SELECT * FROM sessions WHERE id=? AND expires>?").bind(id, Date.now()).first();
  if (!row || !accounts.has(row.actor)) fail(401, "\u767B\u5F55\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u8F93\u5165\u4EE3\u53F7");
  return { account: accounts.get(row.actor), id };
}
async function allowed(db, account, id, write = false) {
  const row = await db.prepare("SELECT * FROM records WHERE id=?").bind(id).first();
  if (!row) fail(404, "\u8BB0\u5F55\u4E0D\u5B58\u5728");
  if (account.read_scope === "assigned" && row.owner !== account.id) fail(403, "\u4E0D\u5728\u672C\u4EBA\u5BA1\u6838\u8303\u56F4");
  if (write && account.write_scope === "none") fail(403, "\u5F53\u524D\u4EE3\u53F7\u4E3A\u53EA\u8BFB");
  return row;
}
var explicitSQL = "EXISTS(SELECT 1 FROM operations o WHERE o.record_id=c.record_id AND o.unit=c.unit AND o.action='confirm' AND o.result_revision=c.revision)";
var closedSQL = `((f.status IN ('CONFIRMED','DISCUSS') AND f.field_revision=c.revision) OR c.text<>COALESCE(p.new_text,i.text))`;
var tierJoin = "FROM pc497_risk_tiers t JOIN current_values c ON c.record_id=t.record_id AND c.unit=t.field_id LEFT JOIN field_reviews f ON f.record_id=c.record_id AND f.field_id=c.unit JOIN initial_cells i ON i.record_id=c.record_id AND i.field_id=c.unit LEFT JOIN pc497_science_patches p ON p.record_id=c.record_id AND p.field_id=c.unit AND p.applied_revision=c.revision AND p.new_text=c.text";
var unresolved = (tiers, record = "r.id") => `(SELECT count(*) ${tierJoin} WHERE t.record_id=${record} AND t.tier IN (${tiers.map((t) => "'" + t + "'").join(",")}) AND NOT COALESCE((${closedSQL}),0))`;
var sandboxAccount = (a) => a.id === "srstest";
var publicAccount = (a) => ({ id: a.id, name: sandboxAccount(a) ? "\u4F53\u9A8C\u8D26\u53F7" : a.name, role: a.role, can_write: sandboxAccount(a) || a.write_scope !== "none", sandbox_mode: sandboxAccount(a) });
var authorName = (id) => accounts.get(id)?.name || "";
async function recordData(db, id) {
  const results = await db.batch([
    db.prepare("SELECT * FROM records WHERE id=?").bind(id),
    db.prepare("SELECT payload FROM payload_chunks WHERE record_id=? ORDER BY ordinal").bind(id),
    db.prepare("SELECT c.unit,c.text,c.revision,c.last_author,c.last_modified,p.new_text IS NOT NULL science_patch,p.applied_revision science_patch_revision,p.new_text science_patch_text FROM current_values c LEFT JOIN pc497_science_patches p ON p.record_id=c.record_id AND p.field_id=c.unit AND p.applied_revision=c.revision AND p.new_text=c.text WHERE c.record_id=?").bind(id),
    db.prepare("SELECT f.*,EXISTS(SELECT 1 FROM operations o WHERE o.record_id=f.record_id AND o.unit=f.field_id AND o.action='confirm' AND o.result_revision=f.field_revision) explicit_confirmed FROM field_reviews f WHERE record_id=?").bind(id),
    db.prepare("SELECT key,source_id,sha256 FROM sources WHERE record_id=?").bind(id),
    db.prepare("SELECT field_id,tier FROM pc497_risk_tiers WHERE record_id=?").bind(id)
  ]);
  const data = JSON.parse(results[1].results.map((r) => r.payload).join(""));
  const tiers = new Map(results[5].results.map((t) => [t.field_id, t.tier]));
  for (const c of data.cells) c.review_tier = tiers.get(c.field_id) || null;
  data.state = results[0].results[0];
  data.values = Object.fromEntries(results[2].results.map((v) => [v.unit, v]));
  data.reviews = Object.fromEntries(results[3].results.map((v) => [v.field_id, v]));
  if (Object.values(data.reviews).some((r) => r.status === "DISCUSS")) Object.assign(data, await reviewSnapshot(db, id));
  for (const source of Object.values(data.sources)) {
    const route = results[4].results.find((s) => s.source_id === source.source_id && s.sha256 === source.sha256);
    source.url = route ? API + "sources/" + route.key : null;
  }
  return data;
}
async function mutate(db, account, record, unit, input, action) {
  const op = input.operation_id;
  if (typeof op !== "string" || !/^[a-zA-Z0-9_-]{16,100}$/.test(op)) fail(400, "operation_id \u65E0\u6548");
  const expected = input.expected_revision;
  if (!Number.isSafeInteger(expected) || expected < 0) fail(400, "\u7F3A\u5C11\u5BF9\u8C61\u7248\u672C");
  const text = lf(input.text ?? "");
  if (typeof (input.text ?? "") !== "string" || text.length > 32767) fail(400, "\u6587\u5B57\u4E0D\u5F97\u8D85\u8FC732767\u5B57\u7B26");
  const reqHash = await digest(JSON.stringify({ actor: account.id, record: record.id, unit, action, input: { ...input, text } }));
  const receipt = await db.prepare("SELECT * FROM operations WHERE id=?").bind(op).first();
  const result = async (saved2, replayed = false) => ({ ok: true, revision: saved2.result_revision, text: saved2.new_text, changed: !!saved2.changed, replayed, state: await db.prepare("SELECT status,revision FROM records WHERE id=?").bind(record.id).first(), notes: await db.prepare("SELECT text,revision,last_author FROM current_values WHERE record_id=? AND unit='SRS37'").bind(record.id).first() });
  if (receipt) {
    if (receipt.actor !== account.id || receipt.request_hash !== reqHash) fail(409, "\u64CD\u4F5C ID \u5DF2\u7528\u4E8E\u4E0D\u540C\u8BF7\u6C42");
    return result(receipt, true);
  }
  let sql, params;
  if (action === "edit") {
    sql = `INSERT OR IGNORE INTO operations(id,actor,request_hash,record_id,unit,action,old_text,new_text,result_revision,changed) SELECT ?,?,?,record_id,unit,'edit',text,?,revision+CASE WHEN text<>? THEN 1 ELSE 0 END,CASE WHEN text<>? THEN 1 ELSE 0 END FROM current_values WHERE record_id=? AND unit=? AND revision=?`;
    params = [op, account.id, reqHash, text, text, text, record.id, unit, expected];
  } else if (action === "complete") {
    sql = `INSERT OR IGNORE INTO operations(id,actor,request_hash,record_id,unit,action,new_text,result_revision,changed) SELECT ?,?,?,id,'*','complete','',revision+1,0 FROM records WHERE id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM field_reviews WHERE record_id=records.id AND status='DISCUSS') AND ${unresolved(["P1"], "records.id")}=0 AND (?=1 OR ${unresolved(["P2", "P3"], "records.id")}=0)`;
    params = [op, account.id, reqHash, record.id, expected, input.confirm_remaining === true ? 1 : 0];
  } else {
    if (action === "discuss" && !text.trim()) fail(400, "\u8BF7\u8F93\u5165\u5F85\u786E\u8BA4\u5185\u5BB9");
    if (!Number.isSafeInteger(input.expected_record_revision)) fail(400, "\u7F3A\u5C11\u6587\u7AE0\u7248\u672C");
    sql = `INSERT OR IGNORE INTO operations(id,actor,request_hash,record_id,unit,action,new_text,result_revision,changed,task_ids) SELECT ?,?,?,c.record_id,c.unit,?,?,c.revision,0,i.task_ids FROM current_values c JOIN initial_cells i ON i.record_id=c.record_id AND i.field_id=c.unit JOIN records r ON r.id=c.record_id WHERE c.record_id=? AND c.unit=? AND c.revision=? AND r.revision=?`;
    params = [op, account.id, reqHash, action, text, record.id, unit, expected, input.expected_record_revision];
  }
  await db.prepare(sql).bind(...params).run();
  const saved = await db.prepare("SELECT * FROM operations WHERE id=?").bind(op).first();
  if (!saved && action === "complete") {
    const fields = (await db.prepare(`SELECT t.field_id,t.tier ${tierJoin} WHERE t.record_id=? AND t.tier IN ('P1','P2','P3') AND NOT COALESCE((${closedSQL}),0) ORDER BY t.tier,t.field_id`).bind(record.id).all()).results;
    const p1 = fields.filter((f) => f.tier === "P1");
    if (p1.length) fail(409, `\u4ECD\u6709 ${p1.length} \u4E2A P1 \u5B57\u6BB5\u672A\u660E\u786E\u5904\u7406\uFF1A` + p1.map((p) => field_registry_default.fields.find((f) => f.field_id === p.field_id).label).join("\u3001"), { code: "UNRESOLVED_P1", fields: p1.map((f) => f.field_id) });
    const p2 = fields.filter((f) => f.tier === "P2").length, p3 = fields.filter((f) => f.tier === "P3").length;
    if (input.confirm_remaining !== true && (p2 || p3)) fail(409, `\u4ECD\u6709 P2 ${p2} / P3 ${p3} \u9879\u672A\u9010\u9879\u786E\u8BA4\uFF0C\u5B8C\u6210\u672C\u7BC7\u5C06\u6279\u91CF\u6807\u8BB0\u5DF2\u6838\u5BF9\u3002`, { code: "BULK_CONFIRMATION_REQUIRED", P2: p2, P3: p3 });
  }
  if (!saved) {
    const current = unit === "*" ? await db.prepare("SELECT revision,status FROM records WHERE id=?").bind(record.id).first() : await db.prepare("SELECT text,revision,last_author FROM current_values WHERE record_id=? AND unit=?").bind(record.id, unit).first();
    fail(409, action === "complete" ? "\u6587\u7AE0\u5DF2\u53D8\u5316\u6216\u4ECD\u6709\u5F85\u786E\u8BA4\u4E8B\u9879\uFF0C\u8BF7\u5237\u65B0\u72B6\u6001\u540E\u5904\u7406" : "\u6B64\u5B57\u6BB5\u5DF2\u6709\u65B0\u7248\u672C\uFF1B\u8BF7\u9009\u62E9\u4FDD\u7559\u5185\u5BB9", { current });
  }
  if (saved.actor !== account.id || saved.request_hash !== reqHash) fail(409, "\u64CD\u4F5C ID \u5DF2\u7528\u4E8E\u4E0D\u540C\u8BF7\u6C42");
  return result(saved);
}
async function sourceResponse(request, env, account, key) {
  if (!/^[a-f0-9]{64}$/.test(key)) fail(404, "\u6765\u6E90\u4E0D\u5B58\u5728");
  const row = await env.PC497_DB.prepare("SELECT * FROM sources WHERE key=?").bind(key).first();
  if (!row) fail(404, "\u6765\u6E90\u4E0D\u5C5E\u4E8E\u672C\u9879\u76EE");
  await allowed(env.PC497_DB, account, row.record_id);
  if (!env.PC497_PDF_BUCKET) fail(503, "\u539F\u6587\u5B58\u50A8\u5C1A\u672A\u7ED1\u5B9A");
  const head = await env.PC497_PDF_BUCKET.head(row.r2_key);
  if (!head) fail(404, "\u8BE5\u652F\u6301\u6E90\u6216\u4E3B\u6587\u6682\u4E0D\u53EF\u6253\u5F00\uFF1B\u4FDD\u7559\u539F\u5F15\u7528");
  if (head.customMetadata?.sha256 !== row.sha256 && (!row.verified_etag || row.verified_etag !== head.etag)) fail(409, "\u6765\u6E90\u7248\u672C\u672A\u901A\u8FC7\u7CBE\u786E\u6821\u9A8C\uFF0C\u5F53\u524D\u539F\u6587\u4E0D\u53EF\u7528", { code: "SOURCE_UNAVAILABLE" });
  const headers = new Headers({ "Content-Type": "application/pdf", "Accept-Ranges": "bytes", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "ETag": head.httpEtag, "X-PC497-Source-SHA256": row.sha256 });
  if (head.uploaded) headers.set("Last-Modified", new Date(head.uploaded).toUTCString());
  let range = request.headers.get("range");
  const ifRange = request.headers.get("if-range");
  if (ifRange) {
    const date = Date.parse(ifRange);
    if (ifRange !== head.httpEtag && (!Number.isFinite(date) || !head.uploaded || date < Math.floor(new Date(head.uploaded).getTime() / 1e3) * 1e3)) range = null;
  }
  let start = 0, end = head.size - 1, status = 200;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || !match[1] && !match[2]) return new Response(null, { status: 416, headers: { ...Object.fromEntries(headers), "Content-Range": `bytes */${head.size}` } });
    if (!match[1]) {
      const suffix = Number(match[2]);
      start = Math.max(0, head.size - suffix);
      if (!suffix) start = head.size;
    } else {
      start = Number(match[1]);
      end = match[2] ? Math.min(Number(match[2]), head.size - 1) : head.size - 1;
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= head.size || end < start) return new Response(null, { status: 416, headers: { ...Object.fromEntries(headers), "Content-Range": `bytes */${head.size}` } });
    status = 206;
    headers.set("Content-Range", `bytes ${start}-${end}/${head.size}`);
  }
  headers.set("Content-Length", String(end - start + 1));
  if (request.method === "HEAD") return new Response(null, { status, headers });
  const object = await env.PC497_PDF_BUCKET.get(row.r2_key, { onlyIf: { etagMatches: head.etag }, ...status === 206 ? { range: { offset: start, length: end - start + 1 } } : {} });
  if (!object || !("body" in object)) fail(409, "\u6E90\u6587\u4EF6\u53D1\u751F\u53D8\u5316\uFF0C\u8BF7\u91CD\u8BD5");
  return new Response(object.body, { status, headers });
}
async function exportData(db) {
  const result = await db.prepare(`SELECT r.id,r.title,r.owner,r.status,r.revision,r.last_author,r.last_modified,(SELECT json_group_array(json_object('field_id',field_id,'initial',initial,'current',current,'author',author,'modified_at',modified_at,'revision',revision,'tier',tier,'explicit_confirmed',explicit_confirmed,'reason',reason,'review_status',review_status,'review_revision',review_revision,'review_note',review_note,'science_patch',science_patch,'science_patch_revision',science_patch_revision,'science_patch_text',science_patch_text)) FROM (SELECT i.field_id,i.text initial,c.text current,c.last_author author,c.last_modified modified_at,c.revision,t.tier,${explicitSQL} explicit_confirmed,t.reason,f.status review_status,f.field_revision review_revision,f.note review_note,p.new_text IS NOT NULL science_patch,p.applied_revision science_patch_revision,p.new_text science_patch_text FROM initial_cells i JOIN current_values c ON c.record_id=i.record_id AND c.unit=i.field_id LEFT JOIN field_reviews f ON f.record_id=c.record_id AND f.field_id=c.unit LEFT JOIN pc497_risk_tiers t ON t.record_id=c.record_id AND t.field_id=c.unit LEFT JOIN pc497_science_patches p ON p.record_id=c.record_id AND p.field_id=c.unit AND p.applied_revision=c.revision AND p.new_text=c.text WHERE i.record_id=r.id ORDER BY i.field_id)) cells FROM records r ORDER BY r.sort_order,r.id`).all();
  if (result.results.length !== 497) fail(503, "\u521D\u59CB\u6570\u636E\u672A\u5B8C\u6574\u5C31\u7EEA");
  const rows = [], statuses = [], diffs = [], attention = [], assignments = [];
  for (const r of result.results) {
    const cells = JSON.parse(r.cells);
    if (cells.length !== 37) fail(503, "\u5B57\u6BB5\u6570\u636E\u4E0D\u5B8C\u6574");
    const owner = authorName(r.owner), currentTitle = cells[1].current, states = [], pendingTiers = { P1: 0, P2: 0, P3: 0 }, counts = { "\u5DF2\u6838\u5BF9": 0, "\u5DF2\u4FEE\u6539": 0, "\u5F85\u786E\u8BA4": 0, "\u672A\u5BA1\u6838": 0 };
    for (const c of cells) {
      const state = humanStatus(c.initial, { text: c.current, revision: c.revision, science_patch: c.science_patch, science_patch_revision: c.science_patch_revision, science_patch_text: c.science_patch_text }, { status: c.review_status, field_revision: c.review_revision });
      states.push(state);
      counts[state]++;
      const f = field_registry_default.fields.find((f2) => f2.field_id === c.field_id);
      if (c.initial !== c.current) diffs.push([r.id, currentTitle, f.original_column, f.label, c.initial, c.current, authorName(c.author), beijingTime(c.modified_at), state]);
      const closed = state !== "\u672A\u5BA1\u6838";
      if (["P1", "P2"].includes(c.tier) && !closed) pendingTiers[c.tier]++;
      if (["P1", "P2"].includes(c.tier) || state === "\u5F85\u786E\u8BA4") {
        attention.push([r.id, f.label, c.current, TIER_LABELS[c.tier], [c.reason, state === "\u5F85\u786E\u8BA4" ? c.review_note : ""].filter(Boolean).join("\n"), state, owner, closed ? "\u5DF2\u5904\u7406" : "\u5F85\u5904\u7406"]);
      }
    }
    rows.push([...cells.map((c) => c.current), owner, authorName(r.last_author)]);
    statuses.push([r.id, currentTitle, ...states]);
    assignments.push([r.id, currentTitle, owner, STATUS[r.status], counts["\u5DF2\u6838\u5BF9"], counts["\u5DF2\u4FEE\u6539"], counts["\u5F85\u786E\u8BA4"], pendingTiers.P1 + pendingTiers.P2, TIER_LABELS[["P1", "P2", "P3"].find((t) => pendingTiers[t])] || "", beijingTime(r.last_modified)]);
  }
  attention.sort((a, b) => (a[7] === "\u5DF2\u5904\u7406") - (b[7] === "\u5DF2\u5904\u7406") || a[3].slice(0, 2).localeCompare(b[3].slice(0, 2)));
  return { export_contract: "V4", baseline: BASELINE_SHA, baseline_id: BASELINE_ID, generated_at: (/* @__PURE__ */ new Date()).toISOString(), record_count: 497, rows, statuses, diffs, attention, assignments, notice: EXPORT_NOTICE };
}
async function handle(request, env) {
  try {
    if (!env.PC497_DB || typeof env.PC497_SESSION_SECRET !== "string" || env.PC497_SESSION_SECRET.length < 32) fail(503, "PC497 \u670D\u52A1\u914D\u7F6E\u672A\u5B8C\u6210");
    const url = new URL(request.url);
    if (!url.pathname.startsWith(API)) fail(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    if (!["GET", "HEAD"].includes(request.method) && request.headers.get("origin") !== url.origin) fail(403, "\u5199\u5165\u5FC5\u987B\u6765\u81EA\u672C\u7AD9");
    const path = url.pathname.slice(API.length).split("/").filter(Boolean);
    if (path.join("/") === "auth/logout" && request.method === "POST") {
      const id = await signedSessionId(request, env);
      if (id) await env.PC497_DB.prepare("DELETE FROM sessions WHERE id=?").bind(id).run();
      return json({ ok: true }, 200, { "Set-Cookie": cookie("", request, true) });
    }
    if (path.join("/") === "auth/login" && request.method === "POST") {
      const data = await body(request);
      const code = typeof data.code === "string" ? data.code.trim().toLowerCase() : "";
      const account2 = accounts.get(code);
      if (!account2) fail(401, "\u4EE3\u53F7\u65E0\u6548");
      const ready = await env.PC497_DB.prepare("SELECT ready,input_sha FROM project WHERE id=?").bind("PC497").first();
      if (!ready?.ready || ready.input_sha !== BASELINE_SHA) fail(503, "\u521D\u59CB\u6570\u636E\u5C1A\u672A\u5C31\u7EEA");
      const id = hex(crypto.getRandomValues(new Uint8Array(32))), previous = await signedSessionId(request, env);
      await env.PC497_DB.batch([...previous ? [env.PC497_DB.prepare("DELETE FROM sessions WHERE id=?").bind(previous)] : [], env.PC497_DB.prepare("INSERT INTO sessions VALUES(?,?,?)").bind(id, code, Date.now() + 432e5)]);
      return json({ account: publicAccount(account2), baseline: BASELINE_SHA }, 200, { "Set-Cookie": cookie(id + "." + await mac(env.PC497_SESSION_SECRET, id), request) });
    }
    const { account } = await session(request, env), db = env.PC497_DB;
    if (sandboxAccount(account) && !["GET", "HEAD", "OPTIONS"].includes(request.method)) fail(403, "\u6C99\u76D2\u4E1A\u52A1\u4FEE\u6539\u4EC5\u4FDD\u7559\u5728\u5F53\u524D\u9875\u9762\u5185\u5B58\uFF1B\u670D\u52A1\u5668\u5199\u5165\u5DF2\u963B\u6B62", { code: "SANDBOX_WRITE_BLOCKED", sandbox_mode: true });
    if (path.join("/") === "auth/me" && request.method === "GET") return json({ account: publicAccount(account), baseline: BASELINE_SHA });
    if (path[0] === "sources" && path.length === 2 && ["GET", "HEAD"].includes(request.method)) return await sourceResponse(request, env, account, path[1]);
    if (path[0] === "export-data" && path.length === 1 && request.method === "GET") return json(await exportData(db));
    if (path[0] === "records" && path.length === 1 && request.method === "GET") {
      const rows = await db.prepare(`SELECT r.id,r.title,r.owner,r.status,r.revision,${unresolved(["P1"])} P1,${unresolved(["P2"])} P2,0 P3 FROM records r ${account.read_scope === "assigned" ? "WHERE r.owner=?" : ""} ORDER BY r.sort_order,r.id`).bind(...account.read_scope === "assigned" ? [account.id] : []).all();
      return json({ records: rows.results.map((r) => ({ ...r, tier_summary: { P1: r.P1, P2: r.P2, P3: r.P3, pending: r.P1 + r.P2, highest: ["P1", "P2"].find((t) => r[t]) || "" } })) });
    }
    if (path[0] === "records" && path.length >= 2) {
      const record = await allowed(db, account, path[1], request.method !== "GET");
      if (path.length === 2 && request.method === "GET") return json(await recordData(db, path[1]));
      if (path.length === 4 && request.method === "PATCH") {
        const unit = path[3];
        if (path[2] === "fields" ? !/^SRS(0[2-9]|[12][0-9]|3[0-6])$/.test(unit) : path[2] !== "remarks" || !Object.hasOwn(NOTE_LABELS, unit)) fail(403, "\u8BE5\u5B57\u6BB5\u4E0D\u53EF\u76F4\u63A5\u7F16\u8F91");
        return json(await mutate(db, account, record, unit, await body(request), "edit"));
      }
      if (path.length === 3 && path[2] === "review" && request.method === "GET") return json(await reviewSnapshot(db, record.id));
      if (path.length === 3 && path[2] === "review" && request.method === "POST") {
        const input = await body(request);
        if (!["confirm", "discuss", "set_discuss", "unconfirm", "undiscuss", "complete"].includes(input.action)) fail(400, "\u5BA1\u6838\u52A8\u4F5C\u65E0\u6548");
        const unit = input.action === "complete" ? "*" : input.field_id;
        if (unit !== "*" && !/^SRS(0[1-9]|[12][0-9]|3[0-7])$/.test(unit)) fail(400, "\u5B57\u6BB5\u65E0\u6548");
        return json(input.action === "complete" ? await mutate(db, account, record, unit, input, input.action) : await mutateReview(db, account, record, input, { fail, digest }));
      }
    }
    fail(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...e.details }, e.status);
    console.error("PC497_API_FAILURE", e.name, e.message);
    return json({ error: "\u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528\uFF1B\u672A\u540C\u6B65\u8349\u7A3F\u8BF7\u4FDD\u7559" }, 500);
  }
}

// src/function.mjs
var onRequest = ({ request, env }) => handle(request, env);
export {
  onRequest
};
