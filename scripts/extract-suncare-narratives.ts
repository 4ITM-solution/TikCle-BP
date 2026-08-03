// 선케어 리포트 §4 재추출 — 클러스터(훅·sun비율·지표) + 클러스터별 top5 영상
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) as any;
const CASES: Record<string,string> = {
  eltamd:"c2b6ddbb-5c8a-46bd-8b35-798769c6cdef", lrp:"776daa70-eb32-42ef-800c-f1a731e14300",
  skin1004:"553244b1-9a56-4253-8798-1aac2e662f2a", abib:"9a71a17e-57a3-4adc-b10a-fbbe9b3de4ad" };
const ONLY = process.env.ONLY?.split(",");
const SUN = /(sun|spf|uv |anthelios|자차|선크림|선스틱|썬)/i;
async function all(q:any){const o:any[]=[];for(let f=0;f<200000;f+=1000){const{data,error}=await q.range(f,f+999);if(error)throw error;if(!data?.length)break;o.push(...data);if(data.length<1000)break;}return o;}
async function main(){
  const base = JSON.parse(readFileSync(process.env.IN!, "utf8"));
  for(const [key, cid] of Object.entries(CASES)){
    if(ONLY && !ONLY.includes(key)) continue;
    const { data: c } = await sb.from("cases").select("brand_id, country").eq("id", cid).single();
    const contents = await all(sb.from("contents")
      .select("id, url, caption, views, likes, comments, collect_count, is_ad, influencer_id")
      .eq("brand_id", c.brand_id).eq("country", c.country).gte("uploaded_at","2025-06-01"));
    const byId = new Map(contents.map((x:any)=>[String(x.id),x]));
    const inflIds=[...new Set(contents.map((x:any)=>x.influencer_id).filter(Boolean))];
    const im=new Map<string,any>();
    for(let i=0;i<inflIds.length;i+=200){const{data}=await sb.from("influencers").select("id,handle").in("id",inflIds.slice(i,i+200));for(const r of data??[])im.set(r.id,r);}
    const tags = await all(sb.from("case_video_analyses").select("content_id, vision_tags").eq("case_id", cid));
    const tm = new Map(tags.map((t:any)=>[String(t.content_id), t.vision_tags??{}]));
    const { data: cls } = await sb.from("content_clusters").select("id,name,hook_pattern").eq("case_id",cid).eq("is_meta",false);
    const clusters:any[]=[]; const vids:any[]=[];
    for(const cl of cls??[]){
      const mem = await all(sb.from("content_cluster_members").select("content_id").eq("cluster_id",cl.id));
      const rows = mem.map((m:any)=>byId.get(String(m.content_id))).filter(Boolean);
      if(rows.length<6) continue;
      const sunN = rows.filter((r:any)=>SUN.test(r.caption??"")).length;
      const meas = rows.filter((r:any)=>r.views>0 && (r.comments!=null||r.collect_count!=null));
      const c2v = meas.length? Math.round(rows.reduce((s:number,r:any)=>s+(r.comments&&r.views?r.comments/r.views:0),0)/meas.length*10000)/100 : null;
      const s2v = meas.length? Math.round(rows.reduce((s:number,r:any)=>s+(r.collect_count&&r.views?r.collect_count/r.views:0),0)/meas.length*10000)/100 : null;
      clusters.push({n:cl.name,c:rows.length,c2v,s2v,rev:null,gpm:null,tot:meas.length,h:cl.hook_pattern??"",sun:Math.round(sunN/rows.length*100)});
      const top=[...rows].sort((a:any,b:any)=>(b.views??0)-(a.views??0)).slice(0,5);
      for(const v of top){
        const idm=String(v.url).match(/\/(?:video|photo)\/(\d+)/); if(!idm) continue;
        const infl=v.influencer_id?im.get(v.influencer_id):null;
        const vt=tm.get(String(v.id))??{};
        vids.push([cl.name,infl?.handle??"",idm[1],v.views??0,v.likes??0,v.comments??0,v.collect_count??null,
          v.views?Math.round((v.comments??0)/v.views*10000)/100:null,
          v.views&&v.collect_count!=null?Math.round(v.collect_count/v.views*10000)/100:null,
          !!v.is_ad,0,vt.content_angle??"",vt.content_format??"","",(vt.products_visible??[]).slice(0,3)]);
      }
    }
    clusters.sort((a,b)=>b.c-a.c);
    base[key].clusters=clusters; base[key].vids=vids;
    console.error(key,"clusters",clusters.length,"vids",vids.length,"sun50+",clusters.filter(x=>x.sun>=50).length);
  }
  writeFileSync(process.env.IN!, JSON.stringify(base));
}
main().catch(e=>{console.error("FAIL",e.message);process.exit(1)});
