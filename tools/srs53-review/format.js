// Restricted literal grammar for legacy Python/JSON dictionary strings. Never executes code.
export function structured(value){
 if(value&&typeof value==='object')return value;
 if(typeof value!=='string'||!/^\s*[\[{]/.test(value))return null;
 let i=0;const s=value;const ws=()=>{while(/\s/.test(s[i]||'')&&i<s.length)i++;};
 const read=(depth=0)=>{if(depth>12)throw Error();ws();const c=s[i++];
  if(c==='"'||c==="'"){let out='';for(;i<s.length;){const x=s[i++];if(x===c)return out;if(x==='\\'){const e=s[i++];if(e==='u'){const h=s.slice(i,i+4);if(!/^[a-f\d]{4}$/i.test(h))throw Error();out+=String.fromCharCode(parseInt(h,16));i+=4;}else out+=({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f'}[e]??e);}else out+=x;}throw Error();}
  if(c==='{'||c==='['){const o=c==='{'?{}:[],end=c==='{'?'}':']';ws();if(s[i]===end){i++;return o;}for(;;){if(c==='{'){const k=read(depth+1);if(typeof k!=='string'||['__proto__','constructor','prototype'].includes(k))throw Error();ws();if(s[i++]!==':')throw Error();o[k]=read(depth+1);}else o.push(read(depth+1));ws();if(s[i]===end){i++;return o;}if(s[i++]!==',')throw Error();ws();if(s[i]===end){i++;return o;}}}
  i--;const m=/^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|True|False|None)/.exec(s.slice(i));if(!m)throw Error();i+=m[0].length;const literals={true:true,True:true,false:false,False:false,null:null,None:null};return Object.hasOwn(literals,m[0])?literals[m[0]]:Number(m[0]);
 };try{const v=read();ws();return i===s.length&&v&&typeof v==='object'?v:null;}catch{return null;}
}
export const fieldNames={enrollment_start:'入组开始',enrollment_end:'入组结束',cutoff:'结局统计截止',locator:'来源位置',status:'来源状态'};
export function dateText(v){if(typeof v!=='string')return String(v??'');const m=/^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(v);return m?`${m[1]}年${Number(m[2])}月${m[3]?Number(m[3])+'日':''}`:v;}
export function formatValue(v){const obj=structured(v);if(obj){if('enrollment_start'in obj||'cutoff'in obj)return [obj.enrollment_start||obj.enrollment_end?`入组时间：${dateText(obj.enrollment_start)}—${dateText(obj.enrollment_end)}`:null,obj.cutoff?`结局统计截止：${dateText(obj.cutoff)}`:null,...Object.entries(obj).filter(([k])=>!['enrollment_start','enrollment_end','cutoff'].includes(k)).map(([k,v])=>`${fieldNames[k]||k}：${formatValue(v)}`)].filter(Boolean).join('\n');return Object.entries(obj).map(([k,x])=>`${fieldNames[k]||k}：${formatValue(x)}`).join('\n');}return v===null?'空值（保持原缺失表示）':v===undefined?'':String(v);}
export const clinicalSections=['研究人群','治疗方案','疗效随访','安全性','其他'];
export function sectionFor(o){if(['研究概况','基线与随访'].includes(o.module))return '研究人群';if(o.module==='治疗与人群')return '治疗方案';const text=[o.module,o.title,o.text||'',...(o.facts||[]).map(f=>f.label)].join(' ');if(/停药|转换|减量|中断|后续治疗/.test(text))return '治疗方案';if(/安全|不良|毒性|SAE|AE|耐受/.test(text))return '安全性';if(/疗效|随访|PRO|VAS|疼痛|功能|生存|缓解|ORR|DCR|PFS|RFS|OS|EFS/i.test(text))return '疗效随访';if(/治疗|剂量|方案|用药/.test(text))return '治疗方案';if(/研究|人群|基线|入组|设计|病理|人口|年龄|性别/.test(text))return '研究人群';return '其他';}
export const localTime=v=>v?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+' UTC+08:00':'尚无人工审核';
export const actionNames={confirm:'确认',unconfirm:'取消确认',edit:'修改',question:'问题',omission:'遗漏',withdraw:'撤回',restore:'恢复',support:'来源修订'};

export const displayText=v=>String(v??'').replace(/\bkey\b/g,'文献归属').replace(/\s*\[(?:[PB]\d{2}|BATCH|REV)[^\]]*\]/g,'').replace(/APP-(?:FACT|RESULT|ROW|SOURCE)-[a-f0-9]+/g,'');
