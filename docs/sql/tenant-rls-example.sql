-- Defense-in-depth template. Apply and test RLS for every tenant-scoped table before production.
-- The application must set app.tenant_id transaction-locally for each scoped DB transaction.
-- Do not enable this template until every query path (including jobs) sets that context.
-- The app DB role must not own these tables or have BYPASSRLS.

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'Department',
    'Employee',
    'LeaveType',
    'LeavePolicyVersion',
    'LeaveRequest',
    'LeaveTransaction',
    'ApprovalDecision',
    'EmployeeInvitation',
    'TenantHoliday'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))',
      lower(table_name || '_tenant_isolation'), table_name
    );
  END LOOP;
END $$;

-- AuditEvent and OutboxEvent allow tenantId to be NULL for platform/system events.
-- Define separate policies for those tables instead of applying the strict non-null template.
-- TenantMembership also needs a deliberate policy design because users can have memberships
-- across tenants and platform admins require separately controlled platform-level access.
