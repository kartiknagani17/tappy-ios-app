// Starter ingredient database. Each line: "Name|tag,tag". Replace with your real catalog/API.
const RAW = `
Acacia (arabic gum)|gum,emulsifier
Acai|fruit
Acai juice|fruit,fructose
Acai juice concentrate|fruit,fructose,sugar
Acerola|fruit
Acerola juice|fruit
Acerola powder|fruit
Acesulfame potassium|sweetener
Acetic acid|vinegar
Acid casein|dairy
Ackee|fruit
Activated cashew|treenut
Activated pistachio|treenut
Adipic acid|additive
Agar|gum
Agave|sugar,fructose
Alanine|
Albumen|egg
Albumin|egg
Alcohol|alcohol
Alfalfa|vegetable
Allspice|spice
Allulose|sweetener
Almond|treenut,latex-fruit
Almond butter|treenut
Almond flour|treenut
Almond milk|treenut
Amaranth|fiber
Anchovy|fish,histamine,iodine
Annatto|color
Apple|fruit,fructose,polyol,pollen-birch
Apple cider vinegar|vinegar,histamine
Apple juice concentrate|fruit,fructose,sugar
Apricot|fruit,polyol,pollen-birch
Arrowroot|
Artichoke|vegetable,fructan
Artificial flavor|artificial-flavor
Ascorbic acid|
Asparagus|vegetable,fructan
Aspartame|sweetener
Avocado|fruit,latex-fruit,histamine,polyol
Avocado oil|
Azodicarbonamide|additive
Bacon|pork,meat-red,nitrate,salt,fatty,mammal
Baking soda|
Banana|fruit,latex-fruit,pollen-ragweed
Barley|barley,gluten,fiber
Barley malt|barley,gluten,sugar
Basil|herb
Bay leaf|herb
Beef|meat-red,mammal
Beef broth|meat-red,mammal,salt
Beef gelatin|gelatin,mammal
Beer|alcohol,gluten,barley,yeast,histamine
Beet sugar|sugar
Beeswax|
Bell pepper|nightshade,vegetable
BHA|additive
BHT|additive
Black beans|legume,gos,fiber
Black pepper|spice
Blue 1|color
Blue 2|color
Blueberry|fruit
Brazil nut|treenut
Bread crumbs|wheat,gluten,yeast
Brewer's yeast|yeast
Broccoli|vegetable,fiber
Brominated vegetable oil|additive
Brown rice|rice,fiber
Brown rice syrup|rice,sugar
Brown sugar|sugar
Buckwheat|fiber
Butter|dairy,dairy-fat,lactose,fatty
Buttermilk|dairy,lactose
Cacao|chocolate,caffeine
Caffeine|caffeine
Calcium carbonate|
Calcium propionate|additive
Cane sugar|sugar
Canola oil|seed-oil
Caramel color|color,sugar
Carbonated water|carbonated
Carnauba wax|
Carob|
Carrageenan|carrageenan,emulsifier,emulsifier-gut
Carrot|vegetable,pollen-birch
Casein|dairy
Cashew|treenut,gos
Cauliflower|vegetable,polyol
Cayenne pepper|capsaicin,spice,nightshade
Celery|celery,vegetable,polyol,pollen-mugwort
Celery seed|celery,seed,spice
Cellulose gum|gum,emulsifier,emulsifier-gut
Cheddar cheese|dairy,dairy-fat,histamine,mold
Cherry|fruit,polyol,pollen-birch
Chia seeds|seed,fiber
Chicken|poultry
Chicken broth|poultry,salt
Chickpeas|legume,gos,fiber
Chicory root|fructan,fiber
Chili powder|capsaicin,spice,nightshade
Chocolate|chocolate,caffeine,sugar
Cinnamon|spice
Citric acid|citric
Clove|spice
Cocoa butter|chocolate
Cocoa powder|chocolate,caffeine
Coconut|coconut
Coconut milk|coconut,emulsifier-gut
Coconut oil|coconut
Coconut sugar|sugar
Cod|fish,iodine
Coffee|caffeine
Corn|corn,mold
Corn starch|corn
Corn syrup|corn,sugar
Cornmeal|corn
Cottonseed oil|seed-oil
Crab|shellfish,iodine
Cream|dairy,dairy-fat,lactose
Cream cheese|dairy,dairy-fat,lactose
Cucumber|vegetable,pollen-ragweed
Cumin|spice
Curcumin|spice
Dates|fruit,fructan,sugar
DATEM|emulsifier
Dextrose|sugar
Dill|herb
Disodium inosinate|msg
Dried cranberries|fruit,sugar
Egg|egg
Egg white|egg
Egg yolk|egg
Eggplant|nightshade,vegetable,histamine
Erythritol|polyol,sweetener
Fava beans|legume,gos
Fennel|vegetable,pollen-mugwort
Fish oil|fish
Fish sauce|fish,histamine,salt
Flaxseed|seed,fiber
Fructose|fructose,sugar
Garlic|garlic-onion,fructan
Garlic powder|garlic-onion,fructan
Gelatin|gelatin,mammal
Gellan gum|gum,emulsifier
Ginger|spice
Glucose syrup|sugar
Glycerin|
Goat milk|dairy,lactose
Grapefruit|citrus,fruit
Grapes|fruit
Green 3|color
Green tea|caffeine
Guar gum|gum,emulsifier
Ham|pork,meat-red,nitrate,salt,mammal
Hazelnut|treenut,pollen-birch
Hemp seeds|seed
High fructose corn syrup|hfcs,fructose,sugar,corn
Honey|honey,sugar,fructose
Hot sauce|capsaicin,vinegar,spice
Hydrogenated oil|additive,fatty
Inulin|fructan,fiber
Iodized salt|salt,iodine
Kale|vegetable,fiber
Kelp|iodine
Ketchup|tomato,nightshade,sugar,vinegar
Kidney beans|legume,gos
Kiwi|fruit,latex-fruit,pollen-birch
Kombucha|histamine,caffeine,yeast,vinegar
Lactic acid|
Lactose|lactose,dairy
Lamb|meat-red,mammal
Lard|pork,mammal,fatty
Lecithin|emulsifier
Lemon|citrus,fruit
Lemon juice|citrus,citric
Lentils|legume,gos,fiber
Lime|citrus,fruit
Lobster|shellfish
Lupin flour|lupin,legume
Maltitol|polyol,sweetener
Maltodextrin|corn
Mango|fruit,fructose
Maple syrup|sugar
Margarine|seed-oil,dairy
Mayonnaise|egg,seed-oil
Milk|dairy,lactose,iodine
Milk chocolate|chocolate,dairy,lactose,sugar
Mint|herb,mint
Miso|soy,histamine,salt
Molasses|sugar
Monk fruit extract|sweetener
Mono and diglycerides|emulsifier
Monosodium glutamate|msg
Mozzarella|dairy,lactose
Mushroom|mushroom,polyol
Mussels|shellfish
Mustard|mustard
Mustard seed|mustard,seed
Natural flavor|
Nutmeg|spice
Nutritional yeast|yeast
Oat flour|oats,fiber
Oats|oats,fiber
Olive oil|
Olives|fruit,histamine
Onion|garlic-onion,fructan
Onion powder|garlic-onion,fructan
Orange|citrus,fruit,fructose
Orange juice|citrus,fructose
Oregano|herb
Oyster|shellfish,iodine
Palm oil|fatty
Paprika|capsaicin,nightshade,spice
Parmesan|dairy,histamine,salt
Parsley|herb,pollen-mugwort
Pea protein|legume
Peach|fruit,polyol,pollen-birch
Peanut|peanut,legume,mold
Peanut butter|peanut,legume,mold
Peanut oil|peanut
Pear|fruit,fructose,polyol,pollen-birch
Peas|legume,gos
Pecan|treenut
Pepperoni|pork,meat-red,nitrate,salt,capsaicin
Pineapple|fruit
Pistachio|treenut,fructan
Polysorbate 80|emulsifier,emulsifier-gut
Pork|pork,meat-red,mammal
Potassium bromate|additive
Potassium sorbate|additive
Potato|nightshade,vegetable
Potato starch|nightshade
Propylparaben|additive
Pumpkin seeds|seed
Quinoa|fiber
Raisins|fruit,sugar,fructan
Rapeseed oil|seed-oil
Raspberry|fruit
Red 3|color
Red 40|color
Red wine|alcohol,histamine,sulfite
Rice|rice
Rice bran oil|seed-oil,rice
Rice flour|rice
Rosemary|herb
Rye flour|rye,gluten
Saccharin|sweetener
Safflower oil|seed-oil
Salmon|fish,iodine
Salt|salt
Sardines|fish,histamine
Sauerkraut|histamine,vinegar
Sea salt|salt
Seaweed|iodine
Sesame oil|sesame
Sesame seeds|sesame,seed
Shrimp|shellfish,iodine
Sodium benzoate|additive
Sodium nitrite|nitrate
Sorbitol|polyol,sweetener
Sour cream|dairy,lactose,dairy-fat
Soy lecithin|soy,emulsifier
Soy protein isolate|soy
Soy sauce|soy,wheat,gluten,salt,histamine
Soybean oil|seed-oil,soy
Soybeans|soy,legume
Spelt|wheat,gluten
Spinach|vegetable,histamine
Stevia|sweetener
Strawberry|fruit,histamine
Sucralose|sweetener
Sugar|sugar
Sunflower lecithin|emulsifier,seed
Sunflower oil|seed-oil
Sunflower seeds|seed
Tahini|sesame
Tapioca|
Tea|caffeine
Tempeh|soy,legume
Thyme|herb
Titanium dioxide|color,additive
Tofu|soy,legume
Tomato|tomato,nightshade,histamine,pollen-grass
Tomato paste|tomato,nightshade
Tuna|fish,histamine,iodine
Turkey|poultry
Turmeric|spice
Vanilla extract|alcohol
Vegetable oil|seed-oil
Vinegar|vinegar
Walnut|treenut
Watermelon|fruit,fructose,polyol,pollen-ragweed
Wheat flour|wheat,gluten
Wheat gluten|wheat,gluten
Wheat starch|wheat,gluten
Whey|dairy,lactose
Whey protein|dairy
White wine|alcohol,sulfite
Whole wheat flour|wheat,gluten,fiber
Xanthan gum|gum,emulsifier
Xylitol|polyol,sweetener
Yeast|yeast
Yeast extract|yeast,msg
Yellow 5|color
Yellow 6|color
Yogurt|dairy,lactose,histamine
Zucchini|vegetable
`;

export type Ingredient = { id: string; name: string; tags: string[] };

export const INGREDIENTS: Ingredient[] = RAW.trim()
  .split('\n')
  .map((line) => {
    const [name, tags = ''] = line.split('|');
    return {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name,
      tags: tags.split(',').filter(Boolean),
    };
  });
