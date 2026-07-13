export function normalizeCustomerSearch(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "").trim();
}

export function customerSearchTerms(customer) {
  const terms = new Set();
  [customer.name, customer.contact, customer.phone, customer.zone, customer.address].forEach((value) => {
    const text = normalizeCustomerSearch(value);
    for (let i = 3; i <= Math.min(text.length, 40); i += 1) terms.add(text.slice(0, i));
  });
  return Array.from(terms).slice(0, 200);
}

export function customerSearchRecord(customer) {
  return {
    name: String(customer.name || "").trim(), contact: String(customer.contact || "").trim(),
    phone: String(customer.phone || "").trim(), zone: String(customer.zone || "").trim(),
    address: String(customer.address || "").trim(), mapUrl: String(customer.mapUrl || "").trim(),
    terms: customerSearchTerms(customer), updatedAt: new Date().toISOString()
  };
}
