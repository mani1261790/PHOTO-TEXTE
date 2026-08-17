"use client";

import { ReactNode, useMemo, useRef, useState } from "react";

import { useLanguage } from "@/components/LanguageProvider";
import {
  CorrectionAnnotations,
  CorrectionHighlightKind,
  TextRange,
  buildCorrectionAnnotationSegments,
  expandAnnotationRangeToWords,
  toggleHighlightRange,
  toggleKnownRange,
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
  const [selection, setSelection] = useState<TextRange | null>(null);

  const segments = useMemo(
    () => buildCorrectionAnnotationSegments(text, value),
    [text, value],
  );
  const selectedText = selection ? text.slice(selection.start, selection.end) : "";

  function captureNativeSelection() {
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
    const next = expandAnnotationRangeToWords(
      text,
      beforeStart.toString().length,
      beforeEnd.toString().length,
    );
    if (next) setSelection(next);
  }

  function applyHighlight(kind: CorrectionHighlightKind) {
    if (!selection) return;
    onChange({
      ...value,
      highlights: toggleHighlightRange(value.highlights, selection, kind),
    });
  }

  function applyKnownBox() {
    if (!selection) return;
    onChange({ ...value, knownRanges: toggleKnownRange(value.knownRanges, selection) });
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
        className={`correction-annotation-token${highlight ? ` ${kindClassNames[highlight]}` : ""}${selected ? " correction-annotation-token-selected" : ""}`}
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
          "通常どおり文中をドラッグしてから、付けたい色または囲みを選びます。選択に含まれる語全体が対象です。同じ種類をもう一度押すと外れます。",
          "Sélectionnez normalement un passage, puis choisissez une couleur ou un encadré. Les mots touchés par la sélection sont pris en entier. Appuyez de nouveau sur le même type pour le retirer.",
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
        onMouseUp={captureNativeSelection}
        onTouchEnd={() => window.setTimeout(captureNativeSelection, 0)}
      >
        {renderedText}
      </div>

      <div className="correction-selection-panel" aria-live="polite">
        {selection ? (
          <p>
            <strong>{t("対象の語", "Mots sélectionnés")}</strong>
            <span>« {selectedText.length > 120 ? `${selectedText.slice(0, 117)}…` : selectedText} »</span>
          </p>
        ) : (
          <p>{t("テキストを普通にドラッグして、対象の語を選択してください。", "Faites glisser normalement sur le texte pour sélectionner les mots à annoter.")}</p>
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
