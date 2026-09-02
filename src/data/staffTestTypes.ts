export type StaffTestOptionKey = "A" | "B" | "C" | "D";

export type StaffTestOption = {
  key: StaffTestOptionKey;
  textRu: string;
  textVn: string;
};

export type StaffTestQuestion = {
  id: string;
  number: number;
  promptRu: string;
  promptVn: string;
  options: StaffTestOption[];
  correct: StaffTestOptionKey;
};

export type StaffTestId = "theory" | "practice";

export function scoreStaffTestAnswers(
  questions: StaffTestQuestion[],
  answers: Record<string, StaffTestOptionKey | "">,
): number {
  return questions.reduce((score, question) => {
    if (answers[question.id] === question.correct) {
      return score + 1;
    }
    return score;
  }, 0);
}
