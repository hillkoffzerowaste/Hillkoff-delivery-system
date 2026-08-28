"use client";

import { useState } from "react";

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok"
  }).format(date);
}

export default function TrackPage() {
  const [phone, setPhone] = useState("");
  const [orderId, setOrderId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState(null);
  const [searched, setSearched] = useState(false);

  async function searchOrder(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setOrder(null);
    setSearched(true);

    try {
      const res = await fetch(`/api/public/track?orderId=${encodeURIComponent(orderId)}&phone=${encodeURIComponent(phone)}`);
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "ค้นหาไม่สำเร็จ");
      setOrder(json.data || null);
    } catch (e) {
      setError(e?.message || "ค้นหาไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="track-page">
      <section className="track-phone">
        <header className="track-brand">
          <img src="/delivery-logo.svg" alt="Hillkoff Delivery" />
          <span>Hillkoff<br />Delivery</span>
        </header>

        <div className="track-hero">
          <h1>เช็กสถานะส่งง่ายๆ</h1>
          <p>กรอกเลขออเดอร์และเบอร์โทรเพื่อยืนยันตัวตน</p>
        </div>

        <div className="track-map" aria-hidden="true">
          <span className="pin pin-store">●</span>
          <span className="pin pin-home">●</span>
          <span className="store">Hillkoff Store</span>
          <span className="home">Your Home</span>
          <div className="route-line" />
          <div className="truck">
            <span className="box" />
            <span className="cab" />
            <span className="wheel w1" />
            <span className="wheel w2" />
          </div>
        </div>

        <form onSubmit={searchOrder} className="track-form">
          <input
            value={orderId}
            onChange={(event) => setOrderId(event.target.value.trim())}
            autoComplete="off"
            placeholder="เลขออเดอร์"
            required
          />
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value.replace(/[^\d+\-\s]/g, ""))}
            inputMode="tel"
            autoComplete="tel"
            placeholder="กรอกเบอร์โทรศัพท์ของคุณที่นี่..."
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? "กำลังค้นหา..." : "ติดตามพัสดุ"}
          </button>
        </form>

        <p className="track-note">ตรวจสอบได้ตลอด 24 ชม.</p>

        {error && <div className="track-message error">{error}</div>}
        {!loading && searched && !error && !order && (
          <div className="track-message">ไม่พบออเดอร์ล่าสุดของเบอร์นี้</div>
        )}

        {order && (
          <section className="track-result">
            <div className={`status-pill ${order.status === "ส่งแล้ว" ? "done" : "active"}`}>
              {order.status}
            </div>
            <div>
              <span>เลขงาน</span>
              <strong>{order.orderId}</strong>
            </div>
            <div>
              <span>ผู้รับ</span>
              <strong>{order.customerName}</strong>
              {order.customerAddress && <small>{order.customerAddress}</small>}
            </div>
            <div>
              <span>คนขับ</span>
              <strong>{order.driverName}</strong>
              {order.driverPhone && <a href={`tel:${order.driverPhone}`}>{order.driverPhone}</a>}
            </div>
            <div>
              <span>รายการสินค้า</span>
              <ul>
                {order.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            {order.updatedAt && <footer>อัปเดตล่าสุด {formatDate(order.updatedAt)}</footer>}
          </section>
        )}
      </section>
    </main>
  );
}
