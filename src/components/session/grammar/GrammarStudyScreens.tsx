"use client";

import { verbForm, type GrammarTense, type TenseTables } from "@/lib/grammar-lessons";
import { STUDY_TENSE_ORDER, type GrammarStudyScreen } from "@/lib/grammar-node";
import { SentenceBracketView } from "@/components/session/grammar/SentenceBracketView";
import {
  Emphasize,
  HighlightedForm,
  PhraseRow,
  PinguChat,
  PinguSays,
  TENSE_TONE,
  TenseStepper,
  useClipPlayer,
} from "@/components/session/grammar/grammar-ui";

type ReadScreen = Exclude<GrammarStudyScreen, { kind: "check" }>;

/** What each tense is, in one line, on the intro. */
const TENSE_INTRO_VI: Record<GrammarTense, string> = {
  praesens: "Hiện tại — bạn đã biết rồi",
  praeteritum: "Quá khứ, chỉ 1 từ",
  perfekt: "Quá khứ, 2 phần: haben/sein + Partizip II",
};

/** Pingu's line on a tense screen that has no tip of its own. */
const TENSE_HINT_VI: Record<GrammarTense, string> = {
  praesens: "Nhớ lại thì hiện tại nhé. Chạm vào từng dòng để nghe.",
  praeteritum: "Präteritum chỉ có 1 từ. Chạm vào từng dòng để nghe.",
  perfekt: "Perfekt có 2 phần: trợ động từ và Partizip II.",
};

function tenseLabels(tables: TenseTables): Record<GrammarTense, string> {
  const label = (id: GrammarTense) => tables.tenses.find((tense) => tense.id === id)?.label ?? id;
  return { praesens: label("praesens"), perfekt: label("perfekt"), praeteritum: label("praeteritum") };
}

function Title({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[13px] font-extrabold uppercase tracking-wider text-[#86868b]">{eyebrow}</span>
      <h1 className="text-[24px] font-extrabold leading-tight tracking-tight text-[#1d1d1f]">{children}</h1>
    </div>
  );
}

function IntroScreen({ screen, tables }: { screen: Extract<ReadScreen, { kind: "intro" }>; tables: TenseTables }) {
  const labels = tenseLabels(tables);
  return (
    <div className="flex flex-col gap-6">
      <Title eyebrow="Ngữ pháp mới">{screen.titleVi}</Title>
      <PinguSays size={80}>
        <p>
          Tiếng Đức có <strong className="text-[#1d1d1f]">2 cách</strong> nói về quá khứ. Hôm nay mình học cả hai!
        </p>
      </PinguSays>
      <ol className="flex flex-col gap-2.5">
        {STUDY_TENSE_ORDER.filter((tense) => screen.tenses.includes(tense)).map((tense, index) => (
          <li
            key={tense}
            className={`flex items-center gap-3 rounded-2xl border-2 border-b-4 ${TENSE_TONE[tense].ring} ${TENSE_TONE[tense].soft} px-3 py-3`}
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[16px] font-extrabold ${TENSE_TONE[tense].head}`}
            >
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-[17px] font-extrabold text-[#1d1d1f]">{labels[tense]}</span>
              <span className="block text-[14px] leading-snug text-[#3a3a3c]">{TENSE_INTRO_VI[tense]}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TenseScreen({ screen, tables }: { screen: Extract<ReadScreen, { kind: "tense" }>; tables: TenseTables }) {
  const { play, playingPath } = useClipPlayer();
  const labels = tenseLabels(tables);
  const tone = TENSE_TONE[screen.tense];
  const meta = tables.tenses.find((tense) => tense.id === screen.tense);
  const terms = screen.rows.flatMap((row) => row.form.split(" ").filter((word) => word !== "…"));
  return (
    <div className="flex flex-col gap-4 [@media(max-height:700px)]:gap-2.5">
      <TenseStepper order={STUDY_TENSE_ORDER} current={screen.tense} labels={labels} />
      {/* The stepper names the tense, so the title is just the verb and what the tense means. */}
      <h1 className="flex items-baseline gap-2 tracking-tight">
        <span className="text-[26px] font-extrabold leading-tight text-[#1d1d1f]">{screen.verb}</span>
        <span className={`text-[15px] font-bold ${tone.label}`}>{meta?.labelVi}</span>
      </h1>
      <PinguSays>
        {screen.tips.length > 0 ? (
          screen.tips.map((tip) => (
            <p key={tip.id}>
              <Emphasize text={tip.textVi} terms={terms} />
            </p>
          ))
        ) : (
          <p>{TENSE_HINT_VI[screen.tense]}</p>
        )}
      </PinguSays>
      <ul className="flex flex-col gap-2 [@media(max-height:700px)]:gap-1.5">
        {screen.rows.map((row) => (
          <li key={row.personLabel}>
            <PhraseRow
              audioPath={row.audioPath}
              playing={row.audioPath !== null && playingPath === row.audioPath}
              onPlay={play}
              label={`Nghe: ${row.spoken}`}
            >
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[16px] font-semibold text-[#86868b]">{row.personLabel}</span>
                <span className={`text-[19px] font-bold ${tone.text}`}>
                  <HighlightedForm text={row.form} highlight={row.highlight} markClass={tone.mark} />
                </span>
              </span>
            </PhraseRow>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TipsScreen({ screen }: { screen: Extract<ReadScreen, { kind: "tips" }> }) {
  return (
    <div className="flex flex-col gap-5">
      <Title eyebrow="Ghi nhớ">Mẹo của Pingu</Title>
      <PinguChat
        size={80}
        bubbles={screen.tips.map((tip) => (
          <div key={tip.id}>
            <p className="font-extrabold text-[#1d1d1f]">{tip.titleVi}</p>
            <p>{tip.textVi}</p>
          </div>
        ))}
      />
    </div>
  );
}

function ExamplesScreen({ screen, tables }: { screen: Extract<ReadScreen, { kind: "examples" }>; tables: TenseTables }) {
  const { play, playingPath } = useClipPlayer();
  return (
    <div className="flex flex-col gap-5">
      <Title eyebrow="Nghe và đọc">Câu ví dụ</Title>
      <ul className="flex flex-col gap-2">
        {screen.examples.map((example) => (
          <li key={example.id}>
            <PhraseRow
              audioPath={example.audioPath}
              playing={example.audioPath !== null && playingPath === example.audioPath}
              onPlay={play}
              label={`Nghe: ${example.script}`}
            >
              <p className="text-[16px] font-semibold leading-snug text-[#1d1d1f]">
                {/* The verb form in its tense's color says the tense without a label. */}
                <Emphasize
                  text={example.script}
                  terms={verbForm(tables, example.verb, example.tense, example.person)?.words ?? []}
                  markClass={`font-extrabold ${TENSE_TONE[example.tense].text}`}
                />
              </p>
              <p className="text-[14px] leading-snug text-[#86868b]">{example.translationVi}</p>
            </PhraseRow>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Every study screen except quick checks: read or listen, then continue. */
export function GrammarReadScreen({ screen, tables }: { screen: ReadScreen; tables: TenseTables }) {
  switch (screen.kind) {
    case "intro":
      return <IntroScreen screen={screen} tables={tables} />;
    case "tense":
      return <TenseScreen screen={screen} tables={tables} />;
    case "bracket":
      return (
        <SentenceBracketView
          bracket={screen.bracket}
          script={screen.example.script}
          translationVi={screen.example.translationVi}
          audioPath={screen.example.audioPath}
          tips={screen.tips}
        />
      );
    case "tips":
      return <TipsScreen screen={screen} />;
    case "examples":
      return <ExamplesScreen screen={screen} tables={tables} />;
  }
}
