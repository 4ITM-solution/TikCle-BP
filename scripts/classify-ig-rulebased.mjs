import fs from "fs";
const env={};for(const l of fs.readFileSync("/Users/sanghui/티클/TikCle-BP/.env.local","utf8").split("\n")){const i=l.indexOf("=");if(i>0&&!l.startsWith("#"))env[l.slice(0,i)]=l.slice(i+1).replace(/^"|"$/g,"");}
const SB=env.NEXT_PUBLIC_SUPABASE_URL,KEY=env.SUPABASE_SERVICE_ROLE_KEY;
const caseId=process.argv[2];
const rest=async p=>{const r=await fetch(`${SB}/rest/v1/${p}`,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`}});if(!r.ok)throw new Error(await r.text());return r.json();};

// 케이스별 규칙: [클러스터명, [키워드...], [해당앵글...]]  — 위에서부터 우선매칭
const RULES={
 k:[
  ["기브어웨이·이벤트 참여 유도형",["giveaway","가와","기브"],[]],
  ["아마존 프라임데이·할인 긴급 구매 촉구형",["prime day","amazon prime","40% off","prime"],[]],
  ["한국 헤어케어 전환 설득형",["stray kids","i.n","kpop","k-pop","korean haircare","한국"],[]],
  ["향(Scent) 감각 소구 구매 설득형",["scent","musk","smell","향","냄새","fragrance"],[]],
  ["언박싱·PR 하울 호기심 유발형",["pr ","unbox","haul","haul","pr box","free stuff","free sample"],["unboxing"]],
  ["가격 비교·할인코드 가성비 소구형",["$","cheap","price","가성비","code","discount","vs "],["comparison"]],
  ["리스트·큐레이션 저장 유도형",["top ","favorites","favourites","hair oils","list","best of","must have"],["list_curation"]],
  ["성분·기능 교육 정보형",["ingredient","protein","bonding","hyaluron","matcha","kale","scalp scrub"],["ingredient_breakdown","expert_education"]],
  ["변신 약속·Before/After 결과 시각화형",["before","after","hairline","grew","transformation","6 month","glow up"],["before_after"]],
  ["헤어 루틴·튜토리얼 데모 시연형",["routine","how to","refresh","rutina","tutorial","5min"],["tutorial"]],
  ["POV 보이스오버 헤어루틴 몰입형",["pov"],["voiceover_pov"]],
  ["일상 라이프스타일 내러티브 페르소나형",["grwm","morning","daily","luxurious"],["lifestyle"]],
  ["문제 제기 솔루션 제시형",["problem","damage","dry","frizz","hair loss","고민"],["problem_statement"]],
  ["소셜프루프 신뢰 기반 구매 전환형",["viral","best","award","everyone","tiktok made"],["testimonial","review"]],
  ["퍼스널 스토리 토킹헤드 UGC 리뷰형",[],["review","talking_head"]],
 ],
 l:[
  ["신시장 런칭·B2B 공급 알림형",["wholesale","now available","b2b","distributor","런칭"],[]],
  ["할인·이벤트 카운트다운 긴급 구매 유도형",["code:","discount","% off","sale","viral de corea","don't have to go bald","calva"],[]],
  ["전문가 스티치 반응 검증형",["stitch","expert","derma","doctor","microscope","science"],[]],
  ["브러시 앰플 특수 어플리케이터 제품 집중 소개형",["brush ampoule","brush","applicator","어플리케이터","steaming brush"],[]],
  ["언박싱·PR 하울 제품 공개형",["unbox","pr ","haul","pr haul","today's pr"],["unboxing"]],
  ["K-뷰티 한국 성분·권위 소구형",["korea","korean","coreano","#1","ranking","권위","성분"],[]],
  ["두피 루틴 튜토리얼 데모 시연형",["routine","ritual","step","scalp ritual","rizos","asmr","tutorial"],["tutorial"]],
  ["비포·애프터 변화 시각화 결과 증명형",["before","after","glow up","grow","length","baby hair"],["before_after"]],
  ["리스트·큐레이션 저장 유도형",["list","top ","never stop","repurchasing","haircare coreano"],["list_curation"]],
  ["제품 세트·번들 조합 추천형",["trio","set","bundle","kit","세트"],[]],
  ["남성·특정 타깃 두피 케어 세분화형",["postpartum","post partum","men","braids","edges","산후"],[]],
  ["호기심 갭·충격 팩트 교육형",["scalp ages","faster than your face","did you know","fact","sag"],["expert_education","ingredient_breakdown"]],
  ["POV·보이스오버 감성 일상 페르소나형",["pov","bed time","creator life","daily"],["lifestyle"]],
  ["개인 서사 변신 약속 증언형",["my hair","i tried","month check","journey"],["testimonial"]],
  ["질문형 훅 고민 공감 증언형",["?","problem con","cuero cabelludo","do you"],[]],
  ["문제제기 보이스오버 솔루션 연결형",["problem","hydrating","solution","mask"],["review","testimonial"]],
  ["소셜 프루프·수치 권위 신뢰 구축형",["#1","best seller","sold","award","proof"],["review","testimonial"]],
  ["탈모·두피 고민 공감 토킹헤드 리뷰형",["scalp","hair loss","thinning","dandruff","두피","탈모","hair fall","itchy"],["review","talking_head","testimonial"]],
 ]
};
const br=caseId==="092f9ef8-be97-4129-8bc4-96bc74d96f53"?"k":"l";
const rules=RULES[br];

const vids=[];for(let f=0;;f+=1000){const p=await rest(`case_video_analyses?case_id=eq.${caseId}&platform=eq.instagram&vision_tags=not.is.null&select=external_ref,vision_tags&offset=${f}&limit=1000`);vids.push(...p);if(p.length<1000)break;}
const posts=[];for(let f=0;;f+=1000){const p=await rest(`ig_posts?case_id=eq.${caseId}&select=ig_id,short_code,owner_username,caption,likes_count,comments_count,video_play_count,paid_signal&offset=${f}&limit=1000`);posts.push(...p);if(p.length<1000)break;}
const byId=new Map(posts.map(p=>[p.ig_id,p]));
const items=vids.map(v=>{const p=byId.get(v.external_ref);if(!p)return null;const t=v.vision_tags||{};return{sc:p.short_code,who:p.owner_username,lk:p.likes_count??0,cm:p.comments_count??0,vw:p.video_play_count??0,paid:p.paid_signal,ang:t.content_angle,fmt:t.body_format,ovl:t.overlay_text||"",pr:t.products_visible||[],cap:(p.caption||"").slice(0,200)};}).filter(Boolean);

const classify=it=>{const hay=(it.ovl+" "+it.cap).toLowerCase();
 for(const[name,kws,angs]of rules){
   if(kws.some(k=>hay.includes(k)))return name;
   if(angs.length&&angs.includes(it.ang))return name;
 }
 return rules[rules.length-1][0];};
const agg={};
for(const it of items){const cl=classify(it);(agg[cl]||={n:0,crSum:0,crN:0,posts:[]}).n++;if(it.vw>0){agg[cl].crSum+=it.cm/it.vw*10000;agg[cl].crN++;}agg[cl].posts.push(it);}
const out={};
for(const[cl,a]of Object.entries(agg)){a.posts.sort((x,y)=>(y.vw>0?y.cm/y.vw:0)-(x.vw>0?x.cm/x.vw:0));
 out[cl]={n:a.n,cr10k:a.crN?+(a.crSum/a.crN).toFixed(1):null,posts:a.posts.slice(0,5).map(p=>[p.who,p.sc,p.lk,p.cm,p.vw,p.vw>0?+(p.cm/p.vw*10000).toFixed(1):null,p.ang,p.fmt,p.ovl.slice(0,60),p.pr,p.paid])};}
fs.writeFileSync(`/tmp/ig-clusters-${caseId}.json`,JSON.stringify(out));
console.log(`${br} IG ${items.length}건 → ${Object.keys(out).length}클러스터`);
console.log(Object.entries(out).sort((a,b)=>b[1].n-a[1].n).map(([k,v])=>`  ${v.n.toString().padStart(3)} ${v.cr10k??"-"} ${k}`).join("\n"));
