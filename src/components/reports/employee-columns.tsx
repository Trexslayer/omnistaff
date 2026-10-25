import type { ColumnDef } from "@tanstack/react-table";
export type EmployeeRow = { employeeNumber: string; firstName: string; lastName: string; workEmail: string; jobTitle: string | null; department: { name: string } | null };
export const employeeColumns: ColumnDef<EmployeeRow>[] = [
  { accessorKey: "employeeNumber", header: "Employee ID" },
  { id: "name", header: "Name", accessorFn: row => `${row.firstName} ${row.lastName}` },
  { accessorKey: "workEmail", header: "Work email" },
  { accessorKey: "jobTitle", header: "Job title" },
  { id: "department", header: "Department", accessorFn: row => row.department?.name ?? "—" },
];
