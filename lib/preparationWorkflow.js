export function isReadyOrderWaitingForDispatch(order) {
  const packReady = ["checked", "partial"].includes(String(order?.packStatus || ""));
  const waitingQueue = ["", "preparing", "ready"].includes(String(order?.queueStatus || ""));
  return packReady && waitingQueue && !order?.driverId;
}
