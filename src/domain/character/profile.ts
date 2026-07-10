/**
 * Character profile module (CHAR-04, D-11).
 *
 * Pure domain module — no DB, server, or AI/LLM imports.
 * Exports static template strings keyed by characterId.
 * Consumed by client components to render buddy speech.
 *
 * The default buddy is Coco (CHAR-01). All static copy is reviewed
 * against the 04-UI-SPEC Mission Flow Copy contract (CHAR-02/03, D-10).
 */

import { DEFAULT_CHARACTER_ID } from "@/domain/mission/schemas";

export type CharacterProfile = {
  characterId: string;
  displayName: string;
  questionIntro: string;
  questionLabel: string;
  improvedSentenceIntro: string;
  turnTransition: string;
  completionHeading: string;
  completionBody: (turnCount: number) => string;
  resumeNotice: string;
};

export const DEFAULT_BUDDY: CharacterProfile = {
  characterId: DEFAULT_CHARACTER_ID,
  displayName: "Coco",
  questionIntro: "Hi! Let's practice together.",
  questionLabel: "Coco asks:",
  improvedSentenceIntro: "Nice! Here is a better way to say it:",
  turnTransition: "Good job! Ready for the next one?",
  completionHeading: "Mission complete!",
  completionBody: (turnCount: number) =>
    `Great work! You finished all ${turnCount} turns. Your teacher will see your answers.`,
  resumeNotice: "Welcome back! Picking up where you left off.",
};

export const CHARACTER_PROFILES: Record<string, CharacterProfile> = {
  [DEFAULT_CHARACTER_ID]: DEFAULT_BUDDY,
};

export function getCharacterProfile(characterId: string): CharacterProfile {
  return CHARACTER_PROFILES[characterId] ?? DEFAULT_BUDDY;
}
