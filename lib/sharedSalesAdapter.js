function query(values) {
  return new URLSearchParams(Object.entries(values).filter(([, value]) => value !== undefined && value !== "")).toString();
}

async function unwrap(response) {
  const payload = await response.json().catch(() => ({ ok: false, error: "ระบบตอบกลับไม่สมบูรณ์" }));
  if (!response.ok || payload?.ok === false) {
    throw Object.assign(new Error(payload?.error || "ดำเนินการไม่สำเร็จ"), {
      code: payload?.code,
      status: response.status
    });
  }
  return payload?.data ?? payload;
}

export function createDeliverySalesAdapter(apiFetch) {
  if (typeof apiFetch !== "function") throw new TypeError("apiFetch must be a function");
  const request = (path, init) => apiFetch(path, init).then(unwrap);
  const json = (method, body) => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  return {
    dashboard: (selectedDate) => request("/api/orders/dispatch-dashboard", json("POST", { selectedDate })),
    searchCustomers: (q) => request(`/api/customers/search?${query({ q })}`),
    saveCustomer: (customer) => request("/api/customers/upsert", json("POST", { customer })),
    deleteCustomer: (customerId) => request("/api/customers/delete", json("POST", { customerId })),
    customerHistory: (customerId) => request(`/api/customers/history?${query({ customerId })}`),
    searchOrders: (q, scope = "") => request(`/api/orders/search?${query({ q, scope })}`),
    getOrder: (id) => request(`/api/orders/search?${query({ id })}`),
    createOrder: (order) => request("/api/orders/create", json("POST", { order })),
    deleteOrder: (orderId) => request("/api/orders/delete", json("POST", { orderId })),
    workflow: (payload) => request("/api/orders/workflow", json("PATCH", payload)),
    assignChiangmaiRound: (orderId, roundCode) => request("/api/orders/chiangmai-rounds", json("PATCH", { orderId, roundCode })),
    completeChiangmaiOrders: (selectedIds) => request("/api/orders/chiangmai-complete", json("POST", { selectedIds })),
    rerouteOrder: (orderId, target, reason) => request("/api/orders/workflow", json("PATCH", { orderId, action: "reroute", target, reason }))
  };
}
