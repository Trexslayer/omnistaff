import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireTenantContext } from "@/lib/tenancy/context";
import { handleRouteError } from "@/lib/tenancy/errors";

const schema=z.object({name:z.string().trim().min(2).max(80),code:z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_-]{1,19}$/),paid:z.boolean().default(true),requiresApproval:z.boolean().default(true)});
export async function GET(){try{const ctx=await requireTenantContext(["COMPANY_ADMIN","HR_MANAGER","REPORTING_MANAGER"]);const data=await prisma.leaveType.findMany({where:{tenantId:ctx.tenantId},orderBy:{name:"asc"},include:{policies:{where:{effectiveTo:null},orderBy:{version:"desc"},take:1}}});return NextResponse.json({data});}catch(e){return handleRouteError(e)}}
export async function POST(request:Request){try{const ctx=await requireTenantContext(["COMPANY_ADMIN","HR_MANAGER"]);const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Invalid leave type",details:parsed.error.flatten()},{status:400});const item=await prisma.leaveType.create({data:{...parsed.data,tenantId:ctx.tenantId}});await prisma.auditEvent.create({data:{tenantId:ctx.tenantId,actorUserId:ctx.userId,action:"LEAVE_TYPE_CREATED",entityType:"LeaveType",entityId:item.id,metadata:{code:item.code}}});return NextResponse.json({data:item},{status:201})}catch(e){if(e&&typeof e==="object"&&"code"in e&&e.code==="P2002")return NextResponse.json({error:"A leave type with that code already exists"},{status:409});return handleRouteError(e)}}
