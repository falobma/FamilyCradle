import type { createDatabase } from "../db/client.js";
import { milestoneDefinition, vaccineDefinition } from "../db/schema.js";

type Database = ReturnType<typeof createDatabase>["db"];

type VaccineDefinitionSeed = typeof vaccineDefinition.$inferInsert;
type MilestoneDefinitionSeed = typeof milestoneDefinition.$inferInsert;
const coreCategory: VaccineDefinitionSeed["category"] = "core";
const annualCategory: VaccineDefinitionSeed["category"] = "annual";
const optionalEndemicCategory: VaccineDefinitionSeed["category"] =
  "optional_endemic";

const vaccineDefinitions: VaccineDefinitionSeed[] = [
  {
    id: "idai2024_hepb_0",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "HEPB",
    doseLabelId: "Hepatitis B 0",
    doseLabelEn: "Hepatitis B 0",
    dueOffset: "P0D",
    windowEndOffset: "P7D",
    category: coreCategory,
    notesId: "Segera setelah lahir (< 24 jam), didahului vitamin K.",
    notesEn: "Soon after birth (< 24 hours), after vitamin K.",
  },
  {
    id: "idai2024_polio_0",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "POLIO",
    doseLabelId: "Polio 0 (bOPV)",
    doseLabelEn: "Polio 0 (bOPV)",
    dueOffset: "P0D",
    windowEndOffset: "P1M",
    category: coreCategory,
    notesId: "Saat lahir atau sebelum pulang.",
    notesEn: "At birth or before discharge.",
  },
  {
    id: "idai2024_bcg",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "BCG",
    doseLabelId: "BCG",
    doseLabelEn: "BCG",
    dueOffset: "P0D",
    windowEndOffset: "P1M",
    category: coreCategory,
    notesId: "Sebelum usia 1 bulan.",
    notesEn: "Before 1 month of age.",
  },
  {
    id: "idai2024_dtp_1",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "DTP",
    doseLabelId: "DTP 1",
    doseLabelEn: "DTP 1",
    dueOffset: "P2M",
    windowEndOffset: "P3M",
    category: coreCategory,
    comboHintId: "Dapat diberikan dalam vaksin kombinasi.",
    comboHintEn: "May be given as part of a combination vaccine.",
  },
  {
    id: "idai2024_hib_1",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "HIB",
    doseLabelId: "Hib 1",
    doseLabelEn: "Hib 1",
    dueOffset: "P2M",
    windowEndOffset: "P3M",
    category: coreCategory,
    notesId: "Dapat diberikan dalam vaksin kombinasi.",
    notesEn: "May be given as part of a combination vaccine.",
  },
  {
    id: "idai2024_hepb_1",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "HEPB",
    doseLabelId: "Hepatitis B 1",
    doseLabelEn: "Hepatitis B 1",
    dueOffset: "P2M",
    windowEndOffset: "P3M",
    category: coreCategory,
    notesId: "Dapat diberikan dalam vaksin kombinasi.",
    notesEn: "May be given as part of a combination vaccine.",
  },
  {
    id: "idai2024_polio_1",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "POLIO",
    doseLabelId: "Polio 1",
    doseLabelEn: "Polio 1",
    dueOffset: "P2M",
    windowEndOffset: "P3M",
    category: coreCategory,
  },
  {
    id: "idai2024_pcv_1",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "PCV",
    doseLabelId: "PCV 1",
    doseLabelEn: "PCV 1",
    dueOffset: "P2M",
    windowEndOffset: "P3M",
    category: coreCategory,
  },
  {
    id: "idai2024_rota_1_rv1",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "ROTA",
    doseLabelId: "Rotavirus 1",
    doseLabelEn: "Rotavirus 1",
    dueOffset: "P2M",
    windowEndOffset: "P3M",
    category: coreCategory,
    optionGroup: "ROTA_PRODUCT",
    optionValue: "RV1",
  },
  {
    id: "idai2024_rota_2_rv1",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "ROTA",
    doseLabelId: "Rotavirus 2",
    doseLabelEn: "Rotavirus 2",
    dueOffset: "P4M",
    windowEndOffset: "P24W",
    category: coreCategory,
    optionGroup: "ROTA_PRODUCT",
    optionValue: "RV1",
    notesId: "Batas usia maksimal dosis terakhir perlu dikonfirmasi.",
    notesEn: "Maximum age for the final dose requires confirmation.",
  },
  {
    id: "idai2024_rota_1_rv5",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "ROTA",
    doseLabelId: "Rotavirus 1",
    doseLabelEn: "Rotavirus 1",
    dueOffset: "P2M",
    windowEndOffset: "P3M",
    category: coreCategory,
    optionGroup: "ROTA_PRODUCT",
    optionValue: "RV5",
  },
  {
    id: "idai2024_rota_2_rv5",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "ROTA",
    doseLabelId: "Rotavirus 2",
    doseLabelEn: "Rotavirus 2",
    dueOffset: "P4M",
    windowEndOffset: "P5M",
    category: coreCategory,
    optionGroup: "ROTA_PRODUCT",
    optionValue: "RV5",
  },
  {
    id: "idai2024_rota_3_rv5",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "ROTA",
    doseLabelId: "Rotavirus 3",
    doseLabelEn: "Rotavirus 3",
    dueOffset: "P6M",
    windowEndOffset: "P32W",
    category: coreCategory,
    optionGroup: "ROTA_PRODUCT",
    optionValue: "RV5",
    notesId: "Batas usia maksimal dosis terakhir perlu dikonfirmasi.",
    notesEn: "Maximum age for the final dose requires confirmation.",
  },
  ...(["DTP", "HIB", "HEPB", "POLIO"] as const).map((vaccineCode) => ({
    id: `idai2024_${vaccineCode.toLowerCase()}_2_234`,
    scheduleVersion: "IDAI-2024",
    vaccineCode,
    doseLabelId: `${vaccineCode} 2`,
    doseLabelEn: `${vaccineCode} 2`,
    dueOffset: "P3M",
    windowEndOffset: "P4M",
    category: coreCategory,
    optionGroup: "DTP_SCHEDULE",
    optionValue: "2-3-4",
    notesId:
      vaccineCode === "DTP"
        ? "Jadwal alternatif 2-3-4."
        : "Mengikuti jadwal DTP 2-3-4.",
    notesEn:
      vaccineCode === "DTP"
        ? "Alternative 2-3-4 schedule."
        : "Follows the DTP 2-3-4 schedule.",
  })),
  ...(["DTP", "HIB", "HEPB", "POLIO"] as const).map((vaccineCode) => ({
    id: `idai2024_${vaccineCode.toLowerCase()}_3_234`,
    scheduleVersion: "IDAI-2024",
    vaccineCode,
    doseLabelId: `${vaccineCode} 3`,
    doseLabelEn: `${vaccineCode} 3`,
    dueOffset: "P4M",
    windowEndOffset: "P5M",
    category: coreCategory,
    optionGroup: "DTP_SCHEDULE",
    optionValue: "2-3-4",
    notesId:
      vaccineCode === "DTP"
        ? "Jadwal alternatif 2-3-4."
        : "Mengikuti jadwal DTP 2-3-4.",
    notesEn:
      vaccineCode === "DTP"
        ? "Alternative 2-3-4 schedule."
        : "Follows the DTP 2-3-4 schedule.",
  })),
  ...(["DTP", "HIB", "HEPB", "POLIO"] as const).map((vaccineCode) => ({
    id: `idai2024_${vaccineCode.toLowerCase()}_2_246`,
    scheduleVersion: "IDAI-2024",
    vaccineCode,
    doseLabelId: `${vaccineCode} 2`,
    doseLabelEn: `${vaccineCode} 2`,
    dueOffset: "P4M",
    windowEndOffset: "P5M",
    category: coreCategory,
    optionGroup: "DTP_SCHEDULE",
    optionValue: "2-4-6",
    notesId:
      vaccineCode === "DTP"
        ? "Jadwal alternatif 2-4-6."
        : "Mengikuti jadwal DTP 2-4-6.",
    notesEn:
      vaccineCode === "DTP"
        ? "Alternative 2-4-6 schedule."
        : "Follows the DTP 2-4-6 schedule.",
  })),
  ...(["DTP", "HIB", "HEPB", "POLIO"] as const).map((vaccineCode) => ({
    id: `idai2024_${vaccineCode.toLowerCase()}_3_246`,
    scheduleVersion: "IDAI-2024",
    vaccineCode,
    doseLabelId: `${vaccineCode} 3`,
    doseLabelEn: `${vaccineCode} 3`,
    dueOffset: "P6M",
    windowEndOffset: "P7M",
    category: coreCategory,
    optionGroup: "DTP_SCHEDULE",
    optionValue: "2-4-6",
    notesId:
      vaccineCode === "DTP"
        ? "Jadwal alternatif 2-4-6."
        : "Mengikuti jadwal DTP 2-4-6.",
    notesEn:
      vaccineCode === "DTP"
        ? "Alternative 2-4-6 schedule."
        : "Follows the DTP 2-4-6 schedule.",
  })),
  {
    id: "idai2024_ipv_1",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "IPV",
    doseLabelId: "IPV 1",
    doseLabelEn: "IPV 1",
    dueOffset: "P4M",
    windowEndOffset: "P5M",
    category: coreCategory,
    notesId: "Sesuai panduan Kemenkes; dapat dalam vaksin heksavalen.",
    notesEn: "Per Ministry of Health guidance; may be in a hexavalent vaccine.",
  },
  {
    id: "idai2024_pcv_2",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "PCV",
    doseLabelId: "PCV 2",
    doseLabelEn: "PCV 2",
    dueOffset: "P4M",
    windowEndOffset: "P5M",
    category: coreCategory,
  },
  {
    id: "idai2024_pcv_3",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "PCV",
    doseLabelId: "PCV 3",
    doseLabelEn: "PCV 3",
    dueOffset: "P6M",
    windowEndOffset: "P7M",
    category: coreCategory,
  },
  {
    id: "idai2024_flu_1",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "INFLUENZA",
    doseLabelId: "Influenza 1",
    doseLabelEn: "Influenza 1",
    dueOffset: "P6M",
    windowEndOffset: "P7M",
    category: annualCategory,
    notesId: "Dosis pertama.",
    notesEn: "First dose.",
  },
  {
    id: "idai2024_flu_2",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "INFLUENZA",
    doseLabelId: "Influenza 2",
    doseLabelEn: "Influenza 2",
    dueOffset: "P7M",
    windowEndOffset: "P8M",
    category: annualCategory,
    notesId: "Minimal 4 minggu setelah dosis pertama.",
    notesEn: "At least 4 weeks after the first dose.",
  },
  {
    id: "idai2024_mr_1",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "MR",
    doseLabelId: "MR 1",
    doseLabelEn: "MR 1",
    dueOffset: "P9M",
    windowEndOffset: "P12M",
    category: coreCategory,
  },
  {
    id: "idai2024_ipv_2",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "IPV",
    doseLabelId: "IPV 2",
    doseLabelEn: "IPV 2",
    dueOffset: "P9M",
    windowEndOffset: "P10M",
    category: coreCategory,
    notesId: "Sesuai panduan Kemenkes.",
    notesEn: "Per Ministry of Health guidance.",
  },
  {
    id: "idai2024_je_1",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "JE",
    doseLabelId: "Japanese Encephalitis 1",
    doseLabelEn: "Japanese Encephalitis 1",
    dueOffset: "P9M",
    windowEndOffset: "P12M",
    category: optionalEndemicCategory,
    notesId: "Sesuai daerah endemis atau rencana bepergian.",
    notesEn: "For endemic areas or planned travel.",
  },
  {
    id: "idai2024_pcv_4",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "PCV",
    doseLabelId: "PCV 4 (booster)",
    doseLabelEn: "PCV 4 (booster)",
    dueOffset: "P12M",
    windowEndOffset: "P15M",
    category: coreCategory,
    notesId: "Booster usia 12–15 bulan.",
    notesEn: "Booster at 12–15 months.",
  },
  {
    id: "idai2024_var_1",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "VARICELLA",
    doseLabelId: "Varisela 1",
    doseLabelEn: "Varicella 1",
    dueOffset: "P12M",
    windowEndOffset: "P15M",
    category: coreCategory,
  },
  {
    id: "idai2024_hepa_1",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "HEPA",
    doseLabelId: "Hepatitis A 1",
    doseLabelEn: "Hepatitis A 1",
    dueOffset: "P12M",
    windowEndOffset: "P15M",
    category: coreCategory,
  },
  {
    id: "idai2024_var_2",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "VARICELLA",
    doseLabelId: "Varisela 2",
    doseLabelEn: "Varicella 2",
    dueOffset: "P14M",
    windowEndOffset: "P18M",
    category: coreCategory,
  },
  {
    id: "idai2024_dtp_4",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "DTP",
    doseLabelId: "DTP 4 (booster)",
    doseLabelEn: "DTP 4 (booster)",
    dueOffset: "P18M",
    windowEndOffset: "P24M",
    category: coreCategory,
  },
  {
    id: "idai2024_hib_4",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "HIB",
    doseLabelId: "Hib 4 (booster)",
    doseLabelEn: "Hib 4 (booster)",
    dueOffset: "P18M",
    windowEndOffset: "P24M",
    category: coreCategory,
  },
  {
    id: "idai2024_hepb_4",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "HEPB",
    doseLabelId: "Hepatitis B 4",
    doseLabelEn: "Hepatitis B 4",
    dueOffset: "P18M",
    windowEndOffset: "P24M",
    category: coreCategory,
  },
  {
    id: "idai2024_polio_4",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "POLIO",
    doseLabelId: "Polio 4",
    doseLabelEn: "Polio 4",
    dueOffset: "P18M",
    windowEndOffset: "P24M",
    category: coreCategory,
  },
  {
    id: "idai2024_mmr_1",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "MMR",
    doseLabelId: "MMR 1 / lanjutan MR",
    doseLabelEn: "MMR 1 / MR follow-up",
    dueOffset: "P18M",
    windowEndOffset: "P24M",
    category: coreCategory,
    notesId: "Usia tepat perlu dikonfirmasi dengan rekomendasi IDAI.",
    notesEn: "Exact age requires confirmation against IDAI guidance.",
  },
  {
    id: "idai2024_hepa_2",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "HEPA",
    doseLabelId: "Hepatitis A 2",
    doseLabelEn: "Hepatitis A 2",
    dueOffset: "P18M",
    windowEndOffset: "P24M",
    category: coreCategory,
    notesId: "6–12 bulan setelah dosis pertama.",
    notesEn: "6–12 months after the first dose.",
  },
  {
    id: "idai2024_flu_annual_1",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "INFLUENZA",
    doseLabelId: "Influenza tahunan",
    doseLabelEn: "Annual influenza",
    dueOffset: "P19M",
    windowEndOffset: "P24M",
    category: annualCategory,
    notesId: "Ulangan tiap tahun.",
    notesEn: "Repeat annually.",
  },
  {
    id: "idai2024_je_2",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "JE",
    doseLabelId: "Japanese Encephalitis 2",
    doseLabelEn: "Japanese Encephalitis 2",
    dueOffset: "P24M",
    windowEndOffset: "P27M",
    category: optionalEndemicCategory,
    notesId: "Sesuai daerah endemis atau rencana bepergian.",
    notesEn: "For endemic areas or planned travel.",
  },
  {
    id: "idai2024_typhoid_1",
    scheduleVersion: "IDAI-2024",
    vaccineCode: "TYPHOID",
    doseLabelId: "Tifoid 1",
    doseLabelEn: "Typhoid 1",
    dueOffset: "P24M",
    windowEndOffset: "P27M",
    category: coreCategory,
    notesId: "Ulangan mengikuti anjuran dokter.",
    notesEn: "Repeat as advised by the clinician.",
  },
];

type MilestoneDomain =
  | "social_emotional"
  | "language_communication"
  | "cognitive"
  | "movement_physical";

type MilestoneDraft = {
  id: string;
  ageMonths: number;
  domain: MilestoneDomain;
  textId: string;
  textEn: string;
  sortOrder: number;
  source: string;
  sourceUrl: string;
};

function milestoneGroup(
  ageMonths: number,
  slug: string,
  domain: MilestoneDomain,
  entries: Array<[string, string]>,
): MilestoneDraft[] {
  return entries.map(([textId, textEn], index) => ({
    id: `cdc_draft_${String(ageMonths).padStart(2, "0")}_${domain}_${index + 1}`,
    ageMonths,
    domain,
    textId,
    textEn,
    sortOrder: index,
    source: "CDC-2022, revision unverified",
    sourceUrl: `https://www.cdc.gov/act-early/milestones/${slug}.html`,
  }));
}

// Provisional paraphrases from CDC age pages; version confirmation and Indonesian review remain open.
const milestoneDefinitions: MilestoneDefinitionSeed[] = [
  ...milestoneGroup(2, "2-months", "social_emotional", [
    [
      "Lebih tenang saat diajak bicara atau digendong.",
      "Settles more readily when spoken to or picked up.",
    ],
    [
      "Menatap wajah orang yang dekat dengannya.",
      "Looks at the face of a familiar person.",
    ],
    [
      "Tampak senang saat pengasuh mendekat.",
      "Shows pleasure when a caregiver comes near.",
    ],
    [
      "Tersenyum ketika diajak bicara atau diberi senyuman.",
      "Smiles in response to talking or a smile.",
    ],
  ]),
  ...milestoneGroup(2, "2-months", "language_communication", [
    ["Mengeluarkan suara selain menangis.", "Makes sounds other than crying."],
    ["Bereaksi terhadap suara keras.", "Reacts to a loud sound."],
  ]),
  ...milestoneGroup(2, "2-months", "cognitive", [
    [
      "Mengikuti orang yang bergerak dengan pandangan.",
      "Watches a person moving nearby.",
    ],
    [
      "Memperhatikan mainan selama beberapa detik.",
      "Looks at a toy for several seconds.",
    ],
  ]),
  ...milestoneGroup(2, "2-months", "movement_physical", [
    ["Mengangkat kepala saat tengkurap.", "Lifts the head while on the tummy."],
    [
      "Menggerakkan kedua lengan dan kedua kaki.",
      "Moves both arms and both legs.",
    ],
    ["Membuka tangan sebentar.", "Briefly opens the hands."],
  ]),
  ...milestoneGroup(4, "4-months", "social_emotional", [
    [
      "Tersenyum sendiri untuk menarik perhatian.",
      "Smiles to get another person's attention.",
    ],
    [
      "Terkekeh saat diajak bercanda.",
      "Chuckles when someone tries to make the child laugh.",
    ],
    [
      "Bergerak atau bersuara untuk menjaga perhatian orang lain.",
      "Moves or makes sounds to keep someone's attention.",
    ],
  ]),
  ...milestoneGroup(4, "4-months", "language_communication", [
    [
      "Mengeluarkan suara vokal seperti 'uuu' atau 'aaah'.",
      "Makes vowel-like cooing sounds.",
    ],
    [
      "Membalas dengan suara saat diajak bicara.",
      "Makes sounds back during a conversation.",
    ],
    [
      "Menoleh ke arah suara orang yang dikenal.",
      "Turns toward a familiar voice.",
    ],
  ]),
  ...milestoneGroup(4, "4-months", "cognitive", [
    [
      "Membuka mulut saat melihat botol atau payudara ketika lapar.",
      "Opens the mouth when seeing a bottle or breast while hungry.",
    ],
    [
      "Memperhatikan tangannya sendiri dengan rasa ingin tahu.",
      "Looks at the hands with interest.",
    ],
  ]),
  ...milestoneGroup(4, "4-months", "movement_physical", [
    [
      "Menahan kepala stabil saat digendong.",
      "Keeps the head steady when held.",
    ],
    [
      "Menggenggam mainan yang diletakkan di tangannya.",
      "Holds a toy placed in the hand.",
    ],
    ["Mengayunkan lengan ke arah mainan.", "Swings an arm toward a toy."],
    ["Membawa tangan ke mulut.", "Brings the hands to the mouth."],
    [
      "Mendorong tubuh bertumpu pada siku saat tengkurap.",
      "Pushes up on the elbows or forearms while on the tummy.",
    ],
  ]),
  ...milestoneGroup(6, "6-months", "social_emotional", [
    ["Mengenali orang yang akrab.", "Recognizes familiar people."],
    [
      "Senang melihat diri di cermin.",
      "Enjoys looking at the reflection in a mirror.",
    ],
    ["Tertawa.", "Laughs."],
  ]),
  ...milestoneGroup(6, "6-months", "language_communication", [
    [
      "Bergantian membuat suara saat berinteraksi.",
      "Takes turns making sounds with someone.",
    ],
    [
      "Meniup suara dengan lidah dan bibir.",
      "Blows raspberries with the tongue and lips.",
    ],
    ["Mengeluarkan suara melengking.", "Makes squealing sounds."],
  ]),
  ...milestoneGroup(6, "6-months", "cognitive", [
    [
      "Memasukkan benda aman ke mulut untuk menjelajahinya.",
      "Explores safe objects by bringing them to the mouth.",
    ],
    ["Meraih mainan yang diinginkan.", "Reaches for a wanted toy."],
    [
      "Menutup bibir untuk menunjukkan tidak ingin makan lagi.",
      "Closes the lips to show that no more food is wanted.",
    ],
  ]),
  ...milestoneGroup(6, "6-months", "movement_physical", [
    [
      "Berguling dari tengkurap ke telentang.",
      "Rolls from the tummy to the back.",
    ],
    [
      "Mendorong tubuh dengan lengan lurus saat tengkurap.",
      "Pushes up on straight arms while on the tummy.",
    ],
    [
      "Bertumpu pada tangan saat belajar duduk.",
      "Leans on the hands for support while sitting.",
    ],
  ]),
  ...milestoneGroup(9, "9-months", "social_emotional", [
    [
      "Tampak malu, lengket, atau takut di sekitar orang asing.",
      "Shows shyness, clinginess, or fear around strangers.",
    ],
    [
      "Menunjukkan beragam ekspresi wajah.",
      "Uses several different facial expressions.",
    ],
    ["Menoleh saat namanya dipanggil.", "Looks when called by name."],
    ["Bereaksi ketika pengasuh pergi.", "Reacts when a caregiver leaves."],
    [
      "Tersenyum atau tertawa saat bermain cilukba.",
      "Smiles or laughs during peek-a-boo.",
    ],
  ]),
  ...milestoneGroup(9, "9-months", "language_communication", [
    [
      "Membuat banyak rangkaian suara, seperti 'mamama' atau 'bababa'.",
      "Makes varied sound strings such as repeated syllables.",
    ],
    [
      "Mengangkat lengan untuk minta digendong.",
      "Raises the arms to be picked up.",
    ],
  ]),
  ...milestoneGroup(9, "9-months", "cognitive", [
    [
      "Mencari benda yang jatuh atau tidak terlihat.",
      "Looks for an object that has dropped out of sight.",
    ],
    ["Membenturkan dua benda satu sama lain.", "Bangs two objects together."],
  ]),
  ...milestoneGroup(9, "9-months", "movement_physical", [
    ["Berpindah ke posisi duduk sendiri.", "Moves into a sitting position."],
    [
      "Memindahkan benda dari satu tangan ke tangan lain.",
      "Moves an object from one hand to the other.",
    ],
    [
      "Mengais makanan dengan jari untuk mendekatkannya.",
      "Rakes food closer with the fingers.",
    ],
    ["Duduk tanpa bantuan.", "Sits without support."],
  ]),
  ...milestoneGroup(12, "1-year", "social_emotional", [
    [
      "Bermain permainan bergiliran bersama, seperti tepuk tangan.",
      "Plays an interactive game such as pat-a-cake.",
    ],
  ]),
  ...milestoneGroup(12, "1-year", "language_communication", [
    ["Melambaikan tangan untuk berpamitan.", "Waves to say goodbye."],
    [
      "Memanggil orang tua dengan nama khusus seperti mama atau dada.",
      "Uses a special name for a parent, such as mama or dada.",
    ],
    [
      "Berhenti sebentar atau menghentikan tindakan saat mendengar 'tidak'.",
      "Pauses or stops briefly when hearing 'no'.",
    ],
  ]),
  ...milestoneGroup(12, "1-year", "cognitive", [
    ["Memasukkan benda ke wadah.", "Puts an object into a container."],
    [
      "Mencari benda yang dilihat disembunyikan.",
      "Looks for an object seen being hidden.",
    ],
  ]),
  ...milestoneGroup(12, "1-year", "movement_physical", [
    ["Menarik tubuh hingga berdiri.", "Pulls up to stand."],
    [
      "Berjalan sambil berpegangan pada perabot.",
      "Walks while holding furniture.",
    ],
    [
      "Minum dari cangkir terbuka yang dipegang orang dewasa.",
      "Drinks from an open cup held by an adult.",
    ],
    [
      "Mengambil benda kecil dengan ibu jari dan telunjuk.",
      "Picks up small items using the thumb and index finger.",
    ],
  ]),
  ...milestoneGroup(15, "15-months", "social_emotional", [
    ["Meniru anak lain saat bermain.", "Copies another child during play."],
    [
      "Menunjukkan benda yang disukai kepada orang lain.",
      "Shows another person an object of interest.",
    ],
    ["Bertepuk tangan saat bersemangat.", "Claps when excited."],
    ["Memeluk boneka atau mainan.", "Hugs a doll or another toy."],
    [
      "Menunjukkan kasih sayang melalui pelukan atau ciuman.",
      "Shows affection with a hug, cuddle, or kiss.",
    ],
  ]),
  ...milestoneGroup(15, "15-months", "language_communication", [
    [
      "Mencoba mengucapkan satu atau dua kata selain mama atau dada.",
      "Tries one or two words beyond mama or dada.",
    ],
    [
      "Melihat benda yang dikenal saat namanya disebut.",
      "Looks at a familiar object when it is named.",
    ],
    [
      "Mengikuti arahan sederhana yang disertai gerakan dan kata-kata.",
      "Follows a simple direction paired with a gesture and words.",
    ],
    [
      "Menunjuk untuk meminta sesuatu atau mencari bantuan.",
      "Points to ask for something or get help.",
    ],
  ]),
  ...milestoneGroup(15, "15-months", "cognitive", [
    [
      "Mencoba menggunakan benda sesuai kegunaannya.",
      "Tries to use familiar objects for their usual purpose.",
    ],
    [
      "Menyusun sedikitnya dua benda kecil.",
      "Stacks at least two small objects.",
    ],
  ]),
  ...milestoneGroup(15, "15-months", "movement_physical", [
    ["Melangkah beberapa langkah sendiri.", "Takes a few steps independently."],
    [
      "Menggunakan jari untuk mengambil dan memakan makanan.",
      "Uses fingers to pick up and eat some food.",
    ],
  ]),
  ...milestoneGroup(18, "18-months", "social_emotional", [
    [
      "Menjauh sebentar tetapi memastikan pengasuh tetap dekat.",
      "Moves away briefly while checking that a caregiver is nearby.",
    ],
    [
      "Menunjuk untuk berbagi hal yang menarik.",
      "Points to share something interesting.",
    ],
    [
      "Mengulurkan tangan saat akan dicuci.",
      "Holds out the hands to be washed.",
    ],
    [
      "Melihat beberapa halaman buku bersama orang lain.",
      "Looks through a few pages of a book with someone.",
    ],
    [
      "Membantu berpakaian dengan menggerakkan lengan atau kaki.",
      "Helps with dressing by moving an arm or foot.",
    ],
  ]),
  ...milestoneGroup(18, "18-months", "language_communication", [
    [
      "Mencoba mengucapkan tiga kata atau lebih selain mama atau dada.",
      "Tries three or more words beyond mama or dada.",
    ],
    [
      "Mengikuti arahan satu langkah tanpa gerakan tambahan.",
      "Follows a one-step direction without an accompanying gesture.",
    ],
  ]),
  ...milestoneGroup(18, "18-months", "cognitive", [
    [
      "Meniru kegiatan rumah sederhana, seperti menyapu.",
      "Copies a simple household activity such as sweeping.",
    ],
    ["Memainkan mainan dengan cara sederhana.", "Uses a toy in a simple way."],
  ]),
  ...milestoneGroup(18, "18-months", "movement_physical", [
    ["Berjalan tanpa berpegangan.", "Walks without holding on."],
    ["Membuat coretan.", "Scribbles."],
    [
      "Minum dari cangkir terbuka meski kadang tumpah.",
      "Drinks from an open cup, sometimes spilling.",
    ],
    ["Makan sendiri menggunakan jari.", "Feeds themself using fingers."],
    ["Mencoba menggunakan sendok.", "Tries to use a spoon."],
    [
      "Naik dan turun dari kursi atau sofa tanpa bantuan.",
      "Gets on and off a chair or couch without help.",
    ],
  ]),
  ...milestoneGroup(24, "2-years", "social_emotional", [
    [
      "Memperhatikan saat orang lain terluka atau sedih.",
      "Notices when another person is hurt or upset.",
    ],
    [
      "Melihat wajah pengasuh untuk memahami situasi baru.",
      "Looks at a caregiver's face to interpret a new situation.",
    ],
  ]),
  ...milestoneGroup(24, "2-years", "language_communication", [
    [
      "Menunjuk gambar dalam buku saat diminta.",
      "Points to a picture in a book when asked.",
    ],
    ["Menggabungkan sedikitnya dua kata.", "Combines at least two words."],
    [
      "Menunjuk sedikitnya dua bagian tubuh saat diminta.",
      "Points to at least two body parts when asked.",
    ],
    [
      "Menggunakan gerakan selain melambaikan atau menunjuk.",
      "Uses gestures beyond waving or pointing.",
    ],
  ]),
  ...milestoneGroup(24, "2-years", "cognitive", [
    [
      "Memegang benda dengan satu tangan sambil memakai tangan lain.",
      "Holds an object in one hand while using the other.",
    ],
    [
      "Mencoba tombol, sakelar, atau kenop pada mainan.",
      "Tries buttons, switches, or knobs on a toy.",
    ],
    [
      "Bermain dengan lebih dari satu mainan sekaligus.",
      "Plays with more than one toy at the same time.",
    ],
  ]),
  ...milestoneGroup(24, "2-years", "movement_physical", [
    ["Menendang bola.", "Kicks a ball."],
    ["Berlari.", "Runs."],
    ["Berjalan menaiki beberapa anak tangga.", "Walks up a few steps."],
    ["Makan menggunakan sendok.", "Eats with a spoon."],
  ]),
];

function inChunks<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

const seedPromises = new WeakMap<object, Promise<void>>();

export function ensureHealthDefinitions(database: Database): Promise<void> {
  const existing = seedPromises.get(database);
  if (existing) return existing;

  const pending = database.transaction(async (transaction) => {
    for (const chunk of inChunks(vaccineDefinitions, 40)) {
      await transaction
        .insert(vaccineDefinition)
        .values(chunk)
        .onConflictDoNothing();
    }
    for (const chunk of inChunks(milestoneDefinitions, 40)) {
      await transaction
        .insert(milestoneDefinition)
        .values(chunk)
        .onConflictDoNothing();
    }
  });
  seedPromises.set(database, pending);
  void pending.catch(() => seedPromises.delete(database));
  return pending;
}
