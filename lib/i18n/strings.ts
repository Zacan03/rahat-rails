export type Lang = "ur" | "en";

type Pair = { ur: string; en: string };

export const T = {
  stepNames: [
    { ur: "آپ کے بارے میں", en: "About you" },
    { ur: "گھر کی معلومات", en: "Household" },
    { ur: "ثبوت", en: "Proofs" },
    { ur: "جائزہ اور جمع کریں", en: "Review & submit" },
  ] as Pair[],
  stepInstructions: [
    { ur: "اپنا فرضی نام اور عمر بتائیں، پھر بیوہ ہونے کی تصدیق کریں۔", en: "Enter your synthetic name and age, then confirm whether you are a widow." },
    { ur: "گھر کے افراد، ماہانہ آمدنی اور ضلع کی معلومات دیں۔", en: "Tell us how many people are in your household, its monthly income, and your district." },
    { ur: "جو فرضی ثبوت آپ کے پاس ہیں انہیں منتخب کریں۔", en: "Select the synthetic proofs you have." },
    { ur: "اپنے جوابات دیکھیں۔ درست ہوں تو دعویٰ جمع کریں۔", en: "Review your answers. If they are correct, submit the claim." },
  ] as Pair[],
  readAloud: { ur: "سنیں", en: "Read aloud" },
  next: { ur: "آگے", en: "Next" },
  back: { ur: "پیچھے", en: "Back" },
  submit: { ur: "جمع کروائیں", en: "Submit claim" },
  name: { ur: "آپ کا نام (فرضی)", en: "Your name (synthetic)" },
  age: { ur: "عمر", en: "Age" },
  widow: { ur: "میں بیوہ ہوں", en: "I attest I am a widow" },
  household: { ur: "گھر کے افراد", en: "People in household" },
  income: { ur: "ماہانہ آمدنی (روپے)", en: "Monthly household income (PKR)" },
  district: { ur: "ضلع", en: "District" },
  proofDemoId: { ur: "فرضی شناختی ثبوت (DEMO_ID)", en: "Demo ID proof (DEMO_ID)" },
  proofWidow: { ur: "بیوگی کا بیان (WIDOWHOOD_ATTESTATION)", en: "Widowhood attestation" },
  namePrompt: { ur: "مثال: فرضی شہری", en: "Example: Demo Citizen" },
  agePrompt: { ur: "مثال: 35", en: "Example: 35" },
  widowPrompt: { ur: "تصدیق کے لیے نشان لگائیں۔", en: "Tick this box to confirm." },
  householdPrompt: { ur: "مثال: 4 افراد", en: "Example: 4 people" },
  incomePrompt: { ur: "مثال: 18000 روپے", en: "Example: 18000 rupees" },
  districtPrompt: { ur: "فرضی ضلع منتخب کریں۔", en: "Choose a synthetic district." },
  proofPrompt: { ur: "اگر یہ فرضی ثبوت آپ کے پاس ہے تو نشان لگائیں۔", en: "Tick if you have this synthetic proof." },
  required: { ur: "یہ خانہ ضروری ہے۔", en: "This field is required." },
  optional: { ur: "یہ خانہ اختیاری ہے۔", en: "This field is optional." },
  saved: { ur: "محفوظ ہو گیا", en: "Saved" },
  saving: { ur: "محفوظ ہو رہا ہے…", en: "Saving…" },
  retry: { ur: "دوبارہ کوشش کریں", en: "Retry" },
  waiting: { ur: "نیٹ ورک کا انتظار — دوبارہ کوشش ہوگی", en: "Waiting to sync" },
  demoAnswers: { ur: "فرضی جوابات بھریں", en: "Use demo answers" },
  disclaimer: {
    ur: "یہ صرف تجرباتی نمونہ ہے۔ فرضی ڈیٹا۔ کوئی اصل رقم نہیں۔",
    en: "Prototype only. Synthetic data. No real money.",
  },
} as const;

export const STATUS_LABEL: Record<string, Pair> = {
  DRAFT: { ur: "مسودہ", en: "Draft" },
  SUBMITTED: { ur: "جمع ہو گیا", en: "Submitted" },
  CHECKING: { ur: "جانچ جاری", en: "Checking" },
  MORE_PROOF: { ur: "مزید ثبوت درکار", en: "More proof needed" },
  OFFICER_REVIEW: { ur: "افسر کا جائزہ", en: "Officer review" },
  AUTO_APPROVED: { ur: "خودکار منظور", en: "Auto-approved" },
  OFFICER_APPROVED: { ur: "افسر نے منظور کیا", en: "Officer approved" },
  REJECTED: { ur: "مسترد", en: "Not approved" },
  MOCK_PAID: { ur: "فرضی ادائیگی مکمل", en: "Simulated payment done" },
  ESCALATED: { ur: "بالا افسر کو بھیجا", en: "Escalated" },
  CLOSED: { ur: "بند", en: "Closed" },
  CONSENT_WITHDRAWN: { ur: "رضامندی واپس", en: "Consent withdrawn" },
};
