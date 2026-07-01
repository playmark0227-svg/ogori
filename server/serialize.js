// DBの行をAPIレスポンス用に整形する（機密情報は絶対に含めない）。

export function publicCompany(company) {
  return {
    companyId: company.company_id,
    name: company.name,
    adminName: company.admin_name,
    adminEmail: company.admin_email,
    plan: company.plan,
    createdAt: company.created_at,
  };
}

export function publicEmployee(emp) {
  return {
    id: emp.id,
    employeeCode: emp.employee_code,
    name: emp.name,
    email: emp.email ?? null,
    department: emp.department ?? null,
    postalCode: emp.postal_code ?? null,
    address: emp.address ?? null,
    status: emp.status,
    addressRegistered: Boolean(emp.address && emp.address.trim()),
    createdAt: emp.created_at,
  };
}

export function publicDelivery(d) {
  return {
    id: d.id,
    year: d.year,
    month: d.month,
    productType: d.product_type,
    productName: d.product_name,
    status: d.status,
    scheduledDate: d.scheduled_date,
  };
}
