import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import type { Language } from "@familycradle/shared";

const resources = {
  id: {
    translation: {
      status: "Fondasi Tahap 1 sedang dibuat",
      language: "Pilih bahasa",
      eyebrow: "Jurnal bayi untuk seluruh keluarga",
      headline: "Lebih kompak, lebih tenang menjalani hari.",
      intro:
        "Catatan menyusu, tidur, popok, dan momen kecil lainnya dalam satu jurnal bersama untuk keluarga dan pengasuh.",
      learnMore: "Lihat yang sedang kami bangun",
      coming:
        "Fondasi aplikasi sedang disiapkan. Pembuatan keluarga dan pencatatan akan hadir berikutnya.",
      illustrationAlt: "Ilustrasi buaian bayi dengan selimut berwarna sage",
      illustrationCaption: "Satu keluarga, satu cerita bersama",
      sectionEyebrow: "Dibangun untuk hari-hari nyata",
      sectionTitle: "Hal-hal kecil, mudah diingat bersama.",
      sectionIntro:
        "FamilyCradle dirancang untuk membantu keluarga dan pengasuh saling terhubung, tanpa menambah keribetan.",
      featureMilkTitle: "Catatan harian",
      featureMilkBody:
        "Simpan catatan menyusu dan kebutuhan bayi dalam satu tempat.",
      featureSleepTitle: "Ritme si kecil",
      featureSleepBody:
        "Lihat waktu tidur dan rutinitas harian dengan lebih mudah.",
      featureFamilyTitle: "Berbagi sebagai keluarga",
      featureFamilyBody: "Orang tua dan pengasuh melihat catatan yang sama.",
      footer: "Dibuat dengan tenang dan penuh perhatian.",
      updateAvailable: "Versi baru tersedia.",
      reload: "Muat ulang",
    },
  },
  en: {
    translation: {
      status: "Phase 1 foundation in progress",
      language: "Choose language",
      eyebrow: "A baby journal for the whole family",
      headline: "A little more in sync. A little more at ease.",
      intro:
        "Feeding, sleep, diaper notes, and the little moments in one shared journal for your family and caregivers.",
      learnMore: "See what we are building",
      coming:
        "The app foundation is underway. Family setup and tracking are coming next.",
      illustrationAlt: "Illustration of a baby cradle with a sage blanket",
      illustrationCaption: "One family, one shared story",
      sectionEyebrow: "Made for real-life days",
      sectionTitle: "Little things, easier to remember together.",
      sectionIntro:
        "FamilyCradle is designed to help families and caregivers stay connected, without adding more to your plate.",
      featureMilkTitle: "Daily notes",
      featureMilkBody:
        "Keep feeding and baby-care notes together in one place.",
      featureSleepTitle: "Your baby’s rhythm",
      featureSleepBody: "See sleep times and daily routines more clearly.",
      featureFamilyTitle: "Shared as a family",
      featureFamilyBody:
        "Parents and caregivers see the same up-to-date notes.",
      footer: "Made with calm and care.",
      updateAvailable: "A new version is available.",
      reload: "Reload",
    },
  },
  mixed: {
    translation: {
      status: "Phase 1 foundation in progress",
      language: "Choose language",
      eyebrow: "A baby journal for the whole family",
      headline: "A little more in sync. A little more at ease.",
      intro:
        "Feeding, sleep, diaper notes, and the little moments in one shared journal for your family and caregivers.",
      learnMore: "See what we are building",
      coming:
        "The app foundation is underway. Family setup and tracking are coming next.",
      illustrationAlt: "Illustration of a baby cradle with a sage blanket",
      illustrationCaption: "One family, one shared story",
      sectionEyebrow: "Made for real-life days",
      sectionTitle: "Little things, easier to remember together.",
      sectionIntro:
        "FamilyCradle is designed to help families and caregivers stay connected, without adding more to your plate.",
      featureMilkTitle: "Daily notes",
      featureMilkBody:
        "Keep ASI, ASIP, and baby-care notes together in one place.",
      featureSleepTitle: "Your baby’s rhythm",
      featureSleepBody: "See sleep times and daily routines more clearly.",
      featureFamilyTitle: "Shared as a family",
      featureFamilyBody:
        "Bunda, Ayah, and caregivers see the same up-to-date notes.",
      footer: "Made with calm and care.",
      updateAvailable: "A new version is available.",
      reload: "Reload",
    },
  },
} satisfies Record<Language, { translation: Record<string, string> }>;

void i18n.use(initReactI18next).init({
  resources,
  lng: "id",
  fallbackLng: ["en"],
  supportedLngs: ["id", "en", "mixed"],
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
});

export default i18n;
