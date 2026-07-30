"use client";

import { useMemo, useState } from "react";
import { buildChiangmaiRoundGroups, isReadyOrderWaitingForDispatch } from "../../lib/preparationWorkflow";

const ROUND_LABELS = {
  tuesday: "รอบวันอังคาร",
  wednesday: "รอบวันพุธ",
  friday: "รอบวันศุกร์"
};

export default function SalesRoundQueuePanel({ apiFetch, orders = [], onQueued }) {
  const groups = useMemo(() => buildChiangmaiRoundGroups(orders), [orders]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [submittingKey, setSubmittingKey] = useState("");
  const [message, setMessage] = useState("");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleOrder = (orderId) => {
    setSelectedIds((current) => current.includes(orderId)
      ? current.filter((id) => id !== orderId)
      : [...current, orderId]);
  };
  const toggleAllReady = (group) => {
    const allSelected = group.selectableIds.every((id) => selectedSet.has(id));
    setSelectedIds((current) => {
      const next = new Set(current);
      group.selectableIds.forEach((id) => allSelected ? next.delete(id) : next.add(id));
      return [...next];
    });
  };
  const queueSelected = async (group) => {
    const ids = group.selectableIds.filter((id) => selectedSet.has(id));
    if (!ids.length) return;
    if (typeof window !== "undefined" && !window.confirm(`ส่ง ${ids.length} ออเดอร์ของ ${ROUND_LABELS[group.roundCode]} วันที่ ${group.roundDate} เข้าคิวคนขับหรือไม่?`)) return;
    setSubmittingKey(group.key);
    setMessage("");
    try {
      const response = await apiFetch("/api/orders/chiangmai-rounds/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundCode: group.roundCode, roundDate: group.roundDate, selectedIds: ids })
      });
      const json = await response.json();
      if (!response.ok || !json?.ok) {
        const blocked = Array.isArray(json?.blockingOrderIds) ? ` (${json.blockingOrderIds.join(", ")})` : "";
        throw new Error(`${json?.error || "ส่งออเดอร์เข้าคิวไม่สำเร็จ"}${blocked}`);
      }
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
      setMessage(`ส่งเข้าคิวสำเร็จ ${json.data.count} ออเดอร์`);
      onQueued?.(ids, json.data);
    } catch (error) {
      setMessage(`เกิดข้อผิดพลาด: ${error?.message || error}`);
    } finally {
      setSubmittingKey("");
    }
  };

  return (
    <div className="sales-round-queue-panel">
      <p className="muted">เลือกเฉพาะออเดอร์ที่ห้องแพ็คตรวจครบแล้ว แล้วส่งเข้าคิวพร้อมกันได้</p>
      {message && <div className="sales-round-message" role="status">{message}</div>}
      {groups.length === 0 ? <p className="muted">ยังไม่มีออเดอร์ที่กำหนดรอบจัดส่ง</p> : (
        <div className="sales-round-groups">
          {groups.map((group, index) => {
            const selectedCount = group.selectableIds.filter((id) => selectedSet.has(id)).length;
            const allReadySelected = group.selectableIds.length > 0 && selectedCount === group.selectableIds.length;
            return (
              <details className="sales-round-group" key={group.key} open={index === 0}>
                <summary>
                  <span><b>{ROUND_LABELS[group.roundCode]}</b> · {group.roundDate}</span>
                  <span className="status-chip">พร้อม {group.ready}/{group.total}</span>
                </summary>
                <div className="sales-round-group-body">
                  <div className="sales-round-actions">
                    <button type="button" className="secondary" disabled={!group.selectableIds.length} onClick={() => toggleAllReady(group)}>
                      {allReadySelected ? "ยกเลิกเลือกทั้งหมด" : "เลือกทั้งหมดที่พร้อม"}
                    </button>
                    <span className="muted">เลือกแล้ว {selectedCount} ออเดอร์</span>
                  </div>
                  <div className="sales-round-order-list">
                    {group.orders.map((order) => {
                      const ready = isReadyOrderWaitingForDispatch(order);
                      return (
                        <label className={`sales-round-order ${ready ? "is-ready" : "is-blocked"}`} key={order.id}>
                          <input type="checkbox" disabled={!ready} checked={selectedSet.has(order.id)} onChange={() => toggleOrder(order.id)} />
                          <span>
                            <b>{order.id} · {order.customerName || "-"}</b>
                            <small>สร้างออเดอร์ {String(order.createdAt || "-").slice(0, 10)}</small>
                          </span>
                          <span className="sales-round-order-state">{ready ? "พร้อมเข้าคิว" : "ห้องแพ็คยังตรวจไม่ครบ"}</span>
                        </label>
                      );
                    })}
                  </div>
                  <button type="button" className="primary" disabled={!selectedCount || submittingKey === group.key} onClick={() => queueSelected(group)}>
                    {submittingKey === group.key ? "กำลังส่งเข้าคิว..." : `ส่งรายการที่เลือกเข้าคิว (${selectedCount})`}
                  </button>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
