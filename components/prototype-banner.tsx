export function PrototypeBanner() {
  return (
    <div
      aria-label="Prototype disclaimer"
      className="border-b border-amber-300 bg-amber-100 px-4 py-3 text-center text-xs font-bold leading-5 text-amber-950 sm:text-sm"
      role="note"
    >
      <p>PROTOTYPE ONLY — MOCK DATA. NOT FOR REAL CITIZEN USE.</p>
      <p className="font-semibold">
        PROTOTYPE ONLY • SIMULATED DATA • NOT A GOVERNMENT SERVICE • NO REAL
        MONEY
      </p>
      <p dir="rtl" lang="ur">
        صرف نمونہ • فرضی ڈیٹا • سرکاری سروس نہیں • کوئی حقیقی رقم نہیں
      </p>
    </div>
  );
}
