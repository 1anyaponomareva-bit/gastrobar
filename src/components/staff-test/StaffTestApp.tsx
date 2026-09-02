"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StaffTestLanguageFlags } from "@/components/staff-test/StaffTestLanguageFlags";
import { STAFF_INVENTORY_VENUE_LOGOS } from "@/data/staffInventoryItems";
import { getStaffTestDefinition } from "@/data/staffTests";
import { scoreStaffTestAnswers, type StaffTestId, type StaffTestOptionKey } from "@/data/staffTestTypes";
import { getAssetUrl } from "@/lib/appVersion";
import {
  deliverPdfFile,
  type DeliverPdfResult,
} from "@/lib/deliverPdfFile";
import { translate } from "@/lib/i18n";
import { STAFF_TEST_PATH } from "@/lib/routes";
import { toStaffTestAppLang } from "@/lib/staffTestI18n";
import {
  getStaffTestPdfFileName,
  makeStaffTestPdfBlob,
  preloadStaffTestPdfFonts,
} from "@/lib/staffTestPdf";
import {
  clearStaffTestAnswers,
  getAllTestAnswers,
  getStoredTestDate,
  getStoredTestEmployee,
  getStoredTestPosition,
  getTestAnswer,
  setStoredTestDate,
  setStoredTestEmployee,
  setStoredTestPosition,
  setTestAnswer,
  todayIsoDate,
} from "@/lib/staffTestStorage";
import { useTranslation } from "@/lib/useTranslation";
import "../staff/staff-inventory.css";
import "./staff-test.css";

type StaffTestAppProps = {
  testId: StaffTestId;
};

export function StaffTestApp({ testId }: StaffTestAppProps) {
  const definition = getStaffTestDefinition(testId);
  const { questions, passingScore, pdfSlug } = definition;
  const totalQuestions = questions.length;

  const { lang } = useTranslation();
  const testLang = toStaffTestAppLang(lang);
  const t = useCallback(
    (key: string) => translate(testLang, key),
    [testLang],
  );

  const [hydrated, setHydrated] = useState(false);
  const [date, setDate] = useState("");
  const [employee, setEmployee] = useState("");
  const [position, setPosition] = useState("");
  const [revision, setRevision] = useState(0);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportBlocked, setExportBlocked] = useState(false);
  const [exportEmployeeError, setExportEmployeeError] = useState(false);
  const sharePrepareRef = useRef<{
    key: string;
    promise: Promise<Blob>;
  } | null>(null);

  const bump = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    preloadStaffTestPdfFonts();
  }, []);

  useEffect(() => {
    setDate(getStoredTestDate(testId) || todayIsoDate());
    setEmployee(getStoredTestEmployee(testId));
    setPosition(getStoredTestPosition(testId));
    setHydrated(true);
  }, [testId]);

  const answers = useMemo(() => {
    void revision;
    return getAllTestAnswers(testId);
  }, [revision, testId]);

  const answeredCount = useMemo(
    () => questions.filter((question) => answers[question.id]).length,
    [answers, questions],
  );

  const score = useMemo(
    () => scoreStaffTestAnswers(questions, answers),
    [questions, answers],
  );
  const passed = score >= passingScore;
  const allAnswered = answeredCount === totalQuestions;

  const unansweredIds = useMemo(
    () =>
      questions.filter((question) => !answers[question.id]).map((question) => question.id),
    [answers, questions],
  );

  const pdfExportOptions = useMemo(
    () => ({
      testTitleRu: definition.pdfTitleRu,
      testTitleVn: definition.pdfTitleVn,
      testSubtitleRu: definition.pdfSubtitleRu,
      testSubtitleVn: definition.pdfSubtitleVn,
      passingScore,
      totalQuestions,
      date,
      employee,
      position,
      score,
      answers: questions.map((question) => ({
        question,
        selected: answers[question.id] ?? "",
      })),
    }),
    [definition, passingScore, totalQuestions, date, employee, position, score, answers, questions],
  );

  const buildShareKey = useCallback(() => {
    return [testId, date, employee.trim(), position.trim(), revision].join("::");
  }, [testId, date, employee, position, revision]);

  const beginSharePreparation = useCallback(() => {
    if (!employee.trim() || unansweredIds.length) return;

    const key = buildShareKey();
    sharePrepareRef.current = {
      key,
      promise: makeStaffTestPdfBlob(pdfExportOptions),
    };
  }, [buildShareKey, employee, unansweredIds.length, pdfExportOptions]);

  const performTestReset = useCallback(() => {
    clearStaffTestAnswers(testId);
    const today = todayIsoDate();
    setDate(today);
    setStoredTestDate(testId, today);
    setEmployee("");
    setStoredTestEmployee(testId, "");
    setPosition("");
    setStoredTestPosition(testId, "");
    setExportBlocked(false);
    setExportEmployeeError(false);
    sharePrepareRef.current = null;
    bump();
  }, [testId, bump]);

  const handleReset = () => {
    if (!window.confirm(t("staff_test_reset_confirm"))) return;
    performTestReset();
  };

  const handleSharePdfResult = (result: DeliverPdfResult) => {
    if (result === "cancelled" || result === "downloaded") return;
    window.alert(t("staff_test_share_pdf_error"));
  };

  useEffect(() => {
    if (!hydrated || !employee.trim() || unansweredIds.length) {
      sharePrepareRef.current = null;
      return;
    }

    const key = buildShareKey();
    sharePrepareRef.current = {
      key,
      promise: makeStaffTestPdfBlob(pdfExportOptions),
    };
  }, [
    hydrated,
    buildShareKey,
    employee,
    unansweredIds.length,
    pdfExportOptions,
  ]);

  const handleExportPdf = async () => {
    if (exportingPdf) return;

    if (!employee.trim()) {
      setExportEmployeeError(true);
      setExportBlocked(true);
      window.setTimeout(() => {
        document.getElementById("staff-test-employee")?.focus();
        document
          .getElementById("staff-test-employee")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      return;
    }

    setExportEmployeeError(false);

    if (unansweredIds.length) {
      setExportBlocked(true);
      const firstId = unansweredIds[0];
      window.setTimeout(() => {
        document
          .getElementById(`staff-test-question-${firstId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      return;
    }

    setExportBlocked(false);
    setExportingPdf(true);
    try {
      const fileName = getStaffTestPdfFileName(pdfSlug, date, employee);
      const key = buildShareKey();
      const prepared = sharePrepareRef.current;
      const blob =
        prepared?.key === key
          ? await prepared.promise
          : await makeStaffTestPdfBlob(pdfExportOptions);
      const result = await deliverPdfFile(blob, fileName);

      if (result === "shared" || result === "downloaded") {
        performTestReset();
      } else {
        handleSharePdfResult(result);
      }
    } catch (error) {
      console.error(error);
      window.alert(t("staff_test_share_pdf_error_generic"));
    } finally {
      setExportingPdf(false);
    }
  };

  const handleSelectAnswer = (questionId: string, option: StaffTestOptionKey) => {
    const current = getTestAnswer(testId, questionId);
    setTestAnswer(testId, questionId, current === option ? "" : option);
    setExportBlocked(false);
    bump();
  };

  if (!hydrated) {
    return (
      <div className="staff-inventory flex min-h-[100dvh] items-center justify-center text-[#777]">
        {t("staff_test_loading")}
      </div>
    );
  }

  return (
    <div className="staff-inventory staff-test">
      <div className="app">
        <div className="top">
          <div className="langRow">
            <StaffTestLanguageFlags />
          </div>

          <div className="venueLogo">
            <img
              src={getAssetUrl(STAFF_INVENTORY_VENUE_LOGOS.gastrofood)}
              alt="GastroFood"
            />
          </div>

          <Link href={STAFF_TEST_PATH} className="testBackLink">
            {t("staff_test_back_to_chooser")}
          </Link>

          <div className="testHeader">
            <h1 className="testTitle">{t(definition.titleKey)}</h1>
            <p className="testSubtitle">{t(definition.subtitleKey)}</p>
          </div>

          <div className="meta">
            <div className="box">
              <label htmlFor="staff-test-date">{t("staff_test_date")}</label>
              <input
                id="staff-test-date"
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setStoredTestDate(testId, event.target.value);
                }}
              />
            </div>
            <div className="box">
              <label htmlFor="staff-test-employee">{t("staff_test_employee")}</label>
              <input
                id="staff-test-employee"
                type="text"
                placeholder={t("staff_test_employee_placeholder")}
                value={employee}
                onChange={(event) => {
                  setEmployee(event.target.value);
                  setStoredTestEmployee(testId, event.target.value);
                  if (exportEmployeeError) setExportEmployeeError(false);
                }}
              />
            </div>
          </div>

          <div className="meta">
            <div className="box" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="staff-test-position">{t("staff_test_position")}</label>
              <input
                id="staff-test-position"
                type="text"
                placeholder={t("staff_test_position_placeholder")}
                value={position}
                onChange={(event) => {
                  setPosition(event.target.value);
                  setStoredTestPosition(testId, event.target.value);
                }}
              />
            </div>
          </div>

          <div className="stats">
            <div className="stat">
              <label>{t("staff_test_stat_answered")}</label>
              <b>
                {answeredCount}/{totalQuestions}
              </b>
            </div>
            <div className="stat">
              <label>{t("staff_test_stat_score")}</label>
              <b className={allAnswered ? (passed ? "statGreen" : "statRed") : ""}>
                {allAnswered ? `${score}/${totalQuestions}` : "—"}
              </b>
            </div>
            <div className="stat">
              <label>{t("staff_test_stat_pass")}</label>
              <b className={allAnswered ? (passed ? "statGreen" : "statRed") : ""}>
                {allAnswered
                  ? passed
                    ? t("staff_test_passed")
                    : t("staff_test_failed")
                  : "—"}
              </b>
            </div>
          </div>
        </div>

        <div className="main">
          <div className="mode">
            <span>{t(definition.modeLineKey)}</span>
            <button type="button" className="dark" onClick={handleReset}>
              {t("staff_test_reset")}
            </button>
          </div>

          <p className="testInstruction">{t(definition.instructionKey)}</p>

          {allAnswered ? (
            <div
              className={`passBadge ${passed ? "passed" : "failed"}`}
              role="status"
            >
              {passed
                ? t("staff_test_result_passed")
                    .replace("{score}", String(score))
                    .replace("{total}", String(totalQuestions))
                : t("staff_test_result_failed")
                    .replace("{score}", String(score))
                    .replace("{total}", String(totalQuestions))}
            </div>
          ) : null}

          {questions.map((question) => {
            const selected = answers[question.id] ?? "";
            const highlightMissing =
              exportBlocked && unansweredIds.includes(question.id);

            return (
              <div
                key={question.id}
                id={`staff-test-question-${question.id}`}
                className={`questionCard ${highlightMissing ? "missing" : ""}`}
              >
                <div className="questionNumber">
                  {t("staff_test_question_label").replace(
                    "{number}",
                    String(question.number),
                  )}
                </div>
                <div className="questionPrompt">{question.promptRu}</div>
                <div className="questionPromptVn">{question.promptVn}</div>
                <div className="optionList" role="radiogroup">
                  {question.options.map((option) => {
                    const active = selected === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        className={`optionBtn ${active ? "active" : ""}`}
                        role="radio"
                        aria-checked={active}
                        onClick={() => handleSelectAnswer(question.id, option.key)}
                      >
                        <span className="optionKey">{option.key}</span>
                        <span className="optionText">
                          <span className="optionTextRu">{option.textRu}</span>
                          <span className="optionTextVn">{option.textVn}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="exportOnly">
            {exportBlocked && (exportEmployeeError || unansweredIds.length) ? (
              <div className="exportError" role="alert">
                <strong>{t("staff_test_export_blocked_title")}</strong>
                <ul>
                  {exportEmployeeError ? (
                    <li>{t("staff_test_export_employee_required")}</li>
                  ) : null}
                  {unansweredIds.length ? (
                    <li>
                      {t("staff_test_export_unanswered").replace(
                        "{count}",
                        String(unansweredIds.length),
                      )}
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}
            <button
              type="button"
              className="gold"
              onPointerDown={beginSharePreparation}
              onTouchStart={beginSharePreparation}
              onClick={handleExportPdf}
              disabled={exportingPdf}
            >
              {exportingPdf ? t("staff_test_sharing_pdf") : t("staff_test_share_pdf")}
            </button>
            <p className="note">{t("staff_test_note_pdf")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
