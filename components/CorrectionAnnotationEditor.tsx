"use client";

import { KeyboardEvent, MouseEvent, ReactNode, TouchEvent, useMemo, useRef, useState } from "react";

import { useLanguage } from "@/components/LanguageProvider";
import {
  CorrectionAnnotations,
  CorrectionHighlightKind,
  TextRange,
  addKnownRange,
  buildCorrectionAnnotationSegments,
  removeHighlightRange,
  removeKnownRange,
  replaceHighlightRange,
  trimAnnotationRange,
} from "@/lib/learning/annotations";

type Props = {
  text: string;
  value: CorrectionAnnotations;
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  onChange: (next: CorrectionAnnotations) => void;
  onSave: () => void;
};

const kindClassNames: Record<CorrectionHighlightKind, string> = {
  useful_word: "correction-highlight-useful-word",
  useful_verb: "correction-highlight-useful-verb",
  grammar: "correction-highlight-grammar",
};

export function CorrectionAnnotationEditor({
  text,
  value,
  dirty,
  saving,
  saved,
  onChange,
  onSave,
}: Props) {
  const { language } = useLanguage();
  const t = (ja: string, fr: string) => (language === "fr" ? fr : ja);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const nativeSelectionCapturedRef = useRef(false);
  const [selection, setSelection] = useState<TextRange | null>(null);

  const segments = useMemo(
    () => buildCorrectionAnnotationSegments(text, value),
    [text, value],
  );
  const selectedText = selection ? text.slice(selection.start, selection.end) : "";

  function selectRange(start: number, end: number, extend: boolean) {
    const next = trimAnnotationRange(
      text,
      extend && selection ? Math.min(selection.start, start) : start,
      extend && selection ? Math.max(selection.end, end) : end,
    );
    if (next) setSelection(next);
  }

  function captureNativeSelection(suppressNextClick: boolean) {
    const container = surfaceRef.current;
    const browserSelection = window.getSelection();
    if (!container || !browserSelection?.rangeCount || browserSelection.isCollapsed) return;
    const range = browserSelection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;

    const beforeStart = document.createRange();
    beforeStart.selectNodeContents(container);
    beforeStart.setEnd(range.startContainer, range.startOffset);
    const beforeEnd = document.createRange();
    beforeEnd.selectNodeContents(container);
    beforeEnd.setEnd(range.endContainer, range.endOffset);
    selectRange(beforeStart.toString().length, beforeEnd.toString().length, false);
    nativeSelectionCapturedRef.current = suppressNextClick;
  }

  function applyHighlight(kind: CorrectionHighlightKind) {
    if (!selection) return;
    onChange({
      ...value,
      highlights: replaceHighlightRange(value.highlights, selection, kind),
    });
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  function applyKnownBox() {
    if (!selection) return;
    onChange({ ...value, knownRanges: addKnownRange(value.knownRanges, selection) });
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  function clearHighlight() {
    if (!selection) return;
    onChange({
      ...value,
      highlights: removeHighlightRange(value.highlights, selection),
    });
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  function clearKnownBox() {
    if (!selection) return;
    onChange({ ...value, knownRanges: removeKnownRange(value.knownRanges, selection) });
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  function renderToken(
    content: string,
    start: number,
    highlight: CorrectionHighlightKind | null,
    key: string,
  ): ReactNode {
    if (/^\s+$/.test(content)) return content;
    const end = start + content.length;
    const selected = Boolean(selection && start < selection.end && end > selection.start);
    return (
      <span
        key={key}
        role="button"
        tabIndex={0}
        className={`correction-annotation-token${highlight ? ` ${kindClassNames[highlight]}` : ""}${selected ? " correction-annotation-token-selected" : ""}`}
        aria-label={t(
          `${content}。範囲の端として選択`,
          `${content}. Sélectionner comme limite de la plage`,
        )}
        onClick={(event) => {
          if (nativeSelectionCapturedRef.current) {
            nativeSelectionCapturedRef.current = false;
            return;
          }
          selectRange(start, end, event.shiftKey || Boolean(selection));
        }}
        onKeyDown={(event: KeyboardEvent<HTMLSpanElement>) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          selectRange(start, end, event.shiftKey || Boolean(selection));
        }}
      >
        {content}
      </span>
    );
  }

  function renderSegmentText(
    content: string,
    absoluteStart: number,
    highlight: CorrectionHighlightKind | null,
    keyPrefix: string,
  ) {
    let cursor = absoluteStart;
    return content.split(/(\s+)/g).filter(Boolean).map((part, index) => {
      const start = cursor;
      cursor += part.length;
      return renderToken(part, start, highlight, `${keyPrefix}-${index}`);
    });
  }

  const renderedText: ReactNode[] = [];
  for (let index = 0; index < segments.length; ) {
    const segment = segments[index];
    if (!segment.known) {
      renderedText.push(
        <span key={`plain-${index}`}>
          {renderSegmentText(segment.text, segment.start, segment.highlight, `plain-${index}`)}
        </span>,
      );
      index += 1;
      continue;
    }

    const knownSegments = [];
    const groupStart = index;
    while (index < segments.length && segments[index].known) {
      knownSegments.push(segments[index]);
      index += 1;
    }
    renderedText.push(
      <span
        key={`known-${groupStart}`}
        className="correction-known-range"
        aria-label={t("知っている範囲", "Passage connu")}
      >
        {knownSegments.map((knownSegment, knownIndex) => (
          <span key={`known-segment-${groupStart}-${knownIndex}`}>
            {renderSegmentText(
              knownSegment.text,
              knownSegment.start,
              knownSegment.highlight,
              `known-${groupStart}-${knownIndex}`,
            )}
          </span>
        ))}
      </span>,
    );
  }

  return (
    <section className="card correction-annotation-editor">
      <div className="editor-card-heading correction-annotation-heading">
        <div>
          <span className="eyebrow">{t("訂正ハイライト", "Repérage des corrections")}</span>
          <h2>{t("最終フランス語に印を付ける", "Annoter le texte final en français")}</h2>
        </div>
        <span className="badge">
          {t(
            `色 ${value.highlights.length}・囲み ${value.knownRanges.length}`,
            `Surlignages : ${value.highlights.length} · Encadrés : ${value.knownRanges.length}`,
          )}
        </span>
      </div>

      <p id="correction-annotation-help" className="timeline-detail">
        {t(
          "文中をドラッグするか、開始語と終了語を順に選びます。色と囲み線は同じ範囲に重ねられます。",
          "Faites glisser sur le texte, ou sélectionnez successivement le premier et le dernier mot. Le surlignage et l’encadré peuvent se superposer.",
        )}
      </p>

      <div className="correction-annotation-toolbar" aria-label={t("印の種類", "Types d’annotation")}>
        <button type="button" className="annotation-action annotation-action-green" onClick={() => applyHighlight("useful_word")} disabled={!selection}>
          <span className="annotation-swatch" aria-hidden />
          {t("有用な名詞・形容詞", "Noms et adjectifs utiles")}
        </button>
        <button type="button" className="annotation-action annotation-action-orange" onClick={() => applyHighlight("useful_verb")} disabled={!selection}>
          <span className="annotation-swatch" aria-hidden />
          {t("有用な動詞", "Verbes utiles")}
        </button>
        <button type="button" className="annotation-action annotation-action-yellow" onClick={() => applyHighlight("grammar")} disabled={!selection}>
          <span className="annotation-swatch" aria-hidden />
          {t("その他の文法", "Autres points de grammaire")}
        </button>
        <button type="button" className="annotation-action annotation-action-known" onClick={applyKnownBox} disabled={!selection}>
          <span className="annotation-box-sample" aria-hidden />
          {t("知っている範囲を囲む", "Encadrer ce que je connais")}
        </button>
      </div>

      <div
        ref={surfaceRef}
        className="correction-annotation-surface"
        aria-describedby="correction-annotation-help"
        onMouseUp={(_: MouseEvent<HTMLDivElement>) => captureNativeSelection(true)}
        onTouchEnd={(_: TouchEvent<HTMLDivElement>) => window.setTimeout(() => captureNativeSelection(false), 0)}
      >
        {renderedText}
      </div>

      <div className="correction-selection-panel" aria-live="polite">
        {selection ? (
          <>
            <p>
              <strong>{t("選択中", "Sélection")}</strong>
              <span>« {selectedText.length > 120 ? `${selectedText.slice(0, 117)}…` : selectedText} »</span>
            </p>
            <div className="editor-card-actions">
              <button type="button" className="btn-secondary" onClick={clearHighlight}>
                {t("この範囲の色を外す", "Retirer le surlignage")}
              </button>
              <button type="button" className="btn-secondary" onClick={clearKnownBox}>
                {t("この範囲の囲みを外す", "Retirer l’encadré")}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setSelection(null)}>
                {t("選択を解除", "Annuler la sélection")}
              </button>
            </div>
          </>
        ) : (
          <p>{t("印を付ける範囲を選択してください。", "Sélectionnez le passage à annoter.")}</p>
        )}
      </div>

      <div className="correction-annotation-save-row">
        <p className="timeline-detail">
          {dirty
            ? t("未保存の変更があります。", "Des modifications ne sont pas enregistrées.")
            : saved
              ? t("保存しました。", "Annotations enregistrées.")
              : t("色は重ねず、囲み線だけを独立して追加できます。", "Les couleurs ne se superposent pas ; l’encadré reste indépendant.")}
        </p>
        <button type="button" onClick={onSave} disabled={!dirty || saving}>
          {saving ? t("保存中…", "Enregistrement…") : t("訂正ハイライトを保存", "Enregistrer les annotations")}
        </button>
      </div>
    </section>
  );
}
