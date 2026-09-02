import {
  STAFF_TEST_PRACTICE_PASSING_SCORE,
  STAFF_TEST_PRACTICE_QUESTIONS,
} from "@/data/staffTestPracticeQuestions";
import {
  STAFF_TEST_THEORY_PASSING_SCORE,
  STAFF_TEST_THEORY_QUESTIONS,
} from "@/data/staffTestTheoryQuestions";
import type { StaffTestId, StaffTestQuestion } from "@/data/staffTestTypes";
import {
  STAFF_TEST_PATH,
  STAFF_TEST_PRACTICE_PATH,
  STAFF_TEST_THEORY_PATH,
} from "@/lib/routes";

export type StaffTestDefinition = {
  id: StaffTestId;
  path: string;
  questions: StaffTestQuestion[];
  passingScore: number;
  pdfSlug: string;
  titleKey: string;
  subtitleKey: string;
  modeLineKey: string;
  instructionKey: string;
  metaTitleKey: string;
  pdfTitleRu: string;
  pdfTitleVn: string;
  pdfSubtitleRu: string;
  pdfSubtitleVn: string;
};

export const STAFF_TEST_DEFINITIONS: StaffTestDefinition[] = [
  {
    id: "theory",
    path: STAFF_TEST_THEORY_PATH,
    questions: STAFF_TEST_THEORY_QUESTIONS,
    passingScore: STAFF_TEST_THEORY_PASSING_SCORE,
    pdfSlug: "Theory",
    titleKey: "staff_test_theory_title",
    subtitleKey: "staff_test_theory_subtitle",
    modeLineKey: "staff_test_theory_mode_line",
    instructionKey: "staff_test_theory_instruction",
    metaTitleKey: "staff_test_theory_meta_title",
    pdfTitleRu: "GASTROFOOD — Тест: Теория",
    pdfTitleVn: "GASTROFOOD — Bài kiểm tra: Lý thuyết",
    pdfSubtitleRu:
      "Правила заказов, хранение, приготовление, состав блюд и упаковка",
    pdfSubtitleVn:
      "Quy trình đơn hàng, bảo quản, chế biến, thành phần món và đóng gói",
  },
  {
    id: "practice",
    path: STAFF_TEST_PRACTICE_PATH,
    questions: STAFF_TEST_PRACTICE_QUESTIONS,
    passingScore: STAFF_TEST_PRACTICE_PASSING_SCORE,
    pdfSlug: "Practice",
    titleKey: "staff_test_practice_title",
    subtitleKey: "staff_test_practice_subtitle",
    modeLineKey: "staff_test_practice_mode_line",
    instructionKey: "staff_test_practice_instruction",
    metaTitleKey: "staff_test_practice_meta_title",
    pdfTitleRu: "GASTROFOOD — Тест: Практика",
    pdfTitleVn: "GASTROFOOD — Bài kiểm tra: Thực hành",
    pdfSubtitleRu:
      "Базовые стандарты кухни, гигиена, отчетность и заказ продуктов",
    pdfSubtitleVn:
      "Tiêu chuẩn bếp, vệ sinh, báo cáo và đặt hàng thực phẩm",
  },
];

export function getStaffTestDefinition(id: StaffTestId): StaffTestDefinition {
  const definition = STAFF_TEST_DEFINITIONS.find((item) => item.id === id);
  if (!definition) {
    throw new Error(`Unknown staff test: ${id}`);
  }
  return definition;
}

export function getStaffTestDefinitionByPath(
  pathname: string,
): StaffTestDefinition | null {
  return (
    STAFF_TEST_DEFINITIONS.find(
      (item) => pathname === item.path || pathname.startsWith(`${item.path}/`),
    ) ?? null
  );
}

export { STAFF_TEST_PATH };
