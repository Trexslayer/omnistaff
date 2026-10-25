
"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/reports/data-table";

type Employee = {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  jobTitle: string | null;
  department: { name: string } | null;
};

const employeeColumns: ColumnDef<Employee>[] = [
  {
    accessorKey: "employeeNumber",
    header: "Employee No.",
  },
  {
    id: "name",
    header: "Name",
    accessorFn: (row) => `${row.firstName} ${row.lastName}`,
  },
  {
    accessorKey: "workEmail",
    header: "Work Email",
  },
  {
    accessorKey: "jobTitle",
    header: "Job Title",
    cell: ({ getValue }) => getValue<string | null>() ?? "—",
  },
  {
    id: "department",
    header: "Department",
    accessorFn: (row) => row.department?.name ?? "—",
  },
];

export function EmployeeDataTable({
  data,
}: {
  data: Employee[];
}) {
  return <DataTable columns={employeeColumns} data={data} />;
}
