export function removeDriverPodPhoto(files = [], previews = [], index) {
  return {
    files: Array.from(files || []).filter((_, itemIndex) => itemIndex !== index),
    previews: Array.from(previews || []).filter((_, itemIndex) => itemIndex !== index)
  };
}

export function shouldShowDriverOrderReviewQr(order = {}) {
  return ["กำลังส่ง", "กำลังจัดส่ง"].includes(String(order?.status || ""))
    && String(order?.queueStatus || "queued") !== "completed";
}
