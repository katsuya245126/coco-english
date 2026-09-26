import Image from "next/image";
import type { ReactNode } from "react";
import "./join.css";

type Hero = { hi: string; line: string; ko?: string };

const STUDENT_HERO: Hero = {
  hi: "Hi there!",
  line: "Let's speak English!",
  ko: "코코랑 영어로 말해 봐요!",
};

// Sticker-book frame for the landing, join/unlock and teacher auth screens: a
// sky hero with Coco above the form card, matching the student home greeting.
export function JoinShell({ children, hero = STUDENT_HERO }: { children: ReactNode; hero?: Hero }) {
  return (
    <main className="join-page sticker-theme">
      <div className="join-column">
        <div className="join-hero">
          <div className="join-hero-copy">
            <p className="join-hero-hi">{hero.hi}</p>
            <p className="join-hero-line">{hero.line}</p>
            {hero.ko ? <p className="join-hero-ko" lang="ko">{hero.ko}</p> : null}
          </div>
          <div className="join-hero-coco" aria-hidden="true">
            <Image alt="" height={1254} priority src="/images/coco-celebrate-alpha.png" width={1526} />
          </div>
        </div>
        <div className="join-card">{children}</div>
      </div>
    </main>
  );
}
