import type { StaffTestId, StaffTestOptionKey } from "@/data/staffTestTypes";
import { getStaffTestDefinition } from "@/data/staffTests";

const PREFIX = "st_";

function testPrefix(testId: StaffTestId): string {
  return `${PREFIX}${testId}_`;
}

function answerKey(testId: StaffTestId, questionId: string): string {
  return `${testPrefix(testId)}answer_${questionId}`;
}

export function getStoredTestDate(testId: StaffTestId): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(`${testPrefix(testId)}date`) ?? "";
}

export function setStoredTestDate(testId: StaffTestId, value: string): void {
  localStorage.setItem(`${testPrefix(testId)}date`, value);
}

export function getStoredTestEmployee(testId: StaffTestId): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(`${testPrefix(testId)}employee`) ?? "";
}

export function setStoredTestEmployee(testId: StaffTestId, value: string): void {
  localStorage.setItem(`${testPrefix(testId)}employee`, value);
}

export function getStoredTestPosition(testId: StaffTestId): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(`${testPrefix(testId)}position`) ?? "";
}

export function setStoredTestPosition(testId: StaffTestId, value: string): void {
  localStorage.setItem(`${testPrefix(testId)}position`, value);
}

export function getTestAnswer(
  testId: StaffTestId,
  questionId: string,
): StaffTestOptionKey | "" {
  if (typeof window === "undefined") return "";
  const value = localStorage.getItem(answerKey(testId, questionId));
  if (value === "A" || value === "B" || value === "C" || value === "D") {
    return value;
  }
  return "";
}

export function setTestAnswer(
  testId: StaffTestId,
  questionId: string,
  answer: StaffTestOptionKey | "",
): void {
  if (!answer) {
    localStorage.removeItem(answerKey(testId, questionId));
    return;
  }
  localStorage.setItem(answerKey(testId, questionId), answer);
}

export function clearStaffTestAnswers(testId: StaffTestId): void {
  const { questions } = getStaffTestDefinition(testId);
  questions.forEach((question) => {
    localStorage.removeItem(answerKey(testId, question.id));
  });
}

export function getAllTestAnswers(
  testId: StaffTestId,
): Record<string, StaffTestOptionKey | ""> {
  const { questions } = getStaffTestDefinition(testId);
  const answers: Record<string, StaffTestOptionKey | ""> = {};
  questions.forEach((question) => {
    answers[question.id] = getTestAnswer(testId, question.id);
  });
  return answers;
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
