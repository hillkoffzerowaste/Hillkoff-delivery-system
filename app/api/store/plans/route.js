import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { bangkokMonthRange } from "../../../../lib/storeFormat.js";
import { validateStorePlan } from "../../../../lib/storePlan.js";
import { readStoreRoster } from "../../../../lib/storeRoster.js";
export const runtime = "nodejs";
const fail=(message,status)=>Object.assign(new Error(message),{status});
const stamp=(old="")=>new Date(Math.max(Date.now(),(Date.parse(old)||0)+1)).toISOString();
const validId=(id)=>typeof id==="string"&&id.length>0&&id.length<=200&&!id.includes("/");
async function bodyOf(request){try{return await request.json()}catch{throw fail("ข้อมูลไม่ถูกต้อง",400)}}
// ownerName always comes from the roster so a personal plan cannot be filed under a made-up name.
async function withOwner(db,value){if(!value.ownerId)return {...value,ownerName:""};const member=(await readStoreRoster(db)).find(x=>x.uid===value.ownerId);if(!member||member.name.toLowerCase()==="store")throw fail("ไม่พบพนักงานคนนี้ในรายชื่อสโตร์",400);return {...value,ownerName:member.name};}
export async function GET(request){try{
 const {db}=await requireProfile(request,["store","admin"]);const month=new URL(request.url).searchParams.get("month");const range=bangkokMonthRange(month);if(!range)throw fail("เดือนไม่ถูกต้อง",400);
 const snap=await db.collection("store_plans").where("date",">=",range.from).where("date","<=",range.to).orderBy("date").limit(1001).get();if(snap.docs.length>1000)throw fail("แผนงานเดือนนี้มีจำนวนมากเกินขีดจำกัด",422);
 const items=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>!x.deletedAt);return Response.json({ok:true,data:{items}});
}catch(e){return errorResponse(e)}}
export async function POST(request){try{
 const {db,profile}=await requireProfile(request,["store"]);const checked=validateStorePlan(await bodyOf(request));if(!checked.ok)throw fail(checked.error,400);const value=await withOwner(db,checked.value);const now=stamp(),ref=db.collection("store_plans").doc();const doc={...value,status:"planned",createdAt:now,updatedAt:now,createdBy:profile.name||profile.email||"",createdByUid:profile.uid,updatedByUid:profile.uid};await db.runTransaction(async tx=>tx.set(ref,doc));return Response.json({ok:true,data:{id:ref.id,...doc}});
}catch(e){return errorResponse(e)}}
async function change(request,deleted){try{
 const {db,profile}=await requireProfile(request,["store"]);const body=await bodyOf(request);const owned=!deleted&&body.status===undefined?validateStorePlan(body):null;if(owned&&!owned.ok)throw fail(owned.error,400);const ownerValue=owned?await withOwner(db,owned.value):null;if(!validId(body.id)||typeof body.baseUpdatedAt!=="string")throw fail("ข้อมูลไม่ถูกต้อง",400);const ref=db.collection("store_plans").doc(body.id);
 const result=await db.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists||snap.data().deletedAt)throw fail("ไม่พบแผนงาน",404);const doc=snap.data();if(doc.updatedAt!==body.baseUpdatedAt)throw fail("แผนงานเปลี่ยนแล้ว กรุณาโหลดใหม่",409);const now=stamp(doc.updatedAt);let patch={updatedAt:now,updatedByUid:profile.uid};
 if(deleted)patch={...patch,deletedAt:now,deletedByUid:profile.uid};else if(body.status!==undefined){if(!["planned","done"].includes(body.status))throw fail("สถานะไม่ถูกต้อง",400);patch.status=body.status;}else patch={...patch,...ownerValue};
 tx.update(ref,patch);return {id:ref.id,...doc,...patch};});return Response.json({ok:true,data:result});
}catch(e){return errorResponse(e)}}
export const PATCH=(request)=>change(request,false);
export const DELETE=(request)=>change(request,true);
