import { beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({role:"pack",rows:[]}));
vi.mock("../../lib/workflowAuth.js",()=>({requireProfile:async()=>({profile:{role:state.role,uid:"u",name:"N"},db:{collection:()=>query(),getAll:async()=>[]}}),errorResponse:e=>Response.json({ok:false,error:e.message},{status:e.status||500})}));
function query(){let start="",end="",type="",max=0;const q={where:(f,op,v)=>{if(f==="type")type=v;return q},orderBy:()=>q,startAt:v=>{end=v;return q},endAt:v=>{start=v;return q},limit:v=>{max=v;return q},get:async()=>({docs:state.rows.filter(x=>(!type||x.type===type)&&(!start||x.createdAt>=start)&&(!end||x.createdAt<=end)).slice(0,max).map(x=>({id:x.id,data:()=>x}))})};return q;}
const req=(q)=>new Request(`http://localhost/api/store/reports?${q}`);
beforeEach(()=>{state.role="pack";state.rows=[{id:"a",type:"booking",createdAt:"2026-10-10T03:00:00.000Z",confirmedAt:"yes",packStatus:"checked"},{id:"b",type:"booking",createdAt:"2026-10-27T02:00:00.000Z",confirmedAt:"yes",packStatus:"pending"},{id:"c",type:"booking",createdAt:"2026-09-29T02:00:00.000Z",confirmedAt:"yes",packStatus:"checked"}];});
describe("monthly pack history",()=>{
 it("returns all matching documents across the requested month including checked",async()=>{const {GET}=await import("../../app/api/store/reports/route.js");const r=await GET(req("type=booking&month=2026-10"));expect(r.status).toBe(200);expect((await r.json()).data.map(x=>x.id)).toEqual(["a","b"]);});
 it("rejects invalid months and requests without a report type",async()=>{const {GET}=await import("../../app/api/store/reports/route.js");expect((await GET(req("type=booking&month=2026-13"))).status).toBe(400);expect((await GET(req("month=2026-10"))).status).toBe(400);});
 it("reports overflow rather than silently truncating",async()=>{state.rows=Array.from({length:1001},(_,i)=>({id:`x${i}`,type:"booking",createdAt:"2026-10-01T01:00:00.000Z"}));const {GET}=await import("../../app/api/store/reports/route.js");expect((await GET(req("type=booking&month=2026-10"))).status).toBe(422);});
});
