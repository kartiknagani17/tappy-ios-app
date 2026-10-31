export type Level = 'severe' | 'intolerance' | 'preference';
export type Section = 'diets' | 'allergens' | 'conditions';
export type RestrictionKind = 'severity' | 'checklist' | 'radio' | 'toggle';

export type SubItem = { id: string; label: string; info: string; tags: string[] };

export type Restriction = {
  id: string;
  name: string;
  section: Section;
  kind: RestrictionKind;
  /** severity only: include the "Severe / cross-contact" level */
  crossContact?: boolean;
  /** severity only: "follow" → "I strictly follow {phrase}." / "avoid" → "I must avoid {phrase}." */
  voice?: 'follow' | 'avoid';
  phrase?: string;
  /** checklist / radio */
  items?: SubItem[];
  hint?: string;
  mostCommon?: boolean;
  about: string;
  tags: string[];
};

export type Selection = { level?: Level; items?: string[] };

const s = (id: string, label: string, tags: string[], info?: string): SubItem => ({
  id,
  label,
  tags,
  info: info ?? `Select to avoid ingredients in the "${label}" group.`,
});

// ---------- Diets ----------
const diets: Restriction[] = [
  {
    id: 'alpha-gal',
    name: 'Alpha gal',
    section: 'diets',
    kind: 'checklist',
    mostCommon: true,
    hint: 'New to Alpha Gal Allergy? Select all five options below to be safe. Otherwise, pick your triggers.',
    about:
      'Alpha-gal syndrome is an allergy to a sugar found in most mammals. Reactions can be triggered by red meat and mammal-derived products.',
    tags: [],
    items: [
      s('ag-meat', 'Mammalian meats', ['meat-red', 'pork'], 'Beef, pork, lamb, venison, and other mammal meats.'),
      s('ag-byproducts', 'Mammalian by-products', ['mammal'], 'Broths, fats, and flavorings derived from mammals.'),
      s('ag-dairy', 'Dairy products', ['dairy'], 'Milk and foods made from milk.'),
      s('ag-gelatin', 'Gelatin', ['gelatin'], 'Gelatin is usually made from pork or beef.'),
      s('ag-carrageenan', 'Carrageenan & algae', ['carrageenan'], 'Carrageenan contains alpha-gal and can trigger some people.'),
    ],
  },
  {
    id: 'anti-inflammatory',
    name: 'Anti-inflammatory diet',
    section: 'diets',
    kind: 'severity',
    voice: 'follow',
    phrase: 'an anti-inflammatory diet',
    about: 'Focuses on whole foods and limits added sugar, refined oils, and highly processed ingredients.',
    tags: ['sugar', 'seed-oil', 'additive', 'alcohol'],
  },
  {
    id: 'aip',
    name: 'Autoimmune protocol (AIP)',
    section: 'diets',
    kind: 'checklist',
    hint: 'New to AIP? Select all. Otherwise, pick your triggers.',
    about: 'The autoimmune protocol is an elimination diet designed to reduce inflammation.',
    tags: [],
    items: [
      s('aip-additives', 'AIP: additives & processed foods', ['additive', 'emulsifier', 'gum', 'color']),
      s('aip-alcohol', 'AIP: alcohol', ['alcohol']),
      s('aip-coffee', 'AIP: coffee', ['caffeine']),
      s('aip-dairy', 'AIP: dairy', ['dairy']),
      s('aip-eggs', 'AIP: eggs', ['egg']),
      s('aip-grains', 'AIP: grains', ['gluten', 'rice', 'corn', 'oats']),
      s('aip-legumes', 'AIP: legumes', ['legume', 'soy', 'peanut']),
      s('aip-nightshades', 'AIP: nightshades', ['nightshade', 'capsaicin']),
      s('aip-nuts', 'AIP: nuts', ['treenut']),
      s('aip-oils', 'AIP: processed oils', ['seed-oil']),
      s('aip-seeds', 'AIP: seeds & chocolate', ['seed', 'chocolate', 'sesame']),
      s('aip-sugar', 'AIP: sugar', ['sugar', 'sweetener']),
    ],
  },
  {
    id: 'breastfeeding',
    name: 'Breastfeeding',
    section: 'diets',
    kind: 'toggle',
    about: 'Flags ingredients commonly limited while breastfeeding, like alcohol and high-mercury fish.',
    tags: ['alcohol'],
  },
  {
    id: 'caffeine-free',
    name: 'Caffeine free',
    section: 'diets',
    kind: 'severity',
    voice: 'avoid',
    phrase: 'caffeine',
    about: 'Select to avoid coffee, tea, energy drinks, and other caffeinated ingredients.',
    tags: ['caffeine'],
  },
  {
    id: 'candida',
    name: 'Candida overgrowth',
    section: 'diets',
    kind: 'severity',
    voice: 'follow',
    phrase: 'a candida overgrowth diet',
    about: 'Limits sugar, yeast, and fermented foods that may feed candida.',
    tags: ['sugar', 'yeast', 'vinegar', 'alcohol'],
  },
  {
    id: 'citric-acid',
    name: 'Citric acid intolerance',
    section: 'diets',
    kind: 'severity',
    voice: 'avoid',
    phrase: 'citric acid',
    about: 'Select to avoid citric acid and ingredients that commonly contain it.',
    tags: ['citric'],
  },
  {
    id: 'emulsifier-free',
    name: 'Emulsifier free',
    section: 'diets',
    kind: 'radio',
    about: 'Select to avoid emulsifiers and other ingredients that may negatively impact the gut.',
    tags: [],
    items: [
      s('emul-all', 'All emulsifiers', ['emulsifier', 'emulsifier-gut'], 'Avoid every emulsifier, regardless of research.'),
      s(
        'emul-gut',
        'Emulsifiers with likely gut interactions',
        ['emulsifier-gut'],
        'Avoid emulsifiers where early studies suggest negative effects on the gut.',
      ),
    ],
  },
  {
    id: 'eoe',
    name: 'Eosinophilic esophagitis',
    section: 'diets',
    kind: 'checklist',
    hint: 'New to EoE six food elimination diet? Select all. Otherwise, pick your triggers.',
    about: 'EoE is a chronic allergic condition of the esophagus. Many people follow a six-food elimination diet.',
    tags: [],
    items: [
      s('eoe-dairy', 'Eosinophilic esophagitis dairy', ['dairy']),
      s('eoe-egg', 'Eosinophilic esophagitis egg', ['egg']),
      s('eoe-fish', 'Eosinophilic esophagitis fish', ['fish', 'shellfish']),
      s('eoe-nuts', 'Eosinophilic esophagitis nuts', ['treenut', 'peanut']),
      s('eoe-soy', 'Eosinophilic esophagitis soy', ['soy']),
      s('eoe-wheat', 'Eosinophilic esophagitis wheat', ['wheat', 'gluten']),
    ],
  },
  {
    id: 'fructose-free',
    name: 'Fructose free',
    section: 'diets',
    kind: 'severity',
    voice: 'avoid',
    phrase: 'fructose',
    about: 'Select to avoid fructose and high-fructose ingredients.',
    tags: ['fructose'],
  },
  {
    id: 'gerd',
    name: 'GERD',
    section: 'diets',
    kind: 'checklist',
    hint: "Don't know your GERD triggers? Select all. Otherwise, pick your triggers.",
    about: 'Gastroesophageal reflux disease can be aggravated by certain foods and drinks.',
    tags: [],
    items: [
      s('gerd-alcohol', 'Alcoholic drinks', ['alcohol']),
      s('gerd-caffeine', 'Caffeinated drinks', ['caffeine']),
      s('gerd-carbonated', 'Carbonated drinks', ['carbonated']),
      s('gerd-chocolate', 'Chocolates', ['chocolate']),
      s('gerd-citrus', 'Citrus fruits', ['citrus']),
      s('gerd-fatty', 'Fatty foods', ['fatty']),
      s('gerd-garlic', 'Garlic & onion', ['garlic-onion']),
      s('gerd-dairy', 'High fat dairy', ['dairy-fat']),
      s('gerd-spicy', 'Spicy foods', ['capsaicin', 'spice']),
      s('gerd-tomato', 'Tomato', ['tomato']),
      s('gerd-other', 'Other GERD triggers', ['mint']),
    ],
  },
  {
    id: 'gluten-free',
    name: 'Gluten free',
    section: 'diets',
    kind: 'severity',
    crossContact: true,
    voice: 'avoid',
    phrase: 'gluten',
    about: 'Select to avoid wheat, barley, rye, and any ingredient containing gluten.',
    tags: ['gluten'],
  },
  {
    id: 'gut-friendly',
    name: 'Gut friendly',
    section: 'diets',
    kind: 'severity',
    voice: 'follow',
    phrase: 'a gut friendly diet',
    about: 'Limits ingredients that commonly upset digestion, like sugar alcohols and gut-disrupting emulsifiers.',
    tags: ['polyol', 'emulsifier-gut'],
  },
  {
    id: 'ic',
    name: 'Interstitial cystitis',
    section: 'diets',
    kind: 'checklist',
    hint: "Don't know your IC triggers? Select all. Otherwise, pick your triggers.",
    about: 'Interstitial cystitis (painful bladder syndrome) symptoms can flare with certain foods.',
    tags: [],
    items: [
      s('ic-alcohol', 'IC: alcohol', ['alcohol']),
      s('ic-color', 'IC: artificial coloring', ['color']),
      s('ic-flavor', 'IC: artificial flavoring', ['artificial-flavor']),
      s('ic-sweetener', 'IC: artificial sweetener', ['sweetener']),
      s('ic-carbonated', 'IC: carbonated beverages', ['carbonated']),
      s('ic-chocolate', 'IC: chocolate', ['chocolate']),
      s('ic-citrus', 'IC: citrus & fruit', ['citrus', 'fruit']),
      s('ic-caffeine', 'IC: coffee, tea & caffeinated beverages', ['caffeine']),
      s('ic-soy', 'IC: soy', ['soy']),
      s('ic-spice', 'IC: spices & spicy foods', ['spice', 'capsaicin']),
      s('ic-tomato', 'IC: tomatoes', ['tomato']),
      s('ic-other', 'IC: other common triggers', ['msg', 'vinegar']),
    ],
  },
  {
    id: 'lactose-free',
    name: 'Lactose free',
    section: 'diets',
    kind: 'severity',
    voice: 'follow',
    phrase: 'a lactose free diet',
    about: 'Select to avoid lactose, the natural sugar found in milk.',
    tags: ['lactose'],
  },
  {
    id: 'latex-free',
    name: 'Latex free',
    section: 'diets',
    kind: 'severity',
    crossContact: true,
    voice: 'follow',
    phrase: 'a latex free diet',
    about: 'Latex-fruit syndrome can cause reactions to banana, avocado, kiwi, and chestnut.',
    tags: ['latex-fruit'],
  },
  {
    id: 'low-fodmap',
    name: 'Low FODMAP',
    section: 'diets',
    kind: 'checklist',
    mostCommon: true,
    hint: 'New to Low FODMAP? Select all six. Otherwise, pick your triggers.',
    about: 'FODMAPs are fermentable carbs that can trigger IBS symptoms.',
    tags: [],
    items: [
      s('fodmap-fructans', 'Fructans', ['fructan']),
      s('fodmap-fructose', 'Fructose', ['fructose']),
      s('fodmap-gos', 'GOS', ['gos']),
      s('fodmap-lactose', 'Lactose', ['lactose']),
      s('fodmap-mannitol', 'Mannitol', ['polyol']),
      s('fodmap-sorbitol', 'Sorbitol', ['polyol']),
    ],
  },
  {
    id: 'low-histamine',
    name: 'Low histamine',
    section: 'diets',
    kind: 'severity',
    voice: 'follow',
    phrase: 'a low histamine diet',
    about: 'Limits aged, fermented, and cured foods that are high in histamine.',
    tags: ['histamine'],
  },
  {
    id: 'low-iodine',
    name: 'Low iodine',
    section: 'diets',
    kind: 'severity',
    voice: 'follow',
    phrase: 'a low iodine diet',
    about: 'Limits iodized salt, seafood, seaweed, and dairy.',
    tags: ['iodine'],
  },
  {
    id: 'low-residue',
    name: 'Low residue',
    section: 'diets',
    kind: 'severity',
    voice: 'follow',
    phrase: 'a low residue diet',
    about: 'Limits high-fiber foods such as whole grains, seeds, and raw vegetables.',
    tags: ['fiber'],
  },
  {
    id: 'mediterranean',
    name: 'Mediterranean diet',
    section: 'diets',
    kind: 'severity',
    voice: 'follow',
    phrase: 'the Mediterranean diet',
    about: 'Emphasizes vegetables, legumes, whole grains, fish, and olive oil while limiting processed foods.',
    tags: ['additive', 'sugar'],
  },
  {
    id: 'mold-detox',
    name: 'Mold detox',
    section: 'diets',
    kind: 'severity',
    voice: 'follow',
    phrase: 'a mold detox diet',
    about: 'Limits foods prone to mold and mycotoxins, like peanuts, corn, and aged cheese.',
    tags: ['mold'],
  },
  {
    id: 'oas',
    name: 'Oral allergy syndrome',
    section: 'diets',
    kind: 'checklist',
    about: 'Oral allergy syndrome is a reaction to raw fruits and vegetables that share proteins with pollen.',
    tags: [],
    items: [
      s('oas-alder', 'Alder pollen', ['pollen-alder']),
      s('oas-birch', 'Birch pollen', ['pollen-birch']),
      s('oas-grass', 'Grass pollen', ['pollen-grass']),
      s('oas-mugwort', 'Mugwort weed pollen', ['pollen-mugwort']),
      s('oas-ragweed', 'Ragweed pollen', ['pollen-ragweed']),
    ],
  },
  {
    id: 'paleo',
    name: 'Paleo',
    section: 'diets',
    kind: 'severity',
    voice: 'follow',
    phrase: 'a paleo diet',
    about: 'Avoids grains, legumes, dairy, refined sugar, and processed oils.',
    tags: ['gluten', 'rice', 'corn', 'oats', 'legume', 'soy', 'peanut', 'dairy', 'sugar', 'seed-oil'],
  },
  {
    id: 'pescatarian',
    name: 'Pescatarian',
    section: 'diets',
    kind: 'severity',
    voice: 'follow',
    phrase: 'a pescatarian diet',
    about: 'Avoids meat and poultry but includes fish and seafood.',
    tags: ['meat-red', 'pork', 'poultry', 'gelatin', 'mammal'],
  },
  {
    id: 'pcos',
    name: 'Polycystic ovary syndrome (PCOS)',
    section: 'diets',
    kind: 'severity',
    voice: 'follow',
    phrase: 'a PCOS-friendly diet',
    about: 'Focuses on blood sugar balance by limiting added sugars and refined carbs.',
    tags: ['sugar'],
  },
  {
    id: 'pregnancy',
    name: 'Pregnancy',
    section: 'diets',
    kind: 'toggle',
    about: 'Flags ingredients commonly limited during pregnancy, like alcohol and high-mercury fish.',
    tags: ['alcohol'],
  },
  {
    id: 'seed-oil-free',
    name: 'Seed oil free',
    section: 'diets',
    kind: 'severity',
    voice: 'avoid',
    phrase: 'seed oils',
    about: 'Select to avoid canola, soybean, sunflower, and other industrial seed oils.',
    tags: ['seed-oil'],
  },
  {
    id: 'vegan',
    name: 'Vegan',
    section: 'diets',
    kind: 'severity',
    voice: 'follow',
    phrase: 'a vegan diet',
    about: 'Avoids all animal products, including meat, fish, dairy, eggs, and honey.',
    tags: ['meat-red', 'pork', 'poultry', 'fish', 'shellfish', 'dairy', 'egg', 'honey', 'gelatin', 'mammal'],
  },
  {
    id: 'vegetarian',
    name: 'Vegetarian',
    section: 'diets',
    kind: 'severity',
    voice: 'follow',
    phrase: 'a vegetarian diet',
    about: 'Avoids meat, poultry, and fish.',
    tags: ['meat-red', 'pork', 'poultry', 'fish', 'shellfish', 'gelatin', 'mammal'],
  },
  {
    id: 'wfpb',
    name: 'Whole Foods Plant Based (WFPB)',
    section: 'diets',
    kind: 'severity',
    voice: 'follow',
    phrase: 'a whole-foods plant-based diet',
    about: 'Centers on minimally processed plant foods and avoids animal products, refined sugar, and oils.',
    tags: ['meat-red', 'pork', 'poultry', 'fish', 'shellfish', 'dairy', 'egg', 'gelatin', 'sugar', 'seed-oil', 'additive'],
  },
  {
    id: 'thirty-days',
    name: '30 whole days',
    section: 'diets',
    kind: 'severity',
    voice: 'follow',
    phrase: 'a 30 whole days diet',
    about: 'A 30-day reset that removes sugar, grains, legumes, dairy, and alcohol.',
    tags: ['sugar', 'sweetener', 'gluten', 'rice', 'corn', 'oats', 'legume', 'soy', 'peanut', 'dairy', 'alcohol'],
  },
];

// ---------- Allergens & avoidances ----------
const avoid = (id: string, name: string, phrase: string, tags: string[], about?: string): Restriction => ({
  id,
  name,
  section: 'allergens',
  kind: 'severity',
  voice: 'avoid',
  phrase,
  tags,
  about: about ?? `Select if you'd like to avoid any food that has ${phrase}.`,
});
const allergen = (id: string, name: string, phrase: string, tags: string[]): Restriction => ({
  ...avoid(id, name, phrase, tags),
  crossContact: true,
});
const group = (id: string, name: string, items: SubItem[], about?: string): Restriction => ({
  id,
  name,
  section: 'allergens',
  kind: 'checklist',
  items,
  tags: [],
  about: about ?? `Pick the ${name.toLowerCase()} you avoid.`,
});

const allergens: Restriction[] = [
  avoid('added-salt', 'Added salt', 'added salt', ['salt']),
  avoid('added-sugar', 'Added sugar', 'added sugar', ['sugar'], "Select if you'd like to completely avoid any food that has added sugar."),
  avoid('alcohol', 'Alcohol', 'alcohol', ['alcohol']),
  avoid(
    'artificial-flavors',
    'Artificial flavors',
    'artificial flavors',
    ['artificial-flavor'],
    'Select to avoid artificial flavors, which are flavoring substances made in a lab.',
  ),
  group(
    'food-coloring',
    'Artificial food coloring',
    [
      s('blue-1', 'Blue #1', ['color']),
      s('blue-2', 'Blue #2', ['color']),
      s('green-3', 'Green #3', ['color']),
      s('red-3', 'Red #3', ['color']),
      s('red-40', 'Red #40', ['color']),
      s('yellow-5', 'Yellow #5', ['color']),
      s('yellow-6', 'Yellow #6', ['color']),
      s('other-colors', 'Other artificial colors', ['color']),
    ],
    'Select to avoid artificial food coloring which are chemical substances used to color foods.',
  ),
  allergen('barley', 'Barley', 'barley', ['barley', 'gluten']),
  allergen('capsaicin', 'Capsaicin (peppers)', 'capsaicin (peppers)', ['capsaicin']),
  group('celery', 'Celery', [s('celeriac', 'Celeriac', ['celery']), s('celery-stalk', 'Celery', ['celery'])]),
  allergen('chocolate', 'Chocolate', 'chocolate', ['chocolate']),
  allergen('citrus', 'Citrus fruit', 'citrus fruit', ['citrus']),
  group(
    'common-additives',
    'Common additives',
    [
      s('azodicarbonamide', 'Azodicarbonamide', ['additive']),
      s('bha-bht', 'BHA & BHT', ['additive']),
      s('bvo', 'Brominated vegetable oil', ['additive']),
      s('hfcs', 'High fructose corn syrup', ['hfcs']),
      s('hydrogenated', 'Hydrogenated vegetable oils', ['additive']),
      s('msg', 'MSG', ['msg']),
      s('nitrates', 'Nitrates & nitrites', ['nitrate']),
      s('parabens', 'Parabens', ['additive']),
      s('potassium-bromate', 'Potassium bromate', ['additive']),
      s('sodium-benzoate', 'Sodium benzoate', ['additive']),
      s('sulfites', 'Sulfites', ['sulfite']),
    ],
    'Select to avoid common additives that are restricted or controversial in many countries.',
  ),
  allergen('corn', 'Corn', 'corn', ['corn']),
  allergen('eggs', 'Eggs', 'eggs', ['egg']),
  group('fish', 'Fish', [s('fish-all', 'All fish', ['fish']), s('fish-oil', 'Fish oil', ['fish']), s('anchovy', 'Anchovy', ['fish'])]),
  group('fruits', 'Fruits', [
    s('apple', 'Apple', ['fruit']),
    s('banana', 'Banana', ['fruit', 'latex-fruit']),
    s('berries', 'Berries', ['fruit']),
    s('stone-fruit', 'Stone fruit', ['fruit']),
    s('tropical', 'Tropical fruit', ['fruit']),
  ]),
  allergen('garlic-onion', 'Garlic & onion', 'garlic & onion', ['garlic-onion']),
  group('gums', 'Gums & thickeners', [
    s('guar', 'Guar gum', ['gum']),
    s('xanthan', 'Xanthan gum', ['gum']),
    s('carrageenan-g', 'Carrageenan', ['carrageenan']),
    s('gellan', 'Gellan gum', ['gum']),
  ]),
  avoid('herbs', 'Herbs', 'herbs', ['herb']),
  avoid('honey', 'Honey', 'honey', ['honey']),
  group('legumes', 'Legumes', [
    s('beans', 'Beans', ['legume']),
    s('lentils', 'Lentils', ['legume']),
    s('peas', 'Peas', ['legume']),
    s('chickpeas', 'Chickpeas', ['legume']),
  ]),
  allergen('lupin', 'Lupin', 'lupin', ['lupin']),
  allergen('milk', 'Milk (dairy)', 'milk (dairy)', ['dairy', 'lactose']),
  allergen('mushrooms', 'Mushrooms', 'mushrooms', ['mushroom']),
  allergen('mustard', 'Mustard', 'mustard', ['mustard']),
  avoid('nickel', 'Nickel allergy', 'nickel', ['nickel']),
  group('nightshades', 'Nightshades', [
    s('tomato-n', 'Tomato', ['tomato', 'nightshade']),
    s('potato', 'Potato', ['nightshade']),
    s('peppers-n', 'Peppers', ['nightshade', 'capsaicin']),
    s('eggplant', 'Eggplant', ['nightshade']),
  ]),
  allergen('oats', 'Oats', 'oats', ['oats']),
  allergen('peanut', 'Peanut', 'peanut', ['peanut']),
  allergen('poultry', 'Poultry', 'poultry', ['poultry']),
  allergen('red-meat', 'Red meat', 'red meat', ['meat-red', 'pork']),
  allergen('rice', 'Rice', 'rice', ['rice']),
  allergen('rye', 'Rye', 'rye', ['rye', 'gluten']),
  group('seeds', 'Seeds', [
    s('sunflower', 'Sunflower seeds', ['seed']),
    s('pumpkin', 'Pumpkin seeds', ['seed']),
    s('chia', 'Chia seeds', ['seed']),
    s('flax', 'Flax seeds', ['seed']),
  ]),
  allergen('sesame', 'Sesame', 'sesame', ['sesame']),
  group('shellfish', 'Shellfish', [s('crustaceans', 'Crustaceans', ['shellfish']), s('mollusks', 'Mollusks', ['shellfish'])]),
  allergen('soy', 'Soy', 'soy', ['soy']),
  avoid('spices', 'Spices', 'spices', ['spice']),
  group(
    'sweeteners',
    'Sweeteners',
    [
      s('acesulfame', 'Acesulfame / sunett', ['sweetener']),
      s('allulose', 'Allulose', ['sweetener']),
      s('aspartame', 'Aspartame / equal', ['sweetener']),
      s('monk-fruit', 'Monk fruit', ['sweetener']),
      s('saccharin', "Saccharin / sweet n' low", ['sweetener']),
      s('stevia', 'Stevia / truvia', ['sweetener']),
      s('sucralose', 'Sucralose / splenda', ['sweetener']),
      s('sugar-alcohols', 'Sugar alcohols', ['polyol']),
    ],
    'Select to avoid low- and no-calorie sweeteners, natural and artificial.',
  ),
  group('tree-nut', 'Tree nut', [
    s('almond', 'Almond', ['treenut']),
    s('cashew', 'Cashew', ['treenut']),
    s('walnut', 'Walnut', ['treenut']),
    s('pistachio', 'Pistachio', ['treenut']),
    s('pecan', 'Pecan', ['treenut']),
    s('hazelnut', 'Hazelnut', ['treenut']),
    s('coconut', 'Coconut', ['coconut']),
  ]),
  avoid('vegetables', 'Vegetables', 'vegetables', ['vegetable']),
  avoid('vinegar', 'Vinegar', 'vinegar', ['vinegar']),
  allergen('wheat', 'Wheat', 'wheat', ['wheat', 'gluten']),
  avoid('yeast', 'Yeast', 'yeast', ['yeast']),
];

// ---------- Medical conditions ----------
const condition = (id: string, name: string, tags: string[], short?: string): Restriction => ({
  id,
  name,
  section: 'conditions',
  kind: 'severity',
  voice: 'follow',
  phrase: `a ${short ?? name.replace(/ \(.*\)/, '')}-friendly diet`,
  tags,
  about: `Flags ingredients commonly limited by people managing ${name}. Always follow your care team's advice.`,
});

const conditions: Restriction[] = [
  condition('alzheimers', "Alzheimer's Disease", ['sugar', 'additive']),
  condition('arthritis', 'Arthritis', ['sugar', 'seed-oil']),
  condition('celiac', 'Celiac Disease', ['gluten'], 'celiac'),
  condition('cirs', 'Chronic Inflammatory Response Syndrome (CIRS)', ['sugar', 'mold'], 'CIRS'),
  condition('crohns', "Crohn's Disease", ['fiber', 'emulsifier-gut'], "Crohn's"),
  condition('diabetes-2', 'Diabetes (Type 2)', ['sugar'], 'diabetes'),
  condition('diverticulitis', 'Diverticulitis', ['seed']),
  condition('eczema', 'Eczema', ['dairy', 'egg']),
  condition('endometriosis', 'Endometriosis', ['sugar', 'alcohol']),
  condition('nafld', 'Fatty Liver Disease (NAFLD)', ['sugar', 'fructose', 'alcohol'], 'liver'),
  condition('glp1', 'GLP-1 Support', ['sugar', 'fatty'], 'GLP-1'),
  condition('galactosemia', 'Galactosemia', ['dairy', 'lactose']),
  condition('gout', 'Gout', ['alcohol', 'fructose', 'meat-red']),
  condition('graves', "Graves' Disease", ['iodine'], "Graves'"),
  condition('hashimotos', "Hashimoto's Thyroiditis", ['gluten', 'iodine'], "Hashimoto's"),
  condition('heart', 'Heart Disease', ['salt', 'sugar', 'fatty'], 'heart'),
  condition('cholesterol', 'High Cholesterol', ['fatty'], 'cholesterol'),
  condition('histamine-intolerance', 'Histamine Intolerance', ['histamine'], 'histamine'),
  condition('ibd', 'Inflammatory Bowel Disease (IBD)', ['emulsifier-gut', 'fiber'], 'IBD'),
  condition('insulin-resistance', 'Insulin Resistance', ['sugar'], 'blood sugar'),
  condition('ibs', 'Irritable Bowel Syndrome (IBS)', ['fructan', 'polyol', 'lactose'], 'IBS'),
  condition('lupus', 'Lupus (Systemic Lupus Erythematosus)', ['sugar', 'salt'], 'lupus'),
  condition('mcas', 'Mast Cell Activation Syndrome (MCAS)', ['histamine', 'alcohol'], 'MCAS'),
  condition('metabolic', 'Metabolic Syndrome', ['sugar', 'salt']),
  condition('ncgs', 'Non-Celiac Gluten Sensitivity', ['gluten'], 'gluten-sensitivity'),
  condition('obesity', 'Obesity (Weight Loss)', ['sugar', 'fatty'], 'weight loss'),
  condition('osteoarthritis', 'Osteoarthritis', ['sugar']),
  condition('osteoporosis', 'Osteoporosis', ['salt', 'caffeine']),
  condition('psoriasis', 'Psoriasis', ['alcohol', 'gluten']),
  condition('psoriatic-arthritis', 'Psoriatic Arthritis', ['alcohol', 'sugar']),
  condition('ra', 'Rheumatoid Arthritis', ['sugar', 'seed-oil'], 'RA'),
  condition('sibo', 'Small Intestinal Bacterial Overgrowth (SIBO)', ['fructan', 'polyol', 'gos'], 'SIBO'),
  condition('stroke', 'Stroke', ['salt', 'fatty']),
  condition('thyroid-cancer', 'Thyroid Cancer', ['iodine'], 'thyroid'),
  condition('uc', 'Ulcerative Colitis', ['emulsifier-gut', 'fiber'], 'colitis'),
];

export const RESTRICTIONS: Restriction[] = [...diets, ...allergens, ...conditions];
export const RESTRICTION_BY_ID: Record<string, Restriction> = Object.fromEntries(RESTRICTIONS.map((r) => [r.id, r]));

export const SECTION_TITLES: Record<Section, string> = {
  diets: 'Diets',
  allergens: 'Allergens & Avoidances',
  conditions: 'Medical Conditions',
};

export const LEVEL_LABEL: Record<Level, string> = {
  severe: 'Severe',
  intolerance: 'Intolerance',
  preference: 'Preference',
};

export function levelOptions(r: Restriction): { level: Level; title: string; body: string; linkCrossContact?: 'notOk' | 'ok' }[] {
  const p = r.phrase ?? r.name.toLowerCase();
  if (r.voice === 'follow') {
    if (r.crossContact) {
      return [
        { level: 'severe', title: 'Severe', body: `I strictly follow ${p} and `, linkCrossContact: 'notOk' },
        { level: 'intolerance', title: 'Intolerance', body: `I strictly follow ${p} but `, linkCrossContact: 'ok' },
        { level: 'preference', title: 'Preference', body: `I loosely follow ${p}.` },
      ];
    }
    return [
      { level: 'intolerance', title: 'Intolerance', body: `I strictly follow ${p}.` },
      { level: 'preference', title: 'Preference', body: `I loosely follow ${p}.` },
    ];
  }
  if (r.crossContact) {
    return [
      { level: 'severe', title: 'Severe', body: `I must avoid ${p} and `, linkCrossContact: 'notOk' },
      { level: 'intolerance', title: 'Intolerance', body: `I must avoid ${p} but `, linkCrossContact: 'ok' },
      { level: 'preference', title: 'Preference', body: `I try to limit ${p}.` },
    ];
  }
  return [
    { level: 'intolerance', title: 'Intolerance', body: `I must avoid ${p}.` },
    { level: 'preference', title: 'Preference', body: `I try to limit ${p}.` },
  ];
}

/** Tags a selection blocks. */
export function selectionTags(r: Restriction, sel: Selection): string[] {
  if (r.kind === 'checklist' || r.kind === 'radio') {
    const chosen = new Set(sel.items ?? []);
    return (r.items ?? []).filter((i) => chosen.has(i.id)).flatMap((i) => i.tags);
  }
  return r.tags;
}

/** Severity used for ratings. Checklists/radios/toggles count as intolerance unless set. */
export function effectiveLevel(r: Restriction, sel: Selection): Level {
  if (sel.level) return sel.level;
  return 'intolerance';
}
