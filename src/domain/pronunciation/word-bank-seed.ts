export const PRONUNCIATION_WORD_BANK_SEEDS = {
  light_l: {
    easy: ["lake|l", "lamp|l", "leaf|l", "leg|l", "lemon|l", "light|l", "lion|l", "lip|l", "log|l", "love|l"],
    medium: ["black|l", "blue|l", "clean|l", "clock|l", "flag|l", "fly|l", "glass|l", "glue|l", "plane|l", "play|l"],
    hard: ["alive|l", "balloon|ll", "believe|l", "below|l", "collect|ll", "color|l", "delicious|l", "electric|l", "polite|l", "select|l"],
  },
  s: {
    easy: ["bus|s", "face|c", "ice|c", "mouse|s", "pencil|c", "rice|c", "sit|s", "sock|s", "soup|s", "sun|s"],
    medium: ["cent|c", "circle|c", "city|c", "dance|c", "place|c", "school|s", "simple|s", "smile|s", "snake|s", "star|s"],
    hard: ["answer|s", "bicycle|c", "decide|c", "lesson|ss", "listen|s", "medicine|c", "message|ss", "possible|ss", "recent|c", "receive|c"],
  },
  f: {
    easy: ["face|f", "fan|f", "fish|f", "five|f", "food|f", "foot|f", "fork|f", "four|f", "leaf|f", "roof|f"],
    medium: ["after|f", "before|f", "coffee|ff", "dolphin|ph", "elephant|ph", "enough|gh", "laugh|gh", "phone|ph", "photo|ph", "safe|f"],
    hard: ["alphabet|ph", "breakfast|f", "different|ff", "favorite|f", "finish|f", "flower|f", "office|ff", "perfect|f", "traffic|ff", "trophy|ph"],
  },
  v: {
    easy: ["five|v", "love|v", "save|v", "seven|v", "van|v", "vase|v", "very|v", "vest|v", "vet|v", "wave|v"],
    medium: ["drive|v", "even|v", "glove|v", "heavy|v", "movie|v", "never|v", "over|v", "river|v", "visit|v", "voice|v"],
    hard: ["arrive|v", "avoid|v", "clever|v", "cover|v", "every|v", "favorite|v", "invite|v", "leave|v", "private|v", "travel|v"],
  },
  z: {
    easy: ["cheese|s", "eyes|s", "lazy|z", "music|s", "nose|s", "rose|s", "zebra|z", "zero|z", "zip|z", "zoo|z"],
    medium: ["busy|s", "cousin|s", "dozen|z", "easy|s", "frozen|z", "puzzle|zz", "reason|s", "season|s", "visit|s", "wizard|z"],
    hard: ["amazing|z", "because|s", "dessert|ss", "design|s", "dizzy|zz", "magazine|z", "organize|z", "realize|z", "result|s", "Tuesday|s"],
  },
} as const;

export type PronunciationWordBankSeed =
  (typeof PRONUNCIATION_WORD_BANK_SEEDS)[keyof typeof PRONUNCIATION_WORD_BANK_SEEDS][keyof (typeof PRONUNCIATION_WORD_BANK_SEEDS)[keyof typeof PRONUNCIATION_WORD_BANK_SEEDS]][number];
