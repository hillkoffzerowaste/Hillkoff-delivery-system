export function normalizeCustomerSearch(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "").trim();
}

export function compactCustomerSearch(value) {
  return normalizeCustomerSearch(value).replace(/[-_.(),\/\\\\]+/g, "");
}

export function customerSearchTerms(customer) {
  const terms = new Set();
  [customer.name, customer.contact, customer.phone, customer.zone, customer.address].forEach((value) => {
    const text = normalizeCustomerSearch(value);
    for (let i = 3; i <= Math.min(text.length, 40); i += 1) terms.add(text.slice(0, i));
  });
  return Array.from(terms).slice(0, 200);
}

export function customerSearchKeys(customer) {
  const keys = new Set();
  [customer.name, customer.contact, customer.phone, customer.zone, customer.address].forEach((value) => {
    const text = compactCustomerSearch(value).slice(0, 180);
    for (let index = 0; index <= text.length - 3; index += 1) keys.add(text.slice(index, index + 3));
  });
  return Array.from(keys).slice(0, 200);
}

export function customerSearchRecord(customer) {
  const name = String(customer.name || "").trim();
  const phone = String(customer.phone || "").trim();
  return {
    name, nameKey: normalizeCustomerSearch(name), contact: String(customer.contact || "").trim(),
    phone, phoneDigits: phone.replace(/\D/g, ""), zone: String(customer.zone || "").trim(),
    address: String(customer.address || "").trim(), mapUrl: String(customer.mapUrl || "").trim(),
    terms: customerSearchTerms(customer), searchKeys: customerSearchKeys(customer), updatedAt: new Date().toISOString()
  };
}

export function resolveCustomerRecord(customer, indexedCustomer) {
  if (customer && String(customer.name || "").trim()) return customer;
  if (indexedCustomer && String(indexedCustomer.name || "").trim()) return indexedCustomer;
  return null;
}
