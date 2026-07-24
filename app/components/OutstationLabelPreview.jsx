import { paginateLabelItems } from "../../lib/outstationLabels";

function formatMoney(value) {
  return Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function SenderBlock({ item }) {
  const lines = Array.isArray(item.senderAddressLines) ? item.senderAddressLines : [];
  const lastLine = [lines[1], lines[2]].filter(Boolean).join(" · ");
  return (
    <div className="outstation-label-sender">
      <strong>{item.senderName}</strong>
      <span>{lines[0] || ""}</span>
      <span>{lastLine}</span>
    </div>
  );
}

function RecipientBlock({ item }) {
  return (
    <div className="outstation-label-recipient">
      <span className="outstation-label-recipient-heading">ผู้รับ</span>
      <strong>{item.recipientName}</strong>
      {(item.recipientAddressLines || []).map((line, index) => <span key={`${line}-${index}`}>{line}</span>)}
      {item.recipientPhone && <span className="outstation-label-phone">โทร. {item.recipientPhone}</span>}
    </div>
  );
}

function LabelItem({ item, onEditItem, index }) {
  return (
    <article className="outstation-label-item">
      <div className="outstation-label-top-row">
        <SenderBlock item={item} />
        <div className="outstation-label-shipping">
          {item.trackingCode && <span className="outstation-label-tracking">รหัสขนส่ง: {item.trackingCode}</span>}
          <strong className="outstation-label-carrier">{item.carrier}</strong>
          {item.codEnabled && (
            <div className="outstation-label-cod">
              <strong>COD {formatMoney(item.codAmount)} บาท</strong>
              {item.codDetail && <span>{item.codDetail}</span>}
            </div>
          )}
        </div>
      </div>
      <RecipientBlock item={item} />
      <div className="outstation-label-footer">
        <span className="outstation-label-note">{item.boxLabel === "1/1" ? "มีเอกสาร" : item.note || ""}</span>
        <strong className="outstation-label-box">{item.boxLabel}</strong>
      </div>
      {onEditItem && <button type="button" className="outstation-label-edit no-print" onClick={() => onEditItem(index)}>แก้ไขใบนี้</button>}
    </article>
  );
}

export default function OutstationLabelPreview({ items = [], onEditItem }) {
  const pages = paginateLabelItems(items);
  return (
    <section className="outstation-label-preview" aria-label="ตัวอย่างใบปะหน้าต่างจังหวัด">
      {pages.map((page, pageIndex) => (
        <div className="outstation-label-print-page" key={`page-${pageIndex}`} data-page={`${pageIndex + 1}/${pages.length}`}>
          {page.map((item, index) => {
            const currentIndex = (pageIndex * 5) + index;
            return <LabelItem key={`${item.orderId}-${item.boxIndex}-${currentIndex}`} item={item} index={currentIndex} onEditItem={onEditItem} />;
          })}
        </div>
      ))}
    </section>
  );
}
