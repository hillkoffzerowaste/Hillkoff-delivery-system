export const DEFAULT_CUSTOMER_DELIVERY_METHOD = "company_driver";

export function customerDefaultAppliesToTab(tab) {
  return tab === "sales";
}

export function customerDefaultDeliveryMethod(customer = {}) {
  return customer?.defaultDeliveryMethod === "outstation"
    ? "outstation"
    : DEFAULT_CUSTOMER_DELIVERY_METHOD;
}

export function applyCustomerDeliveryDefault(orderForm = {}, customer = {}) {
  const deliveryMethod = customerDefaultDeliveryMethod(customer);
  return {
    ...orderForm,
    deliveryMethod,
    workflowType: deliveryMethod === "outstation" ? "direct_pack" : orderForm.workflowType,
    shippingCarrier: deliveryMethod === "outstation" ? orderForm.shippingCarrier : "",
    shippingCarrierOther: deliveryMethod === "outstation" ? orderForm.shippingCarrierOther : "",
    chiangmaiRoundCode: deliveryMethod === "company_driver" ? orderForm.chiangmaiRoundCode : ""
  };
}

export function defaultDeliveryMethodFromLatestOrder(orders = []) {
  const latest = [...orders].sort((left, right) => {
    const leftAt = Date.parse(left?.updatedAt || left?.createdAt || left?.deliveredAt || 0) || 0;
    const rightAt = Date.parse(right?.updatedAt || right?.createdAt || right?.deliveredAt || 0) || 0;
    return rightAt - leftAt;
  })[0];
  return latest?.deliveryMethod === "outstation" ? "outstation" : DEFAULT_CUSTOMER_DELIVERY_METHOD;
}
