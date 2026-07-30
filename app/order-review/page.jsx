"use client";

import { useEffect, useState } from "react";

const STAR_LABELS = ["แย่มาก", "ควรปรับปรุง", "พอใช้", "ดี", "ดีมาก"];

export default function OrderReviewPage() {
  const [token] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("t") || "");
  const [order, setOrder] = useState(null);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [status, setStatus] = useState(() => token ? "loading" : "error");
  const [message, setMessage] = useState(() => token ? "" : "ไม่พบ QR รีวิวของออเดอร์");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }
    fetch(`/api/public/order-review?t=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.ok) throw new Error(json?.error || "โหลดข้อมูลรีวิวไม่สำเร็จ");
        setOrder(json.data);
        if (json.data.latestReview) {
          setRating(json.data.latestReview.rating || 0);
          setFeedback(json.data.latestReview.feedback || "");
        }
        setStatus("ready");
      })
      .catch((error) => {
        setStatus("error");
        setMessage(error?.message || "โหลดข้อมูลรีวิวไม่สำเร็จ");
      });
  }, [token]);

  async function submitReview(event) {
    event.preventDefault();
    if (!rating || submitting) return;
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/public/order-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, rating, feedback })
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) throw new Error(json?.error || "บันทึกรีวิวไม่สำเร็จ");
      setOrder((previous) => ({ ...previous, latestReview: json.data.latestReview }));
      setStatus("submitted");
      setMessage("ขอบคุณสำหรับคะแนนและข้อเสนอแนะครับ");
    } catch (error) {
      setMessage(error?.message || "บันทึกรีวิวไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f0fdfc", padding: "24px 14px", display: "grid", placeItems: "start center" }}>
      <section className="panel" style={{ width: "min(520px, 100%)", marginTop: "5vh", display: "grid", gap: "16px", borderTop: "5px solid #176b6b" }}>
        <header style={{ display: "grid", gap: "4px" }}>
          <b style={{ color: "#176b6b", fontSize: "13px" }}>HILLKOFF DELIVERY</b>
          <h1 style={{ margin: 0, fontSize: "24px" }}>ประเมินการจัดส่ง</h1>
          {order && <span className="muted">ออเดอร์ {order.orderId} · คนขับ {order.driverName}</span>}
        </header>

        {status === "loading" && <p className="muted">กำลังโหลดแบบประเมิน…</p>}
        {status === "error" && <div style={{ background: "#fef2f2", color: "#991b1b", borderRadius: "8px", padding: "12px" }}>{message}</div>}

        {order && (status === "ready" || status === "submitted") && (
          <form onSubmit={submitReview} style={{ display: "grid", gap: "14px" }}>
            <div style={{ background: order.deliveryCompleteness === "incomplete" ? "#fff7ed" : "#f0fdfc", borderRadius: "8px", padding: "10px", fontSize: "13px" }}>
              {order.deliveryCompleteness === "incomplete" ? "ออเดอร์นี้ส่งไม่ครบ ลูกค้าสามารถรีวิวรอบนี้ได้ และรีวิวใหม่ได้อีกครั้งเมื่อส่งแก้ไข" : "กรุณาให้คะแนนการจัดส่งของออเดอร์นี้"}
            </div>
            <div>
              <span className="field-label">คะแนนดาว *</span>
              <div role="radiogroup" aria-label="คะแนนการจัดส่ง" style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
                {STAR_LABELS.map((label, index) => {
                  const value = index + 1;
                  return <button key={value} type="button" aria-label={`${value} ดาว ${label}`} aria-pressed={rating === value} onClick={() => setRating(value)} style={{ border: rating === value ? "2px solid #176b6b" : "1px solid #d1d5db", background: rating >= value ? "#fef3c7" : "white", color: "#b7791f", borderRadius: "8px", padding: "8px 10px", cursor: "pointer", fontSize: "21px" }}>★<small style={{ display: "block", fontSize: "10px", color: "#374151" }}>{value}</small></button>;
                })}
              </div>
            </div>
            <label style={{ display: "grid", gap: "6px" }}><span className="field-label">ข้อเสนอแนะ</span><textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} maxLength={2000} rows={5} placeholder="บอกเราได้เลยว่าการจัดส่งเป็นอย่างไร" /></label>
            <button className="primary wide" type="submit" disabled={!rating || submitting}>{submitting ? "กำลังบันทึก…" : status === "submitted" ? "บันทึกรีวิวใหม่" : "ส่งคะแนนและข้อเสนอแนะ"}</button>
            {message && <div role="status" style={{ color: message.startsWith("ขอบคุณ") ? "#166562" : "#991b1b", fontWeight: 700 }}>{message}</div>}
          </form>
        )}
      </section>
    </main>
  );
}
