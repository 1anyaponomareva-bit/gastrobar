/** Шаблоны сосисок с /food — подписи и граммовки; цены из Poster. */
export type HotDogSausageTemplate = {
  id: string;
  label: string;
  shortLabel: string;
  grammage?: string;
};

export type LocalHotDogConfig = {
  hotDogNoSausage?: boolean;
  hotDogPrefix?: boolean;
  sausageTemplates?: HotDogSausageTemplate[];
};

const STANDARD_PORK: HotDogSausageTemplate = {
  id: "standard-pork",
  label: "Стандартная свиная сосиска",
  shortLabel: "Стандартная свиная сосиска",
  grammage: "200–210 г",
};

function craftSausage(shortLabel: string, grammage = "280 г"): HotDogSausageTemplate {
  return {
    id: "craft",
    label: "Крафтовая колбаска собственного производства",
    shortLabel,
    grammage,
  };
}

const DEFAULT_SAUSAGE_TEMPLATES: HotDogSausageTemplate[] = [
  STANDARD_PORK,
  craftSausage("Крафтовая колбаска (курица, свинина или говядина на выбор)"),
];

const BBQ_SAUSAGE_TEMPLATES: HotDogSausageTemplate[] = [
  STANDARD_PORK,
  craftSausage("Крафтовая колбаска (курица, свинина или свинина с сыром на выбор)"),
];

const CHEDDAR_SAUSAGE_TEMPLATES: HotDogSausageTemplate[] = [
  { ...STANDARD_PORK, grammage: "210–220 г" },
  craftSausage(
    "Крафтовая колбаска (курица, свинина или свинина с сыром на выбор)",
    "210–220 г",
  ),
];

const JALAPENO_SAUSAGE_TEMPLATES: HotDogSausageTemplate[] = [
  { ...STANDARD_PORK, grammage: "210–220 г" },
  craftSausage(
    "Крафтовая колбаска (курица, свинина или свинина с сыром на выбор)",
    "280 г",
  ),
];

const CLASSIC_SAUSAGE_TEMPLATES: HotDogSausageTemplate[] = [
  { ...STANDARD_PORK, grammage: "200–210 г", id: "standard-pork" },
  craftSausage(
    "Крафтовая колбаска (курица, свинина или свинина с сыром на выбор)",
    "280 г",
  ),
];

export const LOCAL_HOT_DOG_CONFIG: Record<string, LocalHotDogConfig> = {
  "simple-hot-dog": { hotDogNoSausage: true },
  "classic-hot-dog": { sausageTemplates: CLASSIC_SAUSAGE_TEMPLATES },
  "cheddar-bacon-dog": { sausageTemplates: CHEDDAR_SAUSAGE_TEMPLATES },
  "jalapeno-cheddar-dog": { sausageTemplates: JALAPENO_SAUSAGE_TEMPLATES },
  "bavarian-dog": { sausageTemplates: DEFAULT_SAUSAGE_TEMPLATES },
  "bbq-bacon-dog": { sausageTemplates: BBQ_SAUSAGE_TEMPLATES },
  "philly-cheesesteak": { hotDogPrefix: false, hotDogNoSausage: true },
};
