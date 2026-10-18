import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireTenantContext } from "@/lib/tenancy/context";
import { handleRouteError } from "@/lib/tenancy/errors";
import { inngest } from "@/inngest/client";

const schema=z.object({
 leaveTypeId:z.string().min(1),
 accountingMethod:z.enum(["FIXED_ENTITLEMENT","ACCRUAL","MANUAL"]),
 annualEntitlement:z.number().min(0).max(1000).nullable().optional(),
 accrualPerMonth:z.number().min(0).max(100).nullable().optional(),
 allowNegative:z.boolean().default(false),
 allowUnpaid:z.boolean().default(false),
 allowPartialDays:z.boolean().default(true),
 effectiveFrom:z.coerce.date(),
 effectiveTo:z.coerce.date().nullable().optional(),
 config:z.object({
  countingMode:z.enum(["WORKING_DAYS","CALENDAR_DAYS"]).default("WORKING_DAYS"),
  carryForwardAllowed:z.boolean().default(false),
  carryForwardLimit:z.number().min(0).max(1000).default(0),
  carryForwardExpiryMonths:z.number().int().min(1).max(24).nullable().default(null),
  minimumNoticeDays:z.number().int().min(0).max(365).default(0),
  maxConsecutiveDays:z.number().min(0).max(365).nullable().default(null),
  approvalMode:z.enum(["INHERIT","MANAGER","HR","MANAGER_THEN_HR","NONE"]).default("INHERIT"),
  probationRestricted:z.boolean().default(false),
  notes:z.string().max(1000).default("")
 }).default({})
}).superRefine((v,ctx)=>{
 if(v.effectiveTo&&v.effectiveTo<v.effectiveFrom)ctx.addIssue({code:"custom",path:["effectiveTo"],message:"Effective-to date must be on or after effective-from"});
 if(v.accountingMethod==="FIXED_ENTITLEMENT"&&(v.annualEntitlement==null))ctx.addIssue({code:"custom",path:["annualEntitlement"],message:"Annual entitlement is required for fixed entitlement"});
 if(v.accountingMethod==="ACCRUAL"&&(v.accrualPerMonth==null))ctx.addIssue({code:"custom",path:["accrualPerMonth"],message:"Monthly accrual is required for accrual policies"});
});

export async function GET(){try{const ctx=await requireTenantContext(["COMPANY_ADMIN","HR_MANAGER"]);const data=await prisma.leaveType.findMany({where:{tenantId:ctx.tenantId},orderBy:{name:"asc"},include:{policies:{orderBy:{version:"desc"}}}});return NextResponse.json({data})}catch(e){return handleRouteError(e)}}
export async function POST(request:Request){
 try{
  const ctx=await requireTenantContext(["COMPANY_ADMIN","HR_MANAGER"]);
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"Invalid leave policy",details:parsed.error.flatten()},{status:400});
  const input=parsed.data;
  const leaveType=await prisma.leaveType.findFirst({where:{id:input.leaveTypeId,tenantId:ctx.tenantId,active:true},select:{id:true}});
  if(!leaveType)return NextResponse.json({error:"Leave type not found"},{status:404});
  const policy=await prisma.$transaction(async tx=>{
   const existing=await tx.leavePolicyVersion.findMany({where:{tenantId:ctx.tenantId,leaveTypeId:input.leaveTypeId},orderBy:{version:"desc"},select:{id:true,version:true,effectiveFrom:true,effectiveTo:true}});
   const future=existing.find(p=>p.effectiveFrom>=input.effectiveFrom);
   if(future)throw new Error("POLICY_DATE_CONFLICT");
   const version=(existing[0]?.version??0)+1;
   const prior=existing.find(p=>p.effectiveFrom<input.effectiveFrom&&(!p.effectiveTo||p.effectiveTo>=input.effectiveFrom));
   if(prior){const dayBefore=new Date(input.effectiveFrom);dayBefore.setDate(dayBefore.getDate()-1);await tx.leavePolicyVersion.update({where:{id:prior.id},data:{effectiveTo:dayBefore}});}
   const created=await tx.leavePolicyVersion.create({data:{tenantId:ctx.tenantId,leaveTypeId:input.leaveTypeId,version,accountingMethod:input.accountingMethod,annualEntitlement:input.annualEntitlement??null,accrualPerMonth:input.accrualPerMonth??null,allowNegative:input.allowNegative,allowUnpaid:input.allowUnpaid,allowPartialDays:input.allowPartialDays,effectiveFrom:input.effectiveFrom,effectiveTo:input.effectiveTo??null,config:input.config,createdById:ctx.userId}});
   await tx.auditEvent.create({data:{tenantId:ctx.tenantId,actorUserId:ctx.userId,action:"LEAVE_POLICY_VERSION_CREATED",entityType:"LeavePolicyVersion",entityId:created.id,metadata:{leaveTypeId:input.leaveTypeId,version,accountingMethod:input.accountingMethod,effectiveFrom:input.effectiveFrom.toISOString()}}});
   return created;
  });
  try{await inngest.send({name:"leave/policy.version-created",data:{tenantId:ctx.tenantId,leaveTypeId:input.leaveTypeId,policyVersionId:policy.id}})}catch(e){console.error("Unable to enqueue policy recalculation",e)}
  return NextResponse.json({data:policy},{status:201});
 }catch(e){if(e instanceof Error&&e.message==="POLICY_DATE_CONFLICT")return NextResponse.json({error:"A policy version already starts on or after this date. Use a date later than the latest version."},{status:409});return handleRouteError(e)}
}
